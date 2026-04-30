import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { initLlama } from '../../modules/llama.rn/src'
import type { LlamaContext } from '../../modules/llama.rn/src'
import { loadContextParams, type ContextParams } from '../utils/storage'

const ACTIVE_MODEL_KEY = '@llama_active_model'

interface ModelState {
  context: LlamaContext | null
  isModelReady: boolean
  isLoading: boolean
  initProgress: number
  activeModelName: string | null
  loadModel: (path: string, name: string) => Promise<void>
  unloadModel: () => Promise<void>
  clearCache: () => Promise<void>
}

const ModelContext = createContext<ModelState | null>(null)

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<LlamaContext | null>(null)
  const [isModelReady, setIsModelReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [initProgress, setInitProgress] = useState(0)
  const [activeModelName, setActiveModelName] = useState<string | null>(null)
  const contextRef = useRef<LlamaContext | null>(null)

  useEffect(() => {
    contextRef.current = context
  }, [context])

  useEffect(() => () => {
    if (contextRef.current) {
      void contextRef.current.release().catch(() => {})
    }
  }, [])

  const loadModel = useCallback(async (path: string, name: string) => {
    try {
      setIsLoading(true)
      setInitProgress(0)

      const cp: ContextParams | null = await loadContextParams()
      const llamaContext = await initLlama(
        { model: path, n_parallel: 8, ...(cp || {}) },
        (progress) => setInitProgress(progress),
      )

      if (contextRef.current && contextRef.current !== llamaContext) {
        await contextRef.current.release()
      }

      await llamaContext.parallel.enable({ n_parallel: 4, n_batch: 512 })

      contextRef.current = llamaContext
      setContext(llamaContext)
      setIsModelReady(true)
      setActiveModelName(name)
      setInitProgress(100)

      await AsyncStorage.setItem(ACTIVE_MODEL_KEY, JSON.stringify({ path, name }))
    } catch (error: any) {
      console.error('Failed to load model:', error)
      throw error
    } finally {
      setIsLoading(false)
      setInitProgress(0)
    }
  }, [])

  const unloadModel = useCallback(async () => {
    const current = contextRef.current
    contextRef.current = null
    setContext(null)
    setIsModelReady(false)
    setActiveModelName(null)
    await AsyncStorage.removeItem(ACTIVE_MODEL_KEY)
    if (current) {
      await current.release()
    }
  }, [])

  const clearCache = useCallback(async () => {
    if (contextRef.current) {
      await contextRef.current.clearCache()
    }
  }, [])

  return (
    <ModelContext.Provider value={{
      context, isModelReady, isLoading, initProgress, activeModelName,
      loadModel, unloadModel, clearCache,
    }}>
      {children}
    </ModelContext.Provider>
  )
}

export function useModelContext(): ModelState {
  const ctx = useContext(ModelContext)
  if (!ctx) throw new Error('useModelContext must be used within ModelProvider')
  return ctx
}
