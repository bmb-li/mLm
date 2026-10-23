#!/usr/bin/env node
/**
 * End-to-end API capability tests for the mLm local server.
 *
 * Covers the paths an agent framework typically uses:
 *   - health / model discovery
 *   - multi-turn context
 *   - streaming (including reasoning separation)
 *   - tool call -> tool result -> final answer loops
 *   - multi-step automated tasks
 *   - concurrent requests
 *   - immediate SSE headers / keep-alive
 *   - Ollama-compatible endpoints
 *   - client abort recovery and invalid requests
 *
 * Usage (with `adb forward tcp:18889 tcp:8889`):
 *   node scripts/api-e2e.mjs
 *   node scripts/api-e2e.mjs --base http://127.0.0.1:18889 \
 *     --model MiniCPM5-1B-ASHQ1-Quality-36pc \
 *     --tool-model Qwen3.5-0.8B-ab.i1-Q4_K_M
 *
 * Add `--slow` to also verify the periodic SSE keep-alive during a long
 * prompt prefill (takes ~10-60s depending on the device).
 *
 * Exit code is non-zero when a required test fails.
 */
import net from 'node:net'
import process from 'node:process'

const args = parseArgs(process.argv.slice(2))
const BASE = (args.base || process.env.API_BASE || 'http://127.0.0.1:18889').replace(/\/$/, '')
const REQUEST_TIMEOUT = Number(args.timeout || 300000)
const MAX_TOKENS = Number(args['max-tokens'] || 128)

// Deterministic tests do not need the model's chain-of-thought. Models that
// ignore this flag still get a generous max_tokens below.
const NO_THINK = { enable_thinking: false, chat_template_kwargs: { enable_thinking: false } }
const results = []

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (!item.startsWith('--')) continue
    const key = item.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function run(name, fn) {
  const started = Date.now()
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail, ms: Date.now() - started })
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ''}`)
  } catch (error) {
    results.push({ name, ok: false, error: error.message, ms: Date.now() - started })
    console.log(`FAIL  ${name}: ${error.message}`)
  }
}

const TARGET = new URL(BASE)

/**
 * Send a raw HTTP/1.1 exchange. Used for protocol-level cases that fetch()
 * normalises away (chunked request bodies, Expect: 100-continue).
 */
function rawExchange({ headers, body }, { waitForContinue = false, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({
      host: TARGET.hostname,
      port: Number(TARGET.port || 80),
    })
    let buffer = ''
    let bodySent = !waitForContinue
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('raw request timed out'))
    }, timeout)

    socket.on('connect', () => {
      socket.write(waitForContinue ? headers : headers + body)
    })

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8')

      if (waitForContinue && !bodySent && buffer.includes('100 Continue')) {
        bodySent = true
        buffer = buffer.replace(/HTTP\/1\.1 100 Continue\r\n\r\n/, '')
        socket.write(body)
      }

      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const headerText = buffer.slice(0, headerEnd)
      const lengthMatch = headerText.match(/content-length:\s*(\d+)/i)
      if (!lengthMatch) return
      const completeAt = headerEnd + 4 + Number(lengthMatch[1])
      if (buffer.length < completeAt) return

      clearTimeout(timer)
      socket.destroy()
      resolve(buffer)
    })

    socket.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

/**
 * Send several requests sequentially over one keep-alive connection.
 * Returns the response status lines.
 */
function rawKeepAlive(requests, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({
      host: TARGET.hostname,
      port: Number(TARGET.port || 80),
    })
    const statuses = []
    let buffer = ''
    let index = 0

    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`keep-alive timed out after ${statuses.length} response(s)`))
    }, timeout)

    const sendNext = () => {
      if (index >= requests.length) {
        clearTimeout(timer)
        socket.destroy()
        resolve(statuses)
        return
      }
      socket.write(requests[index])
    }

    socket.on('connect', sendNext)

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8')
      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) return
        const headerText = buffer.slice(0, headerEnd)
        const lengthMatch = headerText.match(/content-length:\s*(\d+)/i)
        if (!lengthMatch) return
        const completeAt = headerEnd + 4 + Number(lengthMatch[1])
        if (buffer.length < completeAt) return

        statuses.push(headerText.split('\r\n')[0])
        buffer = buffer.slice(completeAt)
        index++
        sendNext()
      }
    })

    socket.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function api(path, body, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal || AbortSignal.timeout(REQUEST_TIMEOUT),
  })
  return response
}

async function json(path, body, options) {
  const response = await api(path, body, options)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
  }
  return JSON.parse(text)
}

async function chat(messages, extra = {}, options = {}) {
  return json('/v1/chat/completions', {
    model: extra.model || args.model,
    messages,
    stream: false,
    max_tokens: MAX_TOKENS,
    ...extra,
  }, options)
}

function assistantContent(response) {
  return response?.choices?.[0]?.message?.content || ''
}

async function collectSSE(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let raw = ''
  const events = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    raw += text
    buffer += text

    let boundary
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        if (data === '[DONE]') {
          events.push({ done: true })
          continue
        }
        try {
          events.push(JSON.parse(data))
        } catch {
          // Ignore malformed chunks; the assertions below catch real breakage.
        }
      }
    }
  }

  return { events, raw }
}

async function streamChat(messages, extra = {}) {
  const response = await api('/v1/chat/completions', {
    model: extra.model || args.model,
    messages,
    stream: true,
    max_tokens: MAX_TOKENS,
    ...extra,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }
  const { events, raw } = await collectSSE(response)

  let content = ''
  let reasoning = ''
  let finish = null
  let sawDone = false
  const toolCalls = []
  for (const event of events) {
    if (event.done) {
      sawDone = true
      continue
    }
    const choice = event.choices?.[0]
    if (!choice) continue
    if (choice.delta?.content) content += choice.delta.content
    if (choice.delta?.reasoning_content) reasoning += choice.delta.reasoning_content
    if (choice.delta?.tool_calls) toolCalls.push(...choice.delta.tool_calls)
    if (choice.finish_reason) finish = choice.finish_reason
  }

  return { events, raw, content, reasoning, toolCalls, finish, sawDone }
}

async function main() {
  console.log(`API:   ${BASE}`)
  console.log(`Model: ${args.model || '(auto)'}`)
  console.log('')

  let model = args.model
  let toolModel = args['tool-model'] || args.model

  await run('GET /api/status', async () => {
    const status = await json('/api/status')
    assert(status?.server?.isRunning === true, 'server is not running')
    return status.server.url
  })

  await run('GET /v1/models', async () => {
    const payload = await json('/v1/models')
    assert(Array.isArray(payload.data) && payload.data.length > 0, 'no models returned')
    if (!model) model = payload.data[0].id
    if (!toolModel) toolModel = model
    assert(payload.data.some(m => m.id === model), `model ${model} is not in /v1/models`)
    return `${payload.data.length} model(s)`
  })

  if (!model) {
    console.log('FAIL  no model available')
    process.exit(1)
  }

  await run('GET /health + /api/version', async () => {
    const health = await json('/health')
    assert(health.status === 'ok', 'health check failed')
    const version = await json('/api/version')
    assert(typeof version.version === 'string' && version.version.length > 0, 'missing version')
    return `v${version.version}`
  })

  await run('multi-turn context', async () => {
    const code = `ZX-${Math.floor(Math.random() * 9000) + 1000}`
    const first = await chat([
      { role: 'system', content: 'You are a terse assistant. Follow instructions exactly.' },
      { role: 'user', content: `Remember this code: ${code}. Reply with OK only.` },
    ], { ...NO_THINK, max_tokens: 512, temperature: 0 })

    const firstContent = assistantContent(first)
    assert(firstContent.length > 0, 'first turn returned no content')

    const second = await chat([
      { role: 'system', content: 'You are a terse assistant. Follow instructions exactly.' },
      { role: 'user', content: `Remember this code: ${code}. Reply with OK only.` },
      { role: 'assistant', content: firstContent },
      { role: 'user', content: 'What was the code? Reply with the code only.' },
    ], { ...NO_THINK, max_tokens: 512, temperature: 0 })

    const answer = assistantContent(second)
    assert(answer.toUpperCase().includes(code), `expected ${code}, got ${JSON.stringify(answer)}`)
    return code
  })

  await run('streaming + [DONE]', async () => {
    const stream = await streamChat([
      { role: 'user', content: 'Answer in one short sentence: what is 2+2?' },
    ], { ...NO_THINK, max_tokens: 512, temperature: 0 })

    assert(stream.sawDone, 'missing data: [DONE]')
    assert(stream.finish === 'stop' || stream.finish === 'length', `unexpected finish_reason ${stream.finish}`)
    assert(stream.content.length > 0 || stream.reasoning.length > 0, 'stream produced no text')
    return `${stream.content.length} content chars, ${stream.reasoning.length} reasoning chars`
  })

  await run('reasoning separation', async () => {
    const stream = await streamChat([
      { role: 'user', content: 'Think briefly, then answer in one sentence: what is 5+5?' },
    ], { max_tokens: 1024, temperature: 0 })

    if (!stream.reasoning) return 'skipped (model emitted no reasoning_content)'
    assert(
      !/<\/?think>|<\|im_(start|end)\|>/.test(stream.content),
      'reasoning markup leaked into content',
    )
    return `${stream.reasoning.length} reasoning chars kept out of content`
  })

  await run('immediate SSE headers / keep-alive', async () => {
    const response = await api('/v1/chat/completions', {
      model,
      messages: [{ role: 'user', content: 'Write a 200 word story about a robot.' }],
      stream: true,
      max_tokens: 256,
    })
    assert(response.ok, `HTTP ${response.status}`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const started = Date.now()
    let text = ''

    while (Date.now() - started < 5000 && !text.includes(': connected')) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    await reader.cancel().catch(() => {})

    assert(text.includes(': connected'), 'server did not flush an initial SSE comment')
    return `${Date.now() - started}ms to first bytes`
  })

  await run('tool call loop', async () => {
    const tools = [{
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather for a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    }]

    const first = await chat([
      { role: 'user', content: 'What is the weather in Paris? You must call the get_weather tool.' },
    ], { ...NO_THINK, model: toolModel, tools, tool_choice: 'auto', max_tokens: 512, temperature: 0 })

    const message = first?.choices?.[0]?.message
    const toolCalls = message?.tool_calls
    if (!toolCalls || toolCalls.length === 0) {
      if (args['tool-model']) {
        throw new Error('model did not emit a tool call')
      }
      return 'skipped (model did not call the tool; pass --tool-model to require it)'
    }

    const call = toolCalls[0]
    assert(call.function?.name === 'get_weather', `unexpected tool ${call.function?.name}`)
    const callArgs = JSON.parse(call.function.arguments || '{}')
    assert(typeof callArgs.city === 'string' && callArgs.city.length > 0, 'tool arguments missing city')

    const second = await chat([
      { role: 'user', content: 'What is the weather in Paris? You must call the get_weather tool.' },
      { role: 'assistant', content: null, tool_calls: toolCalls },
      { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ temperature: 21, condition: 'sunny' }) },
      { role: 'user', content: 'Summarize the weather in one sentence.' },
    ], { ...NO_THINK, model: toolModel, tools, max_tokens: 512, temperature: 0 })

    const answer = assistantContent(second)
    assert(answer.length > 0, 'final answer after tool result was empty')
    return `${callArgs.city} -> ${answer.slice(0, 40)}`
  })

  await run('streaming tool calls', async () => {
    const tools = [{
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather for a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    }]

    const stream = await streamChat([
      { role: 'user', content: 'What is the weather in Tokyo? You must call the get_weather tool.' },
    ], { ...NO_THINK, model: toolModel, tools, tool_choice: 'auto', max_tokens: 512, temperature: 0 })

    if (stream.toolCalls.length === 0) {
      if (args['tool-model']) {
        throw new Error('model did not stream a tool call')
      }
      return 'skipped (model did not stream a tool call)'
    }

    const call = stream.toolCalls[0]
    assert(call.function?.name === 'get_weather', `unexpected tool ${call.function?.name}`)
    assert(stream.finish === 'tool_calls', `unexpected finish_reason ${stream.finish}`)
    return call.function.arguments
  })

  await run('multi-step automated task', async () => {
    const history = []
    const step1 = await chat([
      { role: 'user', content: 'List exactly three numbered steps to organize a bookshelf. No extra text.' },
    ], { ...NO_THINK, max_tokens: 512, temperature: 0 })
    const plan = assistantContent(step1)
    assert(plan.length > 0, 'plan step returned no content')
    history.push(
      { role: 'user', content: 'List exactly three numbered steps to organize a bookshelf. No extra text.' },
      { role: 'assistant', content: plan },
    )

    const step2 = await chat([
      ...history,
      { role: 'user', content: 'Execute step 1 now. Describe what you did in one sentence.' },
    ], { ...NO_THINK, max_tokens: 512, temperature: 0 })
    const execution = assistantContent(step2)
    assert(execution.length > 0, 'execution step returned no content')
    history.push(
      { role: 'user', content: 'Execute step 1 now. Describe what you did in one sentence.' },
      { role: 'assistant', content: execution },
    )

    const step3 = await chat([
      ...history,
      { role: 'user', content: 'Summarize the whole task in one sentence.' },
    ], { ...NO_THINK, max_tokens: 512, temperature: 0 })
    const summary = assistantContent(step3)
    assert(summary.length > 0, 'summary step returned no content')
    return `${plan.length}/${execution.length}/${summary.length} chars`
  })

  await run('concurrent streaming requests', async () => {
    const [a, b] = await Promise.all([
      streamChat([{ role: 'user', content: 'Say hello in one sentence.' }], { ...NO_THINK, max_tokens: 128 }),
      streamChat([{ role: 'user', content: 'Say goodbye in one sentence.' }], { ...NO_THINK, max_tokens: 128 }),
    ])
    assert(a.sawDone && b.sawDone, 'one of the concurrent streams did not finish')
    assert(a.content.length > 0 && b.content.length > 0, 'one of the concurrent streams was empty')
    return '2/2 completed'
  })

  await run('client abort recovery', async () => {
    const controller = new AbortController()
    const response = await api('/v1/chat/completions', {
      model,
      messages: [{ role: 'user', content: 'Write a very long story about the ocean.' }],
      stream: true,
      max_tokens: 512,
    }, { signal: controller.signal })

    const reader = response.body.getReader()
    await reader.read()
    controller.abort()
    await reader.cancel().catch(() => {})
    await delay(1000)

    const after = await chat([
      { role: 'user', content: 'Reply with the single word: OK' },
    ], { ...NO_THINK, max_tokens: 256, temperature: 0 })
    assert(assistantContent(after).length > 0, 'server did not recover after client abort')
    return 'recovered'
  })

  await run('Ollama /api/chat (non-stream + stream)', async () => {
    const nonStream = await json('/api/chat', {
      model,
      messages: [{ role: 'user', content: 'Answer in one short sentence: what is 3+3?' }],
      stream: false,
      options: { num_predict: 128 },
      enable_thinking: false,
    })
    assert(typeof nonStream?.message?.content === 'string', 'missing message.content')

    const response = await api('/api/chat', {
      model,
      messages: [{ role: 'user', content: 'Answer in one short sentence: what is 4+4?' }],
      stream: true,
      options: { num_predict: 128 },
      enable_thinking: false,
    })
    const text = await response.text()
    const lines = text.split('\n').filter(Boolean).map(line => JSON.parse(line))
    assert(lines.some(line => line.done === true), 'missing done:true')
    assert(lines.some(line => line.message?.content), 'no content delta')
    return `${lines.length} NDJSON lines`
  })

  await run('HTTP keep-alive reuse', async () => {
    const statuses = await rawKeepAlive([
      'GET /api/status HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n',
      'GET /v1/models HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n',
    ])
    assert(statuses.length === 2, `expected 2 responses, got ${statuses.length}`)
    assert(statuses.every(status => status.includes('200')), statuses.join(' / '))
    return '2 requests / 1 connection'
  })

  await run('chunked request body', async () => {
    const payload = JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with OK' }],
      stream: false,
      max_tokens: 64,
      enable_thinking: false,
    })
    const chunked = `${Buffer.byteLength(payload).toString(16)}\r\n${payload}\r\n0\r\n\r\n`
    const response = await rawExchange({
      headers:
        `POST /v1/chat/completions HTTP/1.1\r\n` +
        `Host: localhost\r\n` +
        `Content-Type: application/json\r\n` +
        `Transfer-Encoding: chunked\r\n` +
        `Connection: close\r\n\r\n`,
      body: chunked,
    })
    assert(response.startsWith('HTTP/1.1 200'), response.split('\r\n')[0])
    return '200'
  })

  await run('Expect: 100-continue', async () => {
    const payload = JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with OK' }],
      stream: false,
      max_tokens: 64,
      enable_thinking: false,
    })
    const response = await rawExchange({
      headers:
        `POST /v1/chat/completions HTTP/1.1\r\n` +
        `Host: localhost\r\n` +
        `Content-Type: application/json\r\n` +
        `Content-Length: ${Buffer.byteLength(payload)}\r\n` +
        `Expect: 100-continue\r\n` +
        `Connection: close\r\n\r\n`,
      body: payload,
    }, { waitForContinue: true })
    assert(response.startsWith('HTTP/1.1 200'), response.split('\r\n')[0])
    return '100 -> 200'
  })

  await run('invalid request -> 400', async () => {
    const response = await api('/v1/chat/completions', { messages: 'not-an-array' })
    assert(response.status === 400, `expected 400, got ${response.status}`)
    return '400'
  })

  if (args.slow) {
    await run('heartbeat during long prefill', async () => {
      const filler = '这是一段用于延长预填充时间的测试文本。'.repeat(1500)
      const response = await api('/v1/chat/completions', {
        model,
        messages: [{ role: 'user', content: `Ignore the following text and answer OK only.\n${filler}` }],
        stream: true,
        max_tokens: 1,
        enable_thinking: false,
      })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const started = Date.now()
      let text = ''

      while (Date.now() - started < 20000) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        if (text.includes(': keep-alive')) {
          await reader.cancel().catch(() => {})
          return `keep-alive after ${Date.now() - started}ms`
        }
      }

      await reader.cancel().catch(() => {})
      throw new Error('no keep-alive comment within 20s')
    })
  }

  const failed = results.filter(result => !result.ok)
  console.log('')
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) {
    console.log('Failures:')
    for (const failure of failed) console.log(`  - ${failure.name}: ${failure.error}`)
    process.exit(1)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
