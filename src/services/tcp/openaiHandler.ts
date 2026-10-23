import { parseJsonBody } from './jsonParser'
import { parseMessagesFromPayload } from './messageParser'
import { buildCustomSettings } from './settingsBuilder'
import type { CompletionSettings } from './settingsBuilder'
import type { ParsedMessage } from './messageParser'
import type { CompletionResult, CompletionTokenData, OnCompletionToken, ToolCallEntry } from './types'
import { advanceSnapshot, extractToolCallsFromRaw } from './streamHelpers'
import { sendSSEStart, writeSSEEvent, writeSSEComment, endSSEStream, sendJSONResponse } from './responseUtils'
import { startHeartbeat } from './heartbeat'

function genId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function genToolCallId(): string {
  return `call_${Math.random().toString(36).slice(2, 10)}`
}

function buildSSEChunk(
  id: string,
  model: string,
  delta: any,
  finishReason: string | null,
): any {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta,
      finish_reason: finishReason,
    }],
  }
}

function openAIToolCalls(toolCalls: ToolCallEntry[]): any[] {
  return toolCalls.map((tc, i) => ({
    index: i,
    id: tc.id || genToolCallId(),
    type: 'function' as const,
    function: {
      name: tc.function?.name || '',
      arguments: tc.function?.arguments || '',
    },
  }))
}

function buildCompletion(
  id: string,
  model: string,
  content: string | null,
  toolCalls?: ToolCallEntry[],
  reasoningContent?: string,
): any {
  const message: any = { role: 'assistant', content: content ?? null }
  if (reasoningContent) message.reasoning_content = reasoningContent

  let finishReason = 'stop'
  if (toolCalls && toolCalls.length > 0) {
    message.tool_calls = openAIToolCalls(toolCalls).map((tc) => ({
      id: tc.id,
      type: tc.type,
      function: tc.function,
    }))
    finishReason = 'tool_calls'
  }

  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason,
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

function* chunkString(str: string, size: number): Generator<string> {
  for (let i = 0; i < str.length; i += size) {
    yield str.slice(i, i + size)
  }
}

function emitChunk(socket: any, id: string, model: string, delta: any): boolean {
  try {
    writeSSEEvent(socket, buildSSEChunk(id, model, delta, null))
    return true
  } catch {
    return false
  }
}

export async function handleOpenAIChatCompletions(
  body: string,
  socket: any,
  method: string,
  path: string,
  generateCompletion: (
    messages: ParsedMessage[],
    settings?: CompletionSettings,
    onToken?: OnCompletionToken,
  ) => Promise<CompletionResult>,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body)
  if (parseError) {
    sendError(socket, 400, 'invalid_request_error')
    return
  }

  const parsed = parseMessagesFromPayload(payload)
  if (parsed.error) {
    sendError(socket, 400, 'invalid_request_error')
    return
  }

  const modelId = typeof payload.model === 'string' ? payload.model : undefined
  const stream = payload.stream === true
  const settings = buildCustomSettings(payload)
  const id = genId()
  const oaiLogModel = modelId || 'default'
  // Mirrors the default applied by useLocalServer's generateCompletion.
  const reasoningFormat = settings?.reasoning_format ?? 'auto'

  if (stream) {
    try {
      sendSSEStart(socket, 200)
      // Flush headers immediately so clients know the request was accepted.
      writeSSEComment(socket, 'connected')
    } catch {
      try { socket.destroy() } catch {}
      return
    }

    let disconnected = false
    const onClose = () => { disconnected = true }
    socket.on('close', onClose)

    // Model loading and prompt processing can take far longer than the read
    // timeout used by agent clients. Comments are ignored by SSE parsers but
    // keep the socket active.
    const stopHeartbeat = startHeartbeat(() => writeSSEComment(socket, 'keep-alive'))

    try {
      if (reasoningFormat === 'none') {
        await streamRawCompletion(socket, id, oaiLogModel, parsed.messages, settings, generateCompletion, () => disconnected)
      } else {
        await streamParsedCompletion(socket, id, oaiLogModel, parsed.messages, settings, generateCompletion, () => disconnected)
      }

      stopHeartbeat()
      if (disconnected) return
      endSSEStream(socket)
    } catch {
      stopHeartbeat()
      try { endSSEStream(socket) } catch { try { socket.destroy() } catch {} }
    } finally {
      stopHeartbeat()
      socket.removeListener('close', onClose)
    }
    return
  }

  try {
    const result = await generateCompletion(parsed.messages, settings)
    sendJSONResponse(socket, 200, buildCompletion(
      id,
      oaiLogModel,
      result.content || null,
      result.tool_calls,
      result.reasoning_content,
    ))
  } catch {
    sendError(socket, 500, 'generation_failed')
  }
}

/**
 * Legacy streaming path (reasoning_format: "none").
 * Emits raw tokens and extracts `<tool_call>` blocks on the fly.
 */
async function streamRawCompletion(
  socket: any,
  id: string,
  model: string,
  messages: ParsedMessage[],
  settings: CompletionSettings | undefined,
  generateCompletion: (
    messages: ParsedMessage[],
    settings?: CompletionSettings,
    onToken?: OnCompletionToken,
  ) => Promise<CompletionResult>,
  isDisconnected: () => boolean,
): Promise<void> {
  let buffer = ''
  let sentPos = 0
  let insideToolCall = false
  let toolJsonBuffer = ''
  const toolCalls: ToolCallEntry[] = []

  const result = await generateCompletion(messages, settings, (data: CompletionTokenData) => {
    if (isDisconnected()) return false
    buffer += data.token || ''

    if (!insideToolCall) {
      // 扫描缓冲区中是否有 <tool_call> 标记
      const toolStart = buffer.indexOf('<tool_call>', sentPos)
      if (toolStart >= 0) {
        // 推送标记前的内容
        if (toolStart > sentPos) {
          const content = buffer.slice(sentPos, toolStart)
          if (!emitChunk(socket, id, model, { content })) return false
        }
        sentPos = toolStart + '<tool_call>'.length
        insideToolCall = true
        toolJsonBuffer = ''
      } else {
        // 无标记，检查最后一个 < 是否可能是不完整标记前缀
        const lastLt = buffer.lastIndexOf('<', buffer.length - 1)
        const safeEnd = (lastLt > sentPos && lastLt <= buffer.length - 1)
          ? Math.min(lastLt, buffer.length) : buffer.length
        if (safeEnd > sentPos) {
          const content = buffer.slice(sentPos, safeEnd)
          if (!emitChunk(socket, id, model, { content })) return false
          sentPos = safeEnd
        }
      }
    } else {
      // 在 <tool_call> 内部，查找 </tool_call>
      const toolEnd = buffer.indexOf('</tool_call>', sentPos)
      if (toolEnd >= 0) {
        toolJsonBuffer += buffer.slice(sentPos, toolEnd)
        sentPos = toolEnd + '</tool_call>'.length
        insideToolCall = false
        try {
          const parsed = JSON.parse(toolJsonBuffer.trim())
          if (parsed.name) {
            toolCalls.push({
              id: genToolCallId(),
              type: 'function',
              function: {
                name: parsed.name,
                arguments: JSON.stringify(parsed.arguments || {}),
              },
            })
          }
        } catch {}

        // 检查之后是否还有更多 <tool_call>
        const remaining = buffer.slice(sentPos)
        const nextTool = remaining.indexOf('<tool_call>')
        if (nextTool >= 0) {
          const beforeNextTool = remaining.slice(0, nextTool)
          if (beforeNextTool.trim()) {
            if (!emitChunk(socket, id, model, { content: beforeNextTool })) return false
          }
          sentPos += nextTool + '<tool_call>'.length
          insideToolCall = true
          toolJsonBuffer = ''
        } else {
          // 推送 </tool_call> 后的剩余纯内容
          if (remaining) {
            if (!emitChunk(socket, id, model, { content: remaining })) return false
            sentPos = buffer.length
          }
        }
      } else {
        toolJsonBuffer += buffer.slice(sentPos)
        sentPos = buffer.length
      }
    }
    return true
  })

  if (isDisconnected()) return

  if (toolCalls.length === 0 && result.tool_calls && result.tool_calls.length > 0) {
    toolCalls.push(...result.tool_calls)
  }

  if (toolCalls.length > 0) {
    writeSSEEvent(socket, buildSSEChunk(id, model, { tool_calls: openAIToolCalls(toolCalls) }, 'tool_calls'))
  } else {
    // Flush anything the on-the-fly scanner was holding back (e.g. a trailing '<')
    if (!insideToolCall && sentPos < buffer.length) {
      emitChunk(socket, id, model, { content: buffer.slice(sentPos) })
    }
    writeSSEEvent(socket, buildSSEChunk(id, model, {}, 'stop'))
  }
}

/**
 * Reasoning-aware streaming path.
 *
 * llama.rn hands us cumulative parsed snapshots (`content` and
 * `reasoning_content`), so we diff them and stream both channels separately.
 * Tool calls come from the final native result; if the parser never produced
 * anything we fall back to raw-text extraction.
 */
async function streamParsedCompletion(
  socket: any,
  id: string,
  model: string,
  messages: ParsedMessage[],
  settings: CompletionSettings | undefined,
  generateCompletion: (
    messages: ParsedMessage[],
    settings?: CompletionSettings,
    onToken?: OnCompletionToken,
  ) => Promise<CompletionResult>,
  isDisconnected: () => boolean,
): Promise<void> {
  let sentContent = ''
  let sentReasoning = ''
  let sawParsedOutput = false
  let rawBuffer = ''

  const result = await generateCompletion(messages, settings, (data: CompletionTokenData) => {
    if (isDisconnected()) return false
    rawBuffer += data.token || ''
    if (typeof data.accumulated_text === 'string') sawParsedOutput = true
    if (!sawParsedOutput) return true

    const reasoning = advanceSnapshot(sentReasoning, data.reasoning_content ?? '')
    sentReasoning = reasoning.snapshot
    if (reasoning.delta) {
      if (!emitChunk(socket, id, model, { reasoning_content: reasoning.delta })) return false
    }

    const content = advanceSnapshot(sentContent, data.content ?? '')
    sentContent = content.snapshot
    if (content.delta) {
      if (!emitChunk(socket, id, model, { content: content.delta })) return false
    }

    return true
  })

  if (isDisconnected()) return

  let toolCalls: ToolCallEntry[] = result.tool_calls || []

  if (sawParsedOutput) {
    // Authoritative final snapshots: flush whatever the partial parser held back.
    if (typeof result.reasoning_content === 'string') {
      const reasoning = advanceSnapshot(sentReasoning, result.reasoning_content)
      sentReasoning = reasoning.snapshot
      if (reasoning.delta) emitChunk(socket, id, model, { reasoning_content: reasoning.delta })
    }
    if (typeof result.content === 'string') {
      const content = advanceSnapshot(sentContent, result.content)
      sentContent = content.snapshot
      if (content.delta) emitChunk(socket, id, model, { content: content.delta })
    }
    // Safety net: the parser reported progress but never exposed any channel.
    // Never leave the client with an empty answer.
    if (sentContent === '' && sentReasoning === '' && toolCalls.length === 0 && result.text) {
      emitChunk(socket, id, model, { content: result.text })
    }
  } else {
    // The chat parser failed for every token: recover from the raw text.
    const fallback = extractToolCallsFromRaw(rawBuffer, genToolCallId)
    if (toolCalls.length === 0) toolCalls = fallback.toolCalls
    if (fallback.content) emitChunk(socket, id, model, { content: fallback.content })
  }

  if (toolCalls.length > 0) {
    writeSSEEvent(socket, buildSSEChunk(id, model, { tool_calls: openAIToolCalls(toolCalls) }, 'tool_calls'))
  } else {
    writeSSEEvent(socket, buildSSEChunk(id, model, {}, 'stop'))
  }
}

export async function handleOpenAIModels(
  socket: any,
  method: string,
  path: string,
  listModels: () => Promise<{ id: string; owned_by: string }[]>,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  try {
    const models = await listModels()
    const data = models.map(m => ({
      id: m.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: m.owned_by,
    }))
    sendJSONResponse(socket, 200, { object: 'list', data })
  } catch {
    sendError(socket, 500, 'failed_to_list_models')
  }
}
