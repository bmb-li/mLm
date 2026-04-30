import { parseJsonBody } from './jsonParser'
import { parseMessagesFromPayload } from './messageParser'
import { buildCustomSettings } from './settingsBuilder'
import type { CompletionSettings } from './settingsBuilder'
import { sendSSEStart, writeSSEEvent, endSSEStream, sendJSONResponse } from './responseUtils'

function genId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildSSEChunk(
  id: string,
  model: string,
  content: string,
  finishReason: string | null,
): any {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: content ? { content } : {},
      finish_reason: finishReason,
    }],
  }
}

function buildCompletion(id: string, model: string, content: string): any {
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

export async function handleOpenAIChatCompletions(
  body: string,
  socket: any,
  method: string,
  path: string,
  generateCompletion: (
    messages: { role: string; content: string }[],
    settings?: CompletionSettings,
    onToken?: (token: string) => boolean,
  ) => Promise<string>,
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
      await generateCompletion(parsed.messages, settings, (token: string) => {
        if (disconnected) return false
        try {
          writeSSEEvent(socket, buildSSEChunk(id, oaiLogModel, token, null))
        } catch { return false }
        return true
      })

      if (!disconnected) {
        writeSSEEvent(socket, buildSSEChunk(id, oaiLogModel, '', 'stop'))
        endSSEStream(socket)
      }
    } catch {
      try { endSSEStream(socket) } catch { try { socket.destroy() } catch {} }
    } finally {
      socket.removeListener('close', onClose)
    }
    return
  }

  try {
    const text = await generateCompletion(parsed.messages, settings)
    sendJSONResponse(socket, 200, buildCompletion(id, oaiLogModel, text))
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
