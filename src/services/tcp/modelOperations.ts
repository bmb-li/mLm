import { parseJsonBody } from './jsonParser'
import { sendJSONResponse } from './responseUtils'

export async function handleTagsRequest(
  socket: any,
  method: string,
  path: string,
  listModels: () => Promise<{ name: string; size: number; modified: string }[]>,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  try {
    const models = await listModels()
    sendJSONResponse(socket, 200, {
      models: models.map(m => ({
        name: m.name,
        modified_at: m.modified,
        size: m.size,
      })),
    })
  } catch {
    sendError(socket, 500, 'failed_to_list_models')
  }
}

export async function handlePsRequest(
  socket: any,
  method: string,
  path: string,
  getActiveModel: () => { name: string; path: string } | null,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  const active = getActiveModel()
  if (!active) {
    sendJSONResponse(socket, 200, { models: [] })
    return
  }

  sendJSONResponse(socket, 200, {
    models: [{
      name: active.name,
      model: active.path,
      size: 0,
      digest: '',
      details: {},
      expires_at: '',
      size_vram: 0,
    }],
  })
}

export async function handleCopyRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  copyModel: (source: string, destination: string) => Promise<void>,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body)
  if (parseError || !payload?.source || !payload?.destination) {
    sendError(socket, 400, 'source_and_destination_required')
    return
  }

  try {
    await copyModel(payload.source, payload.destination)
    sendJSONResponse(socket, 200, { status: 'success' })
  } catch {
    sendError(socket, 500, 'copy_failed')
  }
}

export async function handlePullRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  pullModel: (name: string) => Promise<void>,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body)
  if (parseError || !payload?.name) {
    sendError(socket, 400, 'model_name_required')
    return
  }

  try {
    await pullModel(payload.name)
    sendJSONResponse(socket, 200, { status: 'success' })
  } catch {
    sendError(socket, 500, 'pull_failed')
  }
}

export async function handleDeleteRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  deleteModel: (name: string) => Promise<void>,
  sendError: (socket: any, status: number, message: string) => void,
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body)
  if (parseError || !payload?.name) {
    sendError(socket, 400, 'model_name_required')
    return
  }

  try {
    await deleteModel(payload.name)
    sendJSONResponse(socket, 200, { status: 'success' })
  } catch {
    sendError(socket, 500, 'delete_failed')
  }
}
