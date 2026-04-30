import { parseJsonBody } from '../jsonParser'
import { sendJSONResponse } from '../responseUtils'

export function createChatApiHandler(context: {
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
      // GET /api/chats - list chats
      context.respond(socket, 200, { chats: [], total: 0 })
      return true
    }

    if (method === 'POST' && segments.length === 0) {
      // POST /api/chats - create chat
      context.respond(socket, 201, { id: `chat_${Date.now()}`, created: true })
      return true
    }

    return false
  }
}
