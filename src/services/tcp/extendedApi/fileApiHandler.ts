import { sendJSONResponse } from '../responseUtils'

export function createFileApiHandler(context: {
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
      context.respond(socket, 200, { files: [] })
      return true
    }
    return false
  }
}
