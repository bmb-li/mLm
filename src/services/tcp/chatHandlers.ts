import { parseJsonBody } from './jsonParser'
import { parseMessagesFromPayload, parseMessagesOrPromptFromPayload } from './messageParser'
import { buildCustomSettings } from './settingsBuilder'
import type { CompletionSettings } from './settingsBuilder'
import { sendChunkedResponseStart, writeChunk, endChunkedResponse, sendJSONResponse } from './responseUtils'

function buildNDJSONChunk(model: string, content: string, done: boolean): any {
  return {
    model,
    created_at: new Date().toISOString(),
    message: done ? undefined : { role: 'assistant', content },
    done,
  }
}

export async function handleChatRequest(
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
    } catch {
      try { socket.destroy() } catch {}
      return
    }

    let disconnected = false
    socket.on('close', () => { disconnected = true })

    try {
      await generateCompletion(parsed.messages, settings, (token: string) => {
        if (disconnected) return false
        try {
          writeChunk(socket, JSON.stringify(buildNDJSONChunk(modelId, token, false)) + '\n')
        } catch { return false }
        return true
      })
      if (!disconnected) {
        writeChunk(socket, JSON.stringify(buildNDJSONChunk(modelId, '', true)) + '\n')
        endChunkedResponse(socket)
      }
    } catch {
      try { endChunkedResponse(socket) } catch { try { socket.destroy() } catch {} }
    }
    return
  }

  try {
    const text = await generateCompletion(parsed.messages, settings)
    sendJSONResponse(socket, 200, {
      model: modelId,
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content: text },
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
  generateCompletion: (
    messages: { role: string; content: string }[],
    settings?: CompletionSettings,
    onToken?: (token: string) => boolean,
  ) => Promise<string>,
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
    } catch {
      try { socket.destroy() } catch {}
      return
    }

    let disconnected = false
    socket.on('close', () => { disconnected = true })

    try {
      await generateCompletion(messages, settings, (token: string) => {
        if (disconnected) return false
        try {
          writeChunk(socket, JSON.stringify({
            model: modelId,
            created_at: new Date().toISOString(),
            response: token,
            done: false,
          }) + '\n')
        } catch { return false }
        return true
      })
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
      try { endChunkedResponse(socket) } catch { try { socket.destroy() } catch {} }
    }
    return
  }

  try {
    const text = await generateCompletion(messages, settings)
    sendJSONResponse(socket, 200, {
      model: modelId,
      created_at: new Date().toISOString(),
      response: text,
      done: true,
    })
  } catch {
    sendError(socket, 500, 'generation_failed')
  }
}
