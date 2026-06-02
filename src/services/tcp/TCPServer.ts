import TcpSocket from 'react-native-tcp-socket'
import { Buffer } from 'buffer'
import { Platform } from 'react-native'

import { parseHTTPRequest } from './httpParser'
import {
  sendHTTPResponse,
  sendJSONResponse,
  sendCORSResponse,
  sendChunkedResponseStart,
  writeChunk,
  endChunkedResponse,
} from './responseUtils'
import { getHomepageHTML } from './homepageTemplate'
import { handleOpenAIChatCompletions, handleOpenAIModels } from './openaiHandler'
import { handleChatRequest, handleGenerateRequest } from './chatHandlers'
import { handleShowRequest, handleEmbeddingsRequest } from './modelManagementHandlers'
import type { CompletionSettings } from './settingsBuilder'
import type { ParsedMessage } from './messageParser'

interface ServerStatus {
  isRunning: boolean
  url: string
  port: number
  clientCount: number
}

interface CompletionResult {
  content: string
  text: string
  reasoning_content: string
  tool_calls?: Array<{
    id?: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

interface ServerContext {
  generateCompletion: (
    messages: ParsedMessage[],
    settings?: CompletionSettings,
    onToken?: (token: string) => boolean,
    modelId?: string,
  ) => Promise<CompletionResult>
  generateEmbedding: (input: string) => Promise<number[]>
  listModels: () => Promise<{ id: string; owned_by: string; name: string; size: number; modified: string }[]>
  getModelInfo: (name: string) => Promise<any>
  loadModel: (path: string, projectorPath?: string) => Promise<void>
  unloadModel: () => Promise<void>
  getActiveModel: () => { name: string; path: string } | null
}

export class TCPServer {
  private server: any = null
  private port: number = 8889
  private clients: Map<string, any> = new Map()
  private isRunningValue: boolean = false
  private localIP: string = '0.0.0.0'
  private clientSockets: Map<string, Buffer> = new Map()
  private pendingSockets: Set<any> = new Set()
  private loggedInfo: boolean = false
  private logEntries: string[] = []
  private maxLogEntries: number = 1000
  private debugLogs: Array<{
    id: number
    timestamp: string
    method: string
    path: string
    requestBody: string
    responseBody: string
    rawResult: string | null
    duration: number
  }> = []
  private debugLogId: number = 0
  private pendingDebugReqs: Map<any, { body: string; method: string; path: string; startTime: number }> = new Map()
  private pendingResults: Map<any, any> = new Map()
  private maxDebugLogs: number = 100

  private ctx: ServerContext

  constructor(ctx: ServerContext) {
    this.ctx = ctx
  }

  addLog(entry: string): void {
    this.logEntries.push(`[${new Date().toISOString()}] ${entry}`)
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.splice(0, this.logEntries.length - this.maxLogEntries)
    }
  }

  private recordDebugRequest(socket: any, method: string, path: string, body: string): void {
    this.pendingDebugReqs.set(socket, { body, method, path, startTime: Date.now() })
  }

  private recordDebugResponse(socket: any, rawResponse: string): void {
    const pending = this.pendingDebugReqs.get(socket)
    if (!pending) return
    this.pendingDebugReqs.delete(socket)

    const rawResult = this.pendingResults.get(socket)
    this.pendingResults.delete(socket)

    this.debugLogId++
    this.debugLogs.push({
      id: this.debugLogId,
      timestamp: new Date(pending.startTime).toISOString(),
      method: pending.method,
      path: pending.path,
      requestBody: this.truncateBody(pending.body),
      responseBody: this.truncateBody(rawResponse),
      rawResult: rawResult ? this.truncateBody(JSON.stringify(rawResult)) : null,
      duration: Date.now() - pending.startTime,
    })
    if (this.debugLogs.length > this.maxDebugLogs) {
      this.debugLogs.splice(0, this.debugLogs.length - this.maxDebugLogs)
    }
  }

  private truncateBody(body: string): string {
    if (body.length > 8000) return body.slice(0, 8000) + '... (truncated)'
    return body
  }

  getDebugLogs(): any[] {
    return [...this.debugLogs]
  }

  clearDebugLogs(): void {
    this.debugLogs = []
  }

  getLogs(): string[] {
    return [...this.logEntries]
  }

  clearLogs(): void {
    this.logEntries = []
  }

  async start(): Promise<ServerStatus> {
    if (this.isRunningValue) {
      return this.getStatus()
    }

    try {
      this.server = TcpSocket.createServer((socket: any) => {
        this.handleConnection(socket)
      })

      return new Promise((resolve, reject) => {
        this.server.listen({ port: this.port, host: '0.0.0.0' }, () => {
          this.isRunningValue = true
          this.detectLocalIP()
          this.addLog(`Server started on port ${this.port}`)
          resolve(this.getStatus())
        })

        this.server.on('error', (error: Error) => {
          this.addLog(`Server error: ${error.message}`)
          reject(error)
        })

        setTimeout(() => {
          if (!this.isRunningValue) {
            this.isRunningValue = true
            this.detectLocalIP()
            this.addLog(`Server started (fallback) on port ${this.port}`)
            resolve(this.getStatus())
          }
        }, 2000)
      })
    } catch (error) {
      this.addLog(`Start failed: ${error instanceof Error ? error.message : 'unknown'}`)
      throw error
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunningValue) return

    this.clients.forEach((socket) => {
      try { socket.destroy() } catch {}
    })
    this.clients.clear()
    this.clientSockets.clear()

    if (this.server) {
      try {
        this.server.close()
        this.server = null
      } catch {}
    }

    this.isRunningValue = false
    this.addLog('Server stopped')
  }

  getStatus(): ServerStatus {
    return {
      isRunning: this.isRunningValue,
      url: `http://${this.localIP}:${this.port}`,
      port: this.port,
      clientCount: this.clients.size,
    }
  }

  isRunning(): boolean {
    return this.isRunningValue
  }

  getClientCount(): number {
    return this.clients.size
  }

  private async detectLocalIP(): Promise<void> {
    try {
      const ip = await this.getLocalIPFromSocket()
      if (ip && ip !== '0.0.0.0') {
        this.localIP = ip
        return
      }
    } catch {}
    this.localIP = '127.0.0.1'
  }

  private getLocalIPFromSocket(): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const socket = TcpSocket.createConnection(
          { host: '8.8.8.8', port: 53 },
          () => {
            try {
              const addr: any = socket.address()
              socket.destroy()
              resolve(addr?.address || null)
            } catch {
              socket.destroy()
              resolve(null)
            }
          },
        )
        socket.on('error', () => {
          try { socket.destroy() } catch {}
          resolve(null)
        })
        setTimeout(() => {
          try { socket.destroy() } catch {}
          resolve(null)
        }, 3000)
      } catch {
        resolve(null)
      }
    })
  }

  private handleConnection(socket: any): void {
    const peerId = `peer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    this.clients.set(peerId, socket)
    this.clientSockets.set(peerId, Buffer.alloc(0))
    this.addLog(`Client connected: ${peerId}`)

    const originalWrite = socket.write.bind(socket)
    let responseBuffer = ''
    socket.write = (...args: any[]) => {
      const data = args[0]
      if (typeof data === 'string' || data instanceof Buffer) {
        responseBuffer += data.toString('utf8')
      }
      if (responseBuffer.includes('\r\n\r\n')) {
        const bodyStart = responseBuffer.indexOf('\r\n\r\n') + 4
        const responseBody = responseBuffer.slice(bodyStart)
        if (responseBody.length > 0 && responseBody !== '[DONE]\n\n') {
          this.recordDebugResponse(socket, responseBody)
        }
        responseBuffer = ''
      }
      return originalWrite(...args)
    }

    socket.on('data', (data: Buffer) => {
      this.handleData(peerId, socket, data)
    })

    socket.on('close', () => {
      this.clients.delete(peerId)
      this.clientSockets.delete(peerId)
      this.addLog(`Client disconnected: ${peerId}`)
    })

    socket.on('error', () => {
      this.clients.delete(peerId)
      this.clientSockets.delete(peerId)
    })
  }

  private handleData(peerId: string, socket: any, chunk: Buffer): void {
    const existing = this.clientSockets.get(peerId) || Buffer.alloc(0)
    const buffer = Buffer.concat([existing, chunk])

    while (true) {
      const text = buffer.toString('utf8')
      if (this.isHTTPRequest(text)) {
        const parsed = parseHTTPRequest(buffer)
        if (parsed.needsMoreData) {
          this.clientSockets.set(peerId, buffer)
          return
        }

        if (parsed.request) {
          this.clientSockets.set(peerId, parsed.remainingBuffer)
          if (parsed.request.method === 'POST') {
            this.recordDebugRequest(socket, parsed.request.method, parsed.request.path, parsed.request.body)
          }
          this.handleHTTPRequestSync(socket, parsed.request.method, parsed.request.path, parsed.request.body)
        }

        if (parsed.remainingBuffer.length === 0) {
          this.clientSockets.delete(peerId)
        }
        return
      }
      this.clientSockets.delete(peerId)
      return
    }
  }

  private handleHTTPRequestSync(socket: any, method: string, path: string, body: string): void {
    this.addLog(`${method} ${path}`)

    if (method === 'OPTIONS') { sendCORSResponse(socket); return }
    if (method === 'GET' && path === '/') { sendHTTPResponse(socket, 200, { 'Content-Type': 'text/html; charset=utf-8' }, getHomepageHTML()); return }
    if (method === 'GET' && path === '/v1/models') { this.handleModelsList(socket); return }
    if (method === 'GET' && path === '/api/status') { this.handleServerStatus(socket); return }
    if (method === 'GET' && path === '/api/tags') { this.handleApiTags(socket); return }
    if (method === 'GET' && path === '/api/ps') { this.handleApiPs(socket); return }
    if (method === 'GET' && path === '/api/debug') { this.handleDebugLogs(socket); return }
    if (method === 'POST' && path === '/api/debug/clear') { this.clearDebugLogs(); sendJSONResponse(socket, 200, { ok: true }); return }

    // Check extended API routing
    const segments = path.split('/').filter(s => s.length > 0)
    if (segments[0] === 'api' && segments[1] === 'chats') { sendJSONResponse(socket, 200, { chats: [] }); return }
    if (segments[0] === 'api' && segments[1] === 'files') { sendJSONResponse(socket, 200, { files: [] }); return }
    if (segments[0] === 'api' && segments[1] === 'settings') { sendJSONResponse(socket, 200, { settings: {} }); return }

    // POST routes - delegate to async handlers
    if ((method === 'POST' && path === '/v1/chat/completions') ||
        (method === 'POST' && path === '/api/chat') ||
        (method === 'POST' && path === '/api/generate') ||
        (method === 'POST' && path === '/api/show') ||
        (method === 'POST' && path === '/api/embeddings')) {
      this.handleHTTPRequest(socket, method, path, body).catch(() => {})
      return
    }

    sendJSONResponse(socket, 404, { error: 'not_found' })
  }

  private isHTTPRequest(data: string): boolean {
    const trimmed = data.trimStart()
    return /^(GET|POST|DELETE|OPTIONS|HEAD|PUT)\s/.test(trimmed)
  }

  private handleModelsList(socket: any): void {
    this.pendingSockets.add(socket)
    this.ctx.listModels().then(models => {
      const items = (models || []).map((m: any) => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.owned_by,
      }))
      sendJSONResponse(socket, 200, { object: 'list', data: items })
    }).catch(() => {
      sendJSONResponse(socket, 500, { error: { message: 'failed_to_list_models', type: 'server_error' } })
    }).finally(() => {
      this.pendingSockets.delete(socket)
    })
  }

  private handleServerStatus(socket: any): void {
    try {
      const status = this.getStatus()
      const model = this.ctx.getActiveModel()
      sendJSONResponse(socket, 200, {
        server: status,
        model: { loaded: model !== null, path: model?.path || null },
      })
    } catch (e) {
      sendJSONResponse(socket, 500, { error: 'internal_error' })
    }
  }

  private handleApiTags(socket: any): void {
    this.pendingSockets.add(socket)
    this.ctx.listModels().then(models => {
      sendJSONResponse(socket, 200, {
        models: (models || []).map((m: any) => ({ name: m.name, modified_at: m.modified, size: m.size })),
      })
    }).catch(() => {
      sendJSONResponse(socket, 500, { error: 'failed_to_list_models' })
    }).finally(() => {
      this.pendingSockets.delete(socket)
    })
  }

  private handleApiPs(socket: any): void {
    try {
      sendJSONResponse(socket, 200, { models: [] })
    } catch (e: any) {
      sendJSONResponse(socket, 500, { error: 'internal_error' })
    }
  }

  private handleDebugLogs(socket: any): void {
    sendJSONResponse(socket, 200, { logs: this.getDebugLogs() })
  }

  private async handleHTTPRequest(socket: any, method: string, path: string, body: string): Promise<void> {
    this.addLog(`${method} ${path}`)

    let modelId: string | undefined
    if (method === 'POST') {
      try { const p = JSON.parse(body); modelId = p.model } catch {}
    }

    if (method === 'POST' && path === '/v1/chat/completions') {
      await handleOpenAIChatCompletions(
        body, socket, method, path,
        async (messages, settings, onToken) => {
          const result = await this.ctx.generateCompletion(messages, settings, onToken, modelId)
          this.pendingResults.set(socket, result)
          return result
        },
        (s, st, msg) => sendJSONResponse(s, st, { error: { message: msg, type: 'server_error' } }),
      )
      return
    }

    if (method === 'POST' && path === '/api/chat') {
      await handleChatRequest(
        body, socket, method, path,
        async (messages, settings, onToken) => {
          const result = await this.ctx.generateCompletion(messages, settings, onToken, modelId)
          return result.content
        },
        (s, st, msg) => sendJSONResponse(s, st, { error: msg }),
      )
      return
    }

    if (method === 'POST' && path === '/api/generate') {
      await handleGenerateRequest(
        body, socket, method, path,
        async (messages, settings, onToken) => {
          const result = await this.ctx.generateCompletion(messages, settings, onToken, modelId)
          return result.content
        },
        (s, st, msg) => sendJSONResponse(s, st, { error: msg }),
      )
      return
    }

    if (method === 'POST' && path === '/api/show') {
      await handleShowRequest(
        body, socket, method, path,
        async (name) => this.ctx.getModelInfo(name),
        (s, st, msg) => sendJSONResponse(s, st, { error: msg }),
      )
      return
    }

    if (method === 'POST' && path === '/api/embeddings') {
      await handleEmbeddingsRequest(
        body, socket, method, path,
        async (input) => this.ctx.generateEmbedding(input),
        (s, st, msg) => sendJSONResponse(s, st, { error: msg }),
      )
      return
    }

    sendJSONResponse(socket, 404, { error: 'not_found' })
  }
}
