import { parseJsonBody } from './jsonParser'
import { parseMessagesFromPayload, parseMessagesOrPromptFromPayload } from './messageParser'
import { buildCustomSettings } from './settingsBuilder'
import type { CompletionSettings } from './settingsBuilder'
import type { ParsedMessage } from './messageParser'
import type { CompletionResult, CompletionTokenData, OnCompletionToken } from './types'
import { advanceSnapshot } from './streamHelpers'
import { sendChunkedResponseStart, writeChunk, endChunkedResponse, sendJSONResponse } from './responseUtils'
import { startHeartbeat } from './heartbeat'

type GenerateCompletion = (
  messages: ParsedMessage[],
  settings?: CompletionSettings,
  onToken?: OnCompletionToken,
) => Promise<CompletionResult>

interface StreamDelta {
  content?: string
  thinking?: string
}

/**
 * Stream a completion, separating reasoning from the answer.
 *
 * Native `content` / `reasoning_content` are cumulative snapshots, so only the
 * new suffix of each channel is forwarded. With `reasoning_format: "none"` the
 * raw token stream is forwarded as content, preserving the old behaviour.
 */
async function streamCompletion(
  messages: ParsedMessage[],
  settings: CompletionSettings | undefined,
  generateCompletion: GenerateCompletion,
  isDisconnected: () => boolean,
  emitDelta: (delta: StreamDelta) => boolean,
): Promise<CompletionResult> {
  const reasoningFormat = settings?.reasoning_format ?? 'auto'
  let sentContent = ''
  let sentReasoning = ''
  let sawParsedOutput = false

  const result = await generateCompletion(messages, settings, (data: CompletionTokenData) => {
    if (isDisconnected()) return false

    if (reasoningFormat === 'none') {
      return data.token ? emitDelta({ content: data.token }) : true
    }

    if (typeof data.accumulated_text === 'string') sawParsedOutput = true
    if (!sawParsedOutput) return true

    const reasoning = advanceSnapshot(sentReasoning, data.reasoning_content ?? '')
    sentReasoning = reasoning.snapshot
    if (reasoning.delta && !emitDelta({ thinking: reasoning.delta })) return false

    const content = advanceSnapshot(sentContent, data.content ?? '')
    sentContent = content.snapshot
    if (content.delta && !emitDelta({ content: content.delta })) return false

    return true
  })

  if (isDisconnected() || reasoningFormat === 'none') return result

  if (sawParsedOutput) {
    if (typeof result.reasoning_content === 'string') {
      const reasoning = advanceSnapshot(sentReasoning, result.reasoning_content)
      sentReasoning = reasoning.snapshot
      if (reasoning.delta) emitDelta({ thinking: reasoning.delta })
    }
    if (typeof result.content === 'string') {
      const content = advanceSnapshot(sentContent, result.content)
      sentContent = content.snapshot
      if (content.delta) emitDelta({ content: content.delta })
    }
    if (sentContent === '' && sentReasoning === '' && result.text) {
      // Safety net: parsed output reported progress but no channel was exposed.
      emitDelta({ content: result.text })
    }
  } else if (result.text) {
    // Native parser never produced output; never drop the answer.
    emitDelta({ content: result.text })
  }

  return result
}

function buildNDJSONChunk(
  model: string,
  delta: StreamDelta,
  done: boolean,
): any {
  const message: any = done ? undefined : { role: 'assistant', content: delta.content ?? '' }
  if (message && delta.thinking) message.thinking = delta.thinking
  return {
    model,
    created_at: new Date().toISOString(),
    message,
    done,
  }
}

export async function handleChatRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  generateCompletion: GenerateCompletion,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body)
  if (parseError) {
    sendError(socket, 400, 'invalid_request')
    return
  }

  const parsed = parseMessagesFromPayload(payload)
  if (parsed.error) {
    sendError(socket, 400, parsed.error)
    return
  }

  const modelId = typeof payload.model === 'string' ? payload.model : 'default'
  const stream = payload.stream !== false
  const settings = buildCustomSettings(payload)

  if (stream) {
    try {
      sendChunkedResponseStart(socket, 200)
      // Flush headers immediately; blank NDJSON lines are ignored by clients.
      writeChunk(socket, '\n')
    } catch {
      try { socket.destroy() } catch {}
      return
    }

    let disconnected = false
    socket.on('close', () => { disconnected = true })

    const stopHeartbeat = startHeartbeat(() => writeChunk(socket, '\n'))

    try {
      await streamCompletion(
        parsed.messages,
        settings,
        generateCompletion,
        () => disconnected,
        (delta) => {
          try {
            writeChunk(socket, JSON.stringify(buildNDJSONChunk(modelId, delta, false)) + '\n')
            return true
          } catch {
            return false
          }
        },
      )
      stopHeartbeat()
      if (!disconnected) {
        writeChunk(socket, JSON.stringify(buildNDJSONChunk(modelId, {}, true)) + '\n')
        endChunkedResponse(socket)
      }
    } catch {
      stopHeartbeat()
      try { endChunkedResponse(socket) } catch { try { socket.destroy() } catch {} }
    } finally {
      stopHeartbeat()
    }
    return
  }

  try {
    const result = await generateCompletion(parsed.messages, settings)
    const message: any = { role: 'assistant', content: result.content }
    if (result.reasoning_content) message.thinking = result.reasoning_content
    sendJSONResponse(socket, 200, {
      model: modelId,
      created_at: new Date().toISOString(),
      message,
      done: true,
    })
  } catch {
    sendError(socket, 500, 'generation_failed')
  }
}

export async function handleGenerateRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  generateCompletion: GenerateCompletion,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body)
  if (parseError) {
    sendError(socket, 400, 'invalid_request')
    return
  }

  const parsed = parseMessagesOrPromptFromPayload(payload)
  if (parsed.error) {
    sendError(socket, 400, parsed.error)
    return
  }

  const modelId = typeof payload.model === 'string' ? payload.model : 'default'
  const stream = payload.stream !== false
  const settings = buildCustomSettings(payload)

  const messages = parsed.messages || [
    { role: 'user' as const, content: parsed.prompt || '' },
  ]

  if (stream) {
    try {
      sendChunkedResponseStart(socket, 200)
      // Flush headers immediately; blank NDJSON lines are ignored by clients.
      writeChunk(socket, '\n')
    } catch {
      try { socket.destroy() } catch {}
      return
    }

    let disconnected = false
    socket.on('close', () => { disconnected = true })

    const stopHeartbeat = startHeartbeat(() => writeChunk(socket, '\n'))

    try {
      await streamCompletion(
        messages,
        settings,
        generateCompletion,
        () => disconnected,
        (delta) => {
          try {
            writeChunk(socket, JSON.stringify({
              model: modelId,
              created_at: new Date().toISOString(),
              response: delta.content ?? '',
              ...(delta.thinking ? { thinking: delta.thinking } : {}),
              done: false,
            }) + '\n')
            return true
          } catch {
            return false
          }
        },
      )
      stopHeartbeat()
      if (!disconnected) {
        writeChunk(socket, JSON.stringify({
          model: modelId,
          created_at: new Date().toISOString(),
          response: '',
          done: true,
        }) + '\n')
        endChunkedResponse(socket)
      }
    } catch {
      stopHeartbeat()
      try { endChunkedResponse(socket) } catch { try { socket.destroy() } catch {} }
    } finally {
      stopHeartbeat()
    }
    return
  }

  try {
    const result = await generateCompletion(messages, settings)
    sendJSONResponse(socket, 200, {
      model: modelId,
      created_at: new Date().toISOString(),
      response: result.content,
      ...(result.reasoning_content ? { thinking: result.reasoning_content } : {}),
      done: true,
    })
  } catch {
    sendError(socket, 500, 'generation_failed')
  }
}
