import { useState, useEffect, useRef, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TCPServer } from '../services/tcp/TCPServer'
import type { CompletionSettings } from '../services/tcp/settingsBuilder'
import type { CustomModel } from '../utils/storage'
import { useModelContext } from '../contexts/ModelContext'

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

  const getActiveModel = useCallback(() => {
    return activeModelRef.current
  }, [])

  const generateCompletion = useCallback(async (
    messages: { role: string; content: string }[],
    settings?: CompletionSettings,
    onToken?: (token: string) => boolean,
    modelId?: string,
  ): Promise<string> => {
    if (modelId && (modelId !== modelContext.activeModelName)) {
      const json = await AsyncStorage.getItem('@llama_custom_models')
      const customModels: CustomModel[] = json ? JSON.parse(json) : []
      const found = customModels.find(m => m.id === modelId || m.filename === modelId)
      if (found?.localPath) {
        serverRef.current?.addLog(`Auto-loading model: ${modelId}`)
        await modelContext.loadModel(found.localPath, modelId)
      } else {
        throw new Error(`Model "${modelId}" not found locally`)
      }
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

    let stopped = false
    const result = await modelContext.completion(completionParams, (data) => {
      const token = data.token || ''
      if (token) {
        if (!onToken?.(token)) {
          stopped = true
          modelContext.stopCompletion()
        }
      }
    })

    return result.content || result.text || ''
  }, [modelContext])

  const generateEmbedding = useCallback(async (input: string): Promise<number[]> => {
    return await modelContext.embedding(input)
  }, [modelContext])

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
      const name = path.split('/').pop() || path
      await modelContext.loadModel(path, name)
    } catch (error) {
      serverRef.current?.addLog(`Failed to load model: ${error instanceof Error ? error.message : 'unknown'}`)
      throw error
    }
  }, [modelContext])

  const unloadModel = useCallback(async () => {
    await modelContext.unloadModel()
    activeModelRef.current = null
    setActiveModel(null)
    serverRef.current?.addLog('Model unloaded')
  }, [modelContext])

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

    setState({
      isRunning: false,
      url: '',
      port: 8889,
      clientCount: 0,
      isLoading: false,
      logs: [],
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
  }
}
