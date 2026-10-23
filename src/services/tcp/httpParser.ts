import { Buffer } from 'buffer'

const DOUBLE_CRLF = Buffer.from('\r\n\r\n')

export interface ParsedHTTPRequest {
  method: string
  path: string
  rawPath: string
  headers: Record<string, string>
  body: string
}

export interface HTTPParseResult {
  request?: ParsedHTTPRequest
  needsMoreData: boolean
  remainingBuffer: Buffer
  /** Client is waiting for `100 Continue` before sending the body. */
  expectContinue?: boolean
  /** Malformed request (e.g. invalid chunk framing). */
  error?: string
}

/**
 * Incrementally parse one HTTP/1.1 request.
 *
 * Supports:
 * - `Content-Length` bodies split across TCP packets
 * - `Transfer-Encoding: chunked` request bodies
 * - `Expect: 100-continue` (the caller must send the interim response)
 */
export function parseHTTPRequest(buffer: Buffer): HTTPParseResult {
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
    return { needsMoreData: true, remainingBuffer: buffer, error: 'invalid_request_line' }
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

  const bodyByteStart = headerEndIdx + 4
  const expectContinue = (headers['expect'] || '').toLowerCase() === '100-continue'
  const isChunked = (headers['transfer-encoding'] || '').toLowerCase().includes('chunked')

  if (isChunked) {
    const chunked = parseChunkedBody(buffer, bodyByteStart)
    if (chunked.error) {
      return {
        needsMoreData: false,
        remainingBuffer: Buffer.alloc(0),
        error: chunked.error,
      }
    }
    if (!chunked.complete) {
      return {
        needsMoreData: true,
        remainingBuffer: buffer,
        expectContinue,
      }
    }
    return {
      request: { method, path, rawPath, headers, body: chunked.body },
      needsMoreData: false,
      remainingBuffer: chunked.remainingBuffer,
    }
  }

  const contentLength = parseInt(headers['content-length'] || '0', 10)
  const totalNeeded = bodyByteStart + (Number.isFinite(contentLength) ? contentLength : 0)

  if (buffer.length < totalNeeded) {
    return { needsMoreData: true, remainingBuffer: buffer, expectContinue }
  }

  const body = buffer.slice(bodyByteStart, totalNeeded).toString('utf8')
  const remainingBuffer = buffer.slice(totalNeeded)

  return {
    request: { method, path, rawPath, headers, body },
    needsMoreData: false,
    remainingBuffer,
  }
}

function parseChunkedBody(buffer: Buffer, bodyStart: number): {
  complete: boolean
  body: string
  remainingBuffer: Buffer
  error?: string
} {
  let pos = bodyStart
  const chunks: Buffer[] = []

  while (true) {
    const lineEnd = buffer.indexOf('\r\n', pos)
    if (lineEnd === -1) {
      return { complete: false, body: '', remainingBuffer: buffer }
    }

    const sizeLine = buffer.slice(pos, lineEnd).toString('ascii')
    const sizeHex = sizeLine.split(';')[0].trim()
    if (!/^[0-9a-fA-F]+$/.test(sizeHex)) {
      return { complete: false, body: '', remainingBuffer: buffer, error: 'invalid_chunk_size' }
    }

    const size = parseInt(sizeHex, 16)
    pos = lineEnd + 2

    if (size === 0) {
      // Terminal chunk, optionally followed by trailers.
      if (buffer.length < pos + 2) {
        return { complete: false, body: '', remainingBuffer: buffer }
      }
      if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) {
        pos += 2
        break
      }
      const trailerEnd = buffer.indexOf(DOUBLE_CRLF, pos)
      if (trailerEnd === -1) {
        return { complete: false, body: '', remainingBuffer: buffer }
      }
      pos = trailerEnd + 4
      break
    }

    if (buffer.length < pos + size + 2) {
      return { complete: false, body: '', remainingBuffer: buffer }
    }

    chunks.push(buffer.slice(pos, pos + size))
    pos += size

    if (buffer[pos] !== 0x0d || buffer[pos + 1] !== 0x0a) {
      return { complete: false, body: '', remainingBuffer: buffer, error: 'invalid_chunk_terminator' }
    }
    pos += 2
  }

  return {
    complete: true,
    body: Buffer.concat(chunks).toString('utf8'),
    remainingBuffer: buffer.slice(pos),
  }
}
