import { Buffer } from 'buffer'

export function sendHTTPResponse(
  socket: any,
  status: number,
  headers: Record<string, string>,
  body: string,
): void {
  if (socket.destroyed) return

  const statusText = getHTTPStatusText(status)
  const responseHeaders: Record<string, string> = {
    'Content-Length': Buffer.byteLength(body, 'utf8').toString(),
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  }

  const headerLines = Object.entries(responseHeaders)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\r\n')

  const response = `HTTP/1.1 ${status} ${statusText}\r\n${headerLines}\r\n\r\n${body}`

  try {
    socket.write(response)
  } catch {
    try { socket.destroy() } catch {}
  }
}

export function sendJSONResponse(
  socket: any,
  status: number,
  payload: any,
): void {
  const body = JSON.stringify(payload)
  sendHTTPResponse(socket, status, { 'Content-Type': 'application/json; charset=utf-8' }, body)
}

export function sendCORSResponse(socket: any): void {
  sendHTTPResponse(socket, 204, {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }, '')
}

export function sendSSEStart(socket: any, status: number = 200): void {
  if (socket.destroyed) return
  const response =
    `HTTP/1.1 ${status} ${getHTTPStatusText(status)}\r\n` +
    `Content-Type: text/event-stream\r\n` +
    `Cache-Control: no-cache\r\n` +
    `Connection: keep-alive\r\n` +
    `Access-Control-Allow-Origin: *\r\n` +
    `Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n` +
    `Access-Control-Allow-Headers: Content-Type, Authorization\r\n` +
    `\r\n`

  try {
    socket.write(response)
  } catch {
    try { socket.destroy() } catch {}
  }
}

export function writeSSEEvent(socket: any, data: any): void {
  if (socket.destroyed) return
  try {
    socket.write(`data: ${JSON.stringify(data)}\n\n`)
  } catch {
    try { socket.destroy() } catch {}
  }
}

export function endSSEStream(socket: any): void {
  if (socket.destroyed) return
  try {
    socket.write(`data: [DONE]\n\n`)
    socket.end()
  } catch {
    try { socket.destroy() } catch {}
  }
}

export function sendChunkedResponseStart(
  socket: any,
  status: number,
  contentType: string = 'application/x-ndjson',
): void {
  if (socket.destroyed) return
  const response =
    `HTTP/1.1 ${status} ${getHTTPStatusText(status)}\r\n` +
    `Content-Type: ${contentType}\r\n` +
    `Transfer-Encoding: chunked\r\n` +
    `Access-Control-Allow-Origin: *\r\n` +
    `Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n` +
    `Access-Control-Allow-Headers: Content-Type, Authorization\r\n` +
    `\r\n`

  try {
    socket.write(response)
  } catch {
    try { socket.destroy() } catch {}
  }
}

export function writeChunk(socket: any, data: string): void {
  if (socket.destroyed) return
  const chunk = Buffer.from(data, 'utf8')
  const header = chunk.length.toString(16)
  try {
    socket.write(`${header}\r\n`)
    socket.write(chunk)
    socket.write(`\r\n`)
  } catch {
    try { socket.destroy() } catch {}
  }
}

export function endChunkedResponse(socket: any): void {
  if (socket.destroyed) return
  try {
    socket.write(`0\r\n\r\n`)
    socket.end()
  } catch {
    try { socket.destroy() } catch {}
  }
}

function getHTTPStatusText(status: number): string {
  const texts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  }
  return texts[status] || 'Unknown'
}
