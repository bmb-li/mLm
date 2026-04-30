import { useState, useEffect, useRef, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TCPServer } from '../services/tcp/TCPServer'
import { initLlama, releaseAllLlama } from '../../modules/llama.rn/src'
import type { LlamaContext } from '../../modules/llama.rn/src'
import type { CompletionSettings } from '../services/tcp/settingsBuilder'
import type { CustomModel, ContextParams } from '../utils/storage'
import { loadContextParams } from '../utils/storage'

interface ServerState {
  isRunning: boolean
  url: string
  port: number
  clientCount: number
  isLoading: boolean
  logs: string[]
}

export function useLocalServer() {
  const [state, setState] = useState<ServerState>({
    isRunning: false,
    url: '',
    port: 8889,
    clientCount: 0,
    isLoading: false,
    logs: [],
  })

  const [activeModel, setActiveModel] = useState<{ name: string; path: string } | null>(null)

  const serverRef = useRef<TCPServer | null>(null)
  const modelContextRef = useRef<LlamaContext | null>(null)
  const activeModelRef = useRef<{ name: string; path: string } | null>(null)
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completionQueueRef = useRef<Promise<void>>(Promise.resolve())

  const getActiveModel = useCallback(() => {
    return activeModelRef.current
  }, [])

  const loadModelInternal = useCallback(async (path: string, name: string) => {
    const contextParams: Partial<ContextParams> = await loadContextParams()
    const ctx = await initLlama({
      model: path,
      n_ctx: contextParams.n_ctx ?? 8192,
      n_gpu_layers: contextParams.n_gpu_layers ?? 99,
      use_mlock: contextParams.use_mlock ?? true,
      use_mmap: contextParams.use_mmap ?? true,
      n_batch: contextParams.n_batch ?? 512,
      n_ubatch: contextParams.n_ubatch ?? 512,
      ctx_shift: contextParams.ctx_shift ?? false,
      flash_attn_type: contextParams.flash_attn_type ?? 'auto',
      cache_type_k: (contextParams.cache_type_k ?? 'f16') as any,
      cache_type_v: (contextParams.cache_type_v ?? 'f16') as any,
      kv_unified: contextParams.kv_unified ?? false,
      swa_full: contextParams.swa_full ?? false,
    }, (progress) => {
      serverRef.current?.addLog(`Loading model: ${progress}%`)
    })
    modelContextRef.current = ctx
    activeModelRef.current = { name, path }
    setActiveModel({ name, path })
    serverRef.current?.addLog(`Model loaded: ${name}`)
  }, [])

  const generateCompletion = useCallback(async (
    messages: { role: string; content: string }[],
    settings?: CompletionSettings,
    onToken?: (token: string) => boolean,
    modelId?: string,
  ): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      completionQueueRef.current = completionQueueRef.current.then(async () => {
        try {
          if (modelId && (!activeModelRef.current || activeModelRef.current.name !== modelId)) {
            const json = await AsyncStorage.getItem('@llama_custom_models')
            const customModels: CustomModel[] = json ? JSON.parse(json) : []
            const found = customModels.find(m => m.id === modelId || m.filename === modelId)
            if (found?.localPath) {
              serverRef.current?.addLog(`Auto-loading model: ${modelId}`)
              await loadModelInternal(found.localPath, modelId)
            } else {
              throw new Error(`Model "${modelId}" not found locally`)
            }
          }
          if (!modelContextRef.current) {
            throw new Error('No model loaded')
          }

          const completionParams: any = {
            messages,
            n_predict: settings?.n_predict ?? 2048,
            temperature: settings?.temperature ?? 0.7,
            ...(settings?.top_p != null && { top_p: settings.top_p }),
            ...(settings?.top_k != null && { top_k: settings.top_k }),
            ...(settings?.repeat_penalty != null && { repeat_penalty: settings.repeat_penalty }),
            ...(settings?.seed != null && { seed: settings.seed }),
            ...(settings?.stop != null && settings.stop.length > 0 && { stop: settings.stop }),
            ...(settings?.ignore_eos != null && { ignore_eos: settings.ignore_eos }),
          }

          if (onToken) {
            let stopped = false
            const result = await modelContextRef.current.completion(
              completionParams,
              (data) => {
                const token = data.token || ''
                if (token) {
                  if (!onToken(token)) {
                    stopped = true
                    modelContextRef.current?.stopCompletion()
                  }
                }
              },
            )
            resolve(result.content || result.text || '')
          } else {
            const result = await modelContextRef.current.completion(completionParams)
            resolve(result.content || result.text || '')
          }
        } catch (error) {
          reject(error)
        }
      }).catch((error) => {
        reject(error)
      })
    })
  }, [])

  const generateEmbedding = useCallback(async (input: string): Promise<number[]> => {
    if (!modelContextRef.current) {
      throw new Error('No model loaded')
    }
    const result = await modelContextRef.current.embedding(input)
    return result?.embedding || []
  }, [])

  const listModels = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem('@llama_custom_models')
      const customModels: CustomModel[] = json ? JSON.parse(json) : []
      const models = customModels.map(m => ({
        id: m.id,
        owned_by: 'local',
        name: m.id,
        size: 0,
        modified: new Date(m.addedAt).toISOString(),
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
      await loadModelInternal(path, path.split('/').pop() || path)
    } catch (error) {
      serverRef.current?.addLog(`Failed to load model: ${error instanceof Error ? error.message : 'unknown'}`)
      throw error
    }
  }, [loadModelInternal])

  const unloadModel = useCallback(async () => {
    if (modelContextRef.current) {
      try {
        await releaseAllLlama()
      } catch {}
      modelContextRef.current = null
      activeModelRef.current = null
      setActiveModel(null)
      serverRef.current?.addLog('Model unloaded')
    }
  }, [])

  const startServer = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }))

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
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current)
      statusIntervalRef.current = null
    }

    if (serverRef.current) {
      await serverRef.current.stop()
      serverRef.current = null
    }

    await unloadModel()

    setState({
      isRunning: false,
      url: '',
      port: 8889,
      clientCount: 0,
      isLoading: false,
      logs: [],
    })
  }, [unloadModel])

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
  }
}
