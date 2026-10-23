import { useState, useEffect, useRef, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TCPServer } from '../services/tcp/TCPServer'
import type { CompletionSettings } from '../services/tcp/settingsBuilder'
import type { ParsedMessage } from '../services/tcp/messageParser'
import type {
  CompletionResult,
  CompletionTokenData,
  CompletionTimings,
  ModelSpeed,
  OnCompletionToken,
} from '../services/tcp/types'
import { loadCustomModels, type CustomModel } from '../utils/storage'
import { useModelContext } from '../contexts/ModelContext'

const TOOL_CALLING_KEY = '@llama_server_tool_calling'

interface ServerState {
  isRunning: boolean
  url: string
  port: number
  clientCount: number
  isLoading: boolean
  logs: string[]
  toolCallingEnabled: boolean
}

export function useLocalServer() {
  const [state, setState] = useState<ServerState>({
    isRunning: false,
    url: '',
    port: 8889,
    clientCount: 0,
    isLoading: false,
    logs: [],
    toolCallingEnabled: true,
  })

  const [activeModel, setActiveModel] = useState<{ name: string; path: string } | null>(null)
  const [modelSpeed, setModelSpeed] = useState<ModelSpeed | null>(null)

  const serverRef = useRef<TCPServer | null>(null)
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeModelRef = useRef<{ name: string; path: string } | null>(null)
  const modelContext = useModelContext()

  const syncActiveModel = useCallback(() => {
    if (modelContext.activeModelName) {
      const entry = { name: modelContext.activeModelName, path: '' }
      activeModelRef.current = entry
      setActiveModel(entry)
    } else {
      activeModelRef.current = null
      setActiveModel(null)
    }
  }, [modelContext.activeModelName])

  useEffect(() => {
    syncActiveModel()
  }, [syncActiveModel])

  useEffect(() => {
    AsyncStorage.getItem(TOOL_CALLING_KEY).then(val => {
      if (val !== null) {
        setState(prev => ({ ...prev, toolCallingEnabled: val === 'true' }))
      }
    }).catch(() => {})
  }, [])

  const getActiveModel = useCallback(() => {
    return activeModelRef.current
  }, [])

  const setToolCallingEnabled = useCallback(async (enabled: boolean) => {
    setState(prev => ({ ...prev, toolCallingEnabled: enabled }))
    await AsyncStorage.setItem(TOOL_CALLING_KEY, enabled ? 'true' : 'false')
  }, [])

  const modelContextRef = useRef(modelContext)
  modelContextRef.current = modelContext
  const toolCallingRef = useRef(true)
  toolCallingRef.current = state.toolCallingEnabled

  const generateCompletion = useCallback(async (
    messages: ParsedMessage[],
    settings?: CompletionSettings,
    onToken?: OnCompletionToken,
    modelId?: string,
  ): Promise<CompletionResult> => {
    const mc = modelContextRef.current
    let ctx = mc.context

    if (!ctx && modelId) {
      const customModels = await loadCustomModels()
      const found = customModels.find(m => m.id === modelId || m.filename === modelId)
      if (found?.localPath) {
        serverRef.current?.addLog(`Auto-loading model: ${modelId}`)
        ctx = await mc.loadModel(found.localPath, modelId, found.mmprojLocalPath)
      } else {
        throw new Error(`Model "${modelId}" not found locally`)
      }
    }

    if (!ctx) throw new Error('No model loaded')

    if (modelId && modelId !== mc.activeModelName) {
      const customModels = await loadCustomModels()
      const found = customModels.find(m => m.id === modelId || m.filename === modelId)
      if (found?.localPath) {
        serverRef.current?.addLog(`Switching to model: ${modelId}`)
        ctx = await mc.loadModel(found.localPath, modelId, found.mmprojLocalPath)
      } else {
        throw new Error(`Model "${modelId}" not found locally`)
      }
    }

    const completionParams: any = {
      messages,
      // Match the in-app chat path: let llama.cpp split reasoning_content out of
      // the generated text (required for models with non-<think> markup, e.g.
      // MiniCPM's <|im_start|>think role). Clients can opt out with "none".
      reasoning_format: settings?.reasoning_format ?? 'auto',
      ...(settings?.enable_thinking != null && { enable_thinking: settings.enable_thinking }),
      ...(settings?.chat_template_kwargs != null && { chat_template_kwargs: settings.chat_template_kwargs }),
      n_predict: settings?.n_predict ?? 2048,
      temperature: settings?.temperature ?? 0.7,
      ...(settings?.top_p != null && { top_p: settings.top_p }),
      ...(settings?.top_k != null && { top_k: settings.top_k }),
      ...(settings?.repeat_penalty != null && { repeat_penalty: settings.repeat_penalty }),
      ...(settings?.seed != null && { seed: settings.seed }),
      ...(settings?.stop != null && settings.stop.length > 0 && { stop: settings.stop }),
      ...(settings?.ignore_eos != null && { ignore_eos: settings.ignore_eos }),
      ...(settings?.tools != null && toolCallingRef.current && { tools: settings.tools }),
      ...(settings?.tool_choice != null && toolCallingRef.current && { tool_choice: settings.tool_choice }),
      ...(settings?.response_format != null && { response_format: settings.response_format }),
      ...(settings?.tools != null && !toolCallingRef.current && { tools: undefined }),
      ...(settings?.tool_choice != null && !toolCallingRef.current && { tool_choice: undefined }),
    }

    // Live output speed: measure from the first streamed token so prompt
    // processing time is not mixed into the generation rate.
    let generatedTokens = 0
    let firstTokenAt = 0
    let lastSpeedUpdate = 0

    const { promise, stop } = await ctx.parallel.completion(
      completionParams,
      onToken ? (_reqId: number, data: any) => {
        generatedTokens += 1
        const now = Date.now()
        if (!firstTokenAt) firstTokenAt = now
        if (now - lastSpeedUpdate >= 500) {
          lastSpeedUpdate = now
          const elapsedSeconds = (now - firstTokenAt) / 1000
          if (elapsedSeconds > 0) {
            setModelSpeed(prev => ({
              promptPerSecond: prev?.promptPerSecond ?? 0,
              promptTokens: prev?.promptTokens ?? 0,
              predictedPerSecond: generatedTokens / elapsedSeconds,
              predictedTokens: generatedTokens,
              live: true,
            }))
          }
        }

        const delta: CompletionTokenData = {
          token: data.token || '',
          content: data.content,
          reasoning_content: data.reasoning_content,
          accumulated_text: data.accumulated_text,
        }
        if (!onToken(delta)) {
          stop()
        }
      } : undefined,
    )

    let result: Awaited<typeof promise>
    try {
      result = await promise
    } catch (error) {
      // Keep the last estimate but stop showing it as live.
      setModelSpeed(prev => (prev ? { ...prev, live: false } : prev))
      throw error
    }

    // Authoritative per-request numbers from llama.rn (`prompt_*` = input,
    // `predicted_*` = output). They also replace the live estimate above.
    const timings = (result as { timings?: CompletionTimings }).timings
    if (timings) {
      setModelSpeed({
        promptPerSecond: timings.prompt_per_second || 0,
        predictedPerSecond: timings.predicted_per_second || 0,
        promptTokens: timings.prompt_n || 0,
        predictedTokens: timings.predicted_n || 0,
        live: false,
      })
    }
    // `accumulated_text` is only present when the native chat parser succeeded.
    // Without it the parsed content would be missing, so fall back to raw text.
    const parsed = typeof (result as any).accumulated_text === 'string'
    const parserProducedNothing = parsed
      && !result.content
      && !result.reasoning_content
      && !(result.tool_calls && result.tool_calls.length > 0)
    return {
      content: parsed && !parserProducedNothing ? (result.content || '') : (result.text || ''),
      text: result.text || '',
      reasoning_content: result.reasoning_content || '',
      tool_calls: result.tool_calls,
    }
  }, [])

  const generateEmbedding = useCallback(async (input: string): Promise<number[]> => {
    const ctx = modelContextRef.current.context
    if (!ctx) throw new Error('No model loaded')
    return (await ctx.embedding(input))?.embedding || []
  }, [])

  const listModels = useCallback(async () => {
    try {
      const customModels = await loadCustomModels()
      const models = customModels
        .filter(m => m.localPath?.includes('/llm/'))
        .map(m => ({
          id: m.id,
          owned_by: 'local',
          name: m.id,
          size: m.addedAt || 0,
          modified: m.addedAt ? new Date(m.addedAt).toISOString() : new Date().toISOString(),
        }))
      const active = activeModelRef.current
      if (active && !models.find(m => m.id === active.name)) {
        models.push({
          id: active.name,
          owned_by: 'local',
          name: active.name,
          size: 0,
          modified: new Date().toISOString(),
        })
      }
      return models
    } catch {
      return []
    }
  }, [])

  const getModelInfo = useCallback(async (name: string) => {
    const models = await listModels()
    const model = models.find(m => m.name === name || m.id === name)
    if (!model) throw new Error('Model not found')
    return model
  }, [listModels])

  const loadModel = useCallback(async (path: string, projectorPath?: string) => {
    try {
      const mc = modelContextRef.current
      const name = path.split('/').pop() || path
      await mc.loadModel(path, name)
    } catch (error) {
      serverRef.current?.addLog(`Failed to load model: ${error instanceof Error ? error.message : 'unknown'}`)
      throw error
    }
  }, [])

  const unloadModel = useCallback(async () => {
    const mc = modelContextRef.current
    await mc.unloadModel()
    activeModelRef.current = null
    setActiveModel(null)
    setModelSpeed(null)
    serverRef.current?.addLog('Model unloaded')
  }, [])

  const startServer = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }))
    setModelSpeed(null)

    try {
      const server = new TCPServer({
        generateCompletion,
        generateEmbedding,
        listModels,
        getModelInfo,
        loadModel,
        unloadModel,
        getActiveModel,
      })

      serverRef.current = server
      const status = await server.start()

      statusIntervalRef.current = setInterval(() => {
        if (serverRef.current) {
          const s = serverRef.current.getStatus()
          setState(prev => ({
            ...prev,
            isRunning: s.isRunning,
            url: s.url,
            clientCount: s.clientCount,
          }))
        }
      }, 2000)

      setState({
        isRunning: status.isRunning,
        url: status.url,
        port: status.port,
        clientCount: 0,
        isLoading: false,
        logs: [],
        toolCallingEnabled: toolCallingRef.current,
      })
    } catch (error) {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current)
        statusIntervalRef.current = null
      }
      setState(prev => ({ ...prev, isLoading: false }))
      throw error
    }
  }, [generateCompletion, generateEmbedding, listModels, getModelInfo, loadModel, unloadModel, getActiveModel])

  const stopServer = useCallback(async () => {
    setModelSpeed(null)
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current)
      statusIntervalRef.current = null
    }

    if (serverRef.current) {
      await serverRef.current.stop()
      serverRef.current = null
    }

      setState({
        isRunning: false,
        url: '',
        port: 8889,
        clientCount: 0,
        isLoading: false,
        logs: [],
        toolCallingEnabled: toolCallingRef.current,
      })
  }, [])

  useEffect(() => {
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current)
      }
      if (serverRef.current) {
        serverRef.current.stop().catch(() => {})
      }
    }
  }, [])

  return {
    state,
    startServer,
    stopServer,
    loadModel,
    unloadModel,
    activeModel,
    modelSpeed,
    setToolCallingEnabled,
  }
}
