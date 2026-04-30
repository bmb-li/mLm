import { parseJsonBody } from './jsonParser'
import { sendJSONResponse } from './responseUtils'

export async function handleShowRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  getModelInfo: (name: string) => Promise<any>,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body)
  if (parseError || !payload?.model) {
    sendError(socket, 400, 'model_required')
    return
  }

  try {
    const info = await getModelInfo(payload.model)
    sendJSONResponse(socket, 200, {
      license: info.license || 'unknown',
      modelfile: info.modelfile || '',
      parameters: info.parameters || {},
      details: {
        parent_model: info.parent_model || '',
        format: info.format || 'gguf',
        family: info.family || 'llama',
        parameter_size: info.parameter_size || '',
        quantization_level: info.quantization_level || '',
      },
    })
  } catch {
    sendError(socket, 404, 'model_not_found')
  }
}

export async function handleEmbeddingsRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  generateEmbedding: (input: string) => Promise<number[]>,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body)
  if (parseError) {
    sendError(socket, 400, 'invalid_request')
    return
  }

  const input = payload?.input || payload?.prompt
  if (!input) {
    sendError(socket, 400, 'input_required')
    return
  }

  try {
    const embedding = await generateEmbedding(input)
    sendJSONResponse(socket, 200, {
      embedding,
      prompt: input,
    })
  } catch {
    sendError(socket, 500, 'embedding_failed')
  }
}
