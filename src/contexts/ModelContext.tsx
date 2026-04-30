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
  isProcessing: boolean
  loadModel: (path: string, name: string) => Promise<void>
  unloadModel: () => Promise<void>
  completion: (params: any, onToken?: (data: any) => void) => Promise<any>
  embedding: (input: string) => Promise<number[]>
  stopCompletion: () => void
  clearCache: () => Promise<void>
}

const ModelContext = createContext<ModelState | null>(null)

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<LlamaContext | null>(null)
  const [isModelReady, setIsModelReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [initProgress, setInitProgress] = useState(0)
  const [activeModelName, setActiveModelName] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const contextRef = useRef<LlamaContext | null>(null)
  const stopRef = useRef<(() => Promise<void>) | null>(null)

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
      setIsProcessing(false)
      stopRef.current = null

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
    stopRef.current = null
    setContext(null)
    setIsModelReady(false)
    setActiveModelName(null)
    setIsProcessing(false)
    await AsyncStorage.removeItem(ACTIVE_MODEL_KEY)
    if (current) {
      await current.release()
    }
  }, [])

  const stopCompletion = useCallback(() => {
    stopRef.current?.()
    setIsProcessing(false)
  }, [])

  const clearCache = useCallback(async () => {
    if (contextRef.current) {
      await contextRef.current.clearCache()
    }
  }, [])

  const completion = useCallback(async (params: any, onToken?: (data: any) => void) => {
    const ctx = contextRef.current
    if (!ctx) throw new Error('No model loaded')

    setIsProcessing(true)
    try {
      const { promise, stop } = await ctx.parallel.completion(
        params,
        onToken ? (_reqId: number, data: any) => onToken(data) : undefined,
      )
      stopRef.current = stop
      const result = await promise
      return result
    } finally {
      stopRef.current = null
      setIsProcessing(false)
    }
  }, [])

  const embedding = useCallback(async (input: string): Promise<number[]> => {
    const ctx = contextRef.current
    if (!ctx) throw new Error('No model loaded')
    const { promise } = await ctx.parallel.embedding(input)
    const result = await promise
    return result?.embedding || []
  }, [])

  return (
    <ModelContext.Provider value={{
      context, isModelReady, isLoading, initProgress, activeModelName, isProcessing,
      loadModel, unloadModel, completion, embedding, stopCompletion, clearCache,
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
