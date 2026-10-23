import { Buffer } from 'buffer'
import { parseHTTPRequest } from '../services/tcp/httpParser'

const request = (body: string, headers = '') => (
  `POST /v1/chat/completions HTTP/1.1\r\n` +
  `Host: localhost\r\n` +
  `Content-Type: application/json\r\n` +
  `${headers}` +
  `\r\n` +
  body
)

describe('parseHTTPRequest', () => {
  it('parses a Content-Length request', () => {
    const raw = request('{"a":1}', 'Content-Length: 7\r\n')
    const parsed = parseHTTPRequest(Buffer.from(raw))

    expect(parsed.needsMoreData).toBe(false)
    expect(parsed.request).toMatchObject({
      method: 'POST',
      path: '/v1/chat/completions',
      body: '{"a":1}',
    })
  })

  it('waits for a body split across packets', () => {
    const raw = request('{"hello":"world"}', 'Content-Length: 17\r\n')
    const first = Buffer.from(raw.slice(0, 40))
    const rest = Buffer.from(raw.slice(40))

    const partial = parseHTTPRequest(first)
    expect(partial.needsMoreData).toBe(true)

    const complete = parseHTTPRequest(Buffer.concat([first, rest]))
    expect(complete.needsMoreData).toBe(false)
    expect(complete.request?.body).toBe('{"hello":"world"}')
  })

  it('parses a chunked request body', () => {
    const raw =
      `POST /api/chat HTTP/1.1\r\n` +
      `Host: localhost\r\n` +
      `Transfer-Encoding: chunked\r\n` +
      `\r\n` +
      `5\r\nhello\r\n` +
      `6\r\n world\r\n` +
      `0\r\n\r\n`

    const parsed = parseHTTPRequest(Buffer.from(raw))
    expect(parsed.needsMoreData).toBe(false)
    expect(parsed.request?.body).toBe('hello world')
  })

  it('waits for a chunked body split across packets', () => {
    const raw =
      `POST /api/chat HTTP/1.1\r\n` +
      `Transfer-Encoding: chunked\r\n` +
      `\r\n` +
      `d\r\n{"text":"hi"}\r\n` +
      `0\r\n\r\n`

    const first = Buffer.from(raw.slice(0, raw.indexOf('hi') + 1))
    expect(parseHTTPRequest(first).needsMoreData).toBe(true)

    const complete = parseHTTPRequest(Buffer.from(raw))
    expect(complete.needsMoreData).toBe(false)
    expect(complete.request?.body).toBe('{"text":"hi"}')
  })

  it('accepts chunked trailers', () => {
    const raw =
      `POST /api/chat HTTP/1.1\r\n` +
      `Transfer-Encoding: chunked\r\n` +
      `\r\n` +
      `4\r\nping\r\n` +
      `0\r\n` +
      `X-Trace: abc\r\n` +
      `\r\n`

    const parsed = parseHTTPRequest(Buffer.from(raw))
    expect(parsed.needsMoreData).toBe(false)
    expect(parsed.request?.body).toBe('ping')
  })

  it('reports Expect: 100-continue while the body is missing', () => {
    const raw =
      `POST /v1/chat/completions HTTP/1.1\r\n` +
      `Content-Length: 100\r\n` +
      `Expect: 100-continue\r\n` +
      `\r\n`

    const parsed = parseHTTPRequest(Buffer.from(raw))
    expect(parsed.needsMoreData).toBe(true)
    expect(parsed.expectContinue).toBe(true)
  })

  it('keeps pipelined bytes in remainingBuffer', () => {
    const first = request('{"a":1}', 'Content-Length: 7\r\n')
    const second = request('{"b":2}', 'Content-Length: 7\r\n')
    const parsed = parseHTTPRequest(Buffer.from(first + second))

    expect(parsed.request?.body).toBe('{"a":1}')
    expect(parsed.remainingBuffer.toString('utf8')).toBe(second)
  })

  it('rejects an invalid chunk size', () => {
    const raw =
      `POST /api/chat HTTP/1.1\r\n` +
      `Transfer-Encoding: chunked\r\n` +
      `\r\n` +
      `zz\r\nbroken\r\n`

    const parsed = parseHTTPRequest(Buffer.from(raw))
    expect(parsed.error).toBe('invalid_chunk_size')
  })
})
