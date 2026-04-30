import { parseJsonBody } from '../jsonParser'
import { sendJSONResponse } from '../responseUtils'

export function createSettingsApiHandler(context: {
  respond: (socket: any, status: number, payload: any) => void
}) {
  return async (
    method: string,
    segments: string[],
    body: string,
    socket: any,
    path: string,
  ): Promise<boolean> => {
    if (method === 'GET' && segments.length === 0) {
      context.respond(socket, 200, { settings: {} })
      return true
    }

    if (method === 'POST' && segments.length === 1) {
      context.respond(socket, 200, { status: 'updated' })
      return true
    }

    return false
  }
}
