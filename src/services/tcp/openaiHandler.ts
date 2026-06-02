import { parseJsonBody } from './jsonParser'
import { parseMessagesFromPayload } from './messageParser'
import { buildCustomSettings } from './settingsBuilder'
import type { CompletionSettings } from './settingsBuilder'
import type { ParsedMessage } from './messageParser'
import { sendSSEStart, writeSSEEvent, endSSEStream, sendJSONResponse } from './responseUtils'

function genId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function genToolCallId(): string {
  return `call_${Math.random().toString(36).slice(2, 10)}`
}

interface ToolCallEntry {
  id?: string
  type: 'function'
  function: { name: string; arguments: string }
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

function buildCompletion(id: string, model: string, content: string | null, toolCalls?: ToolCallEntry[]): any {
  const message: any = { role: 'assistant', content: content ?? null }

  let finishReason = 'stop'
  if (toolCalls && toolCalls.length > 0) {
    message.tool_calls = toolCalls.map((tc) => ({
      id: tc.id || genToolCallId(),
      type: 'function',
      function: {
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || '',
      },
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

export async function handleOpenAIChatCompletions(
  body: string,
  socket: any,
  method: string,
  path: string,
  generateCompletion: (
    messages: ParsedMessage[],
    settings?: CompletionSettings,
    onToken?: (token: string) => boolean,
  ) => Promise<{ content: string; tool_calls?: ToolCallEntry[] }>,
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

  if (stream) {
    try {
      sendSSEStart(socket, 200)
    } catch {
      try { socket.destroy() } catch {}
      return
    }

    let disconnected = false
    const onClose = () => { disconnected = true }
    socket.on('close', onClose)

    try {
      let buffer = ''
      let sentPos = 0
      let insideToolCall = false
      let toolJsonBuffer = ''
      const toolCalls: ToolCallEntry[] = []

      const result = await generateCompletion(parsed.messages, settings, (token: string) => {
        if (disconnected) return false
        buffer += token

        if (!insideToolCall) {
          // 扫描缓冲区中是否有 <tool_call> 标记
          const toolStart = buffer.indexOf('<tool_call>', sentPos)
          if (toolStart >= 0) {
            // 推送标记前的内容
            if (toolStart > sentPos) {
              const content = buffer.slice(sentPos, toolStart)
              try {
                writeSSEEvent(socket, buildSSEChunk(id, oaiLogModel, { content }, null))
              } catch { return false }
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
              try {
                writeSSEEvent(socket, buildSSEChunk(id, oaiLogModel, { content }, null))
              } catch { return false }
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
            // 解析 JSON 工具调用
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
                try {
                  writeSSEEvent(socket, buildSSEChunk(id, oaiLogModel, { content: beforeNextTool }, null))
                } catch { return false }
              }
              sentPos += nextTool + '<tool_call>'.length
              insideToolCall = true
              toolJsonBuffer = ''
            } else {
              // 推送 </tool_call> 后的剩余纯内容
              if (remaining) {
                try {
                  writeSSEEvent(socket, buildSSEChunk(id, oaiLogModel, { content: remaining }, null))
                } catch { return false }
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

      if (disconnected) return

      if (toolCalls.length > 0) {
        writeSSEEvent(socket, buildSSEChunk(id, oaiLogModel, {
          tool_calls: toolCalls.map((tc, i) => ({
            index: i,
            id: tc.id,
            type: tc.type,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        }, 'tool_calls'))
      } else {
        writeSSEEvent(socket, buildSSEChunk(id, oaiLogModel, {}, 'stop'))
      }
      endSSEStream(socket)
    } catch {
      try { endSSEStream(socket) } catch { try { socket.destroy() } catch {} }
    } finally {
      socket.removeListener('close', onClose)
    }
    return
  }

  try {
    const result = await generateCompletion(parsed.messages, settings)
    sendJSONResponse(socket, 200, buildCompletion(id, oaiLogModel, result.content || null, result.tool_calls))
  } catch {
    sendError(socket, 500, 'generation_failed')
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
