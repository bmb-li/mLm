import { parseJsonBody } from '../jsonParser'
import type { CompletionSettings } from '../settingsBuilder'
import { sendJSONResponse } from '../responseUtils'

export function createModelApiHandler(context: {
  respond: (socket: any, status: number, payload: any) => void
  ensureModelLoaded: (identifier?: string) => Promise<any>
  parseHttpError: (error: unknown) => { status: number; code: string; message: string }
  loadModel: (path: string, projectorPath?: string) => Promise<void>
  unloadModel: () => Promise<void>
}) {
  return async (
    method: string,
    segments: string[],
    body: string,
    socket: any,
    path: string,
  ): Promise<boolean> => {
    if (method === 'POST' && segments[0] === 'load') {
      const { payload } = parseJsonBody(body)
      try {
        await context.loadModel(payload?.path, payload?.projectorPath)
        context.respond(socket, 200, { status: 'loaded' })
      } catch (err) {
        const e = context.parseHttpError(err)
        context.respond(socket, e.status, { error: e.code })
      }
      return true
    }

    if (method === 'POST' && segments[0] === 'unload') {
      await context.unloadModel()
      context.respond(socket, 200, { status: 'unloaded' })
      return true
    }

    return false
  }
}
