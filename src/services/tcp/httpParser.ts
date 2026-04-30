import { Buffer } from 'buffer'

const DOUBLE_CRLF = Buffer.from('\r\n\r\n')

export interface ParsedHTTPRequest {
  method: string
  path: string
  rawPath: string
  headers: Record<string, string>
  body: string
}

export function parseHTTPRequest(buffer: Buffer): {
  request?: ParsedHTTPRequest
  needsMoreData: boolean
  remainingBuffer: Buffer
} {
  const headerEndIdx = buffer.indexOf(DOUBLE_CRLF)
  if (headerEndIdx === -1) {
    return { needsMoreData: true, remainingBuffer: buffer }
  }

  const headerBytes = buffer.slice(0, headerEndIdx)
  const headerStr = headerBytes.toString('utf8')
  const lines = headerStr.split('\r\n')
  const requestLine = lines[0]
  const parts = requestLine.split(' ')

  if (parts.length < 2) {
    return { needsMoreData: true, remainingBuffer: buffer }
  }

  const method = parts[0]
  const rawPath = parts[1]
  const path = rawPath.split('?')[0]

  const headers: Record<string, string> = {}
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(':')
    if (colonIdx > 0) {
      const key = lines[i].slice(0, colonIdx).trim().toLowerCase()
      const value = lines[i].slice(colonIdx + 1).trim()
      headers[key] = value
    }
  }

  const contentLength = parseInt(headers['content-length'] || '0', 10)
  const bodyByteStart = headerEndIdx + 4
  const totalNeeded = bodyByteStart + contentLength

  if (buffer.length < totalNeeded) {
    return { needsMoreData: true, remainingBuffer: buffer }
  }

  const body = buffer.slice(bodyByteStart, totalNeeded).toString('utf8')
  const remainingBuffer = buffer.slice(totalNeeded)

  return {
    request: { method, path, rawPath, headers, body },
    needsMoreData: false,
    remainingBuffer,
  }
}
