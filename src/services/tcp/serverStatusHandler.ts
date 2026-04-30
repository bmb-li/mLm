import { sendJSONResponse } from './responseUtils'

export async function handleServerStatus(
  socket: any,
  method: string,
  path: string,
  getStatus: () => { isRunning: boolean; url: string; port: number; clientCount: number },
  getModelStatus: () => { loaded: boolean; path: string | null },
): Promise<void> {
  const status = getStatus()
  const model = getModelStatus()

  sendJSONResponse(socket, 200, {
    server: {
      isRunning: status.isRunning,
      url: status.url,
      port: status.port,
      clientCount: status.clientCount,
    },
    model: {
      loaded: model.loaded,
      path: model.path,
    },
  })
}
