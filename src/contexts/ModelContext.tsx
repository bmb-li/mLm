import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { initLlama } from '../../modules/llama.rn/src'
import type { LlamaContext } from '../../modules/llama.rn/src'
import { loadContextParams, type ContextParams } from '../utils/storage'

const ACTIVE_MODEL_KEY = '@llama_active_model'

interface MultimodalSupport {
  vision: boolean
  audio: boolean
}

interface ModelState {
  context: LlamaContext | null
  isModelReady: boolean
  isLoading: boolean
  initProgress: number
  activeModelName: string | null
  loadModel: (path: string, name: string, mmprojPath?: string) => Promise<LlamaContext>
  unloadModel: () => Promise<void>
  clearCache: () => Promise<void>
  multimodalSupport: MultimodalSupport | null
  mmprojPath: string | null
}

const ModelContext = createContext<ModelState | null>(null)

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<LlamaContext | null>(null)
  const [isModelReady, setIsModelReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [initProgress, setInitProgress] = useState(0)
  const [activeModelName, setActiveModelName] = useState<string | null>(null)
  const [multimodalSupport, setMultimodalSupport] = useState<MultimodalSupport | null>(null)
  const [mmprojPath, setMmprojPath] = useState<string | null>(null)
  const contextRef = useRef<LlamaContext | null>(null)
  const mmprojPathRef = useRef<string | null>(null)

  useEffect(() => {
    contextRef.current = context
  }, [context])

  useEffect(() => () => {
    if (contextRef.current) {
      void contextRef.current.release().catch(() => {})
    }
  }, [])

  const loadModel = useCallback(async (path: string, name: string, mmprojPath?: string): Promise<LlamaContext> => {
    try {
      setIsLoading(true)
      setInitProgress(0)
      setMultimodalSupport(null)
      setMmprojPath(null)
      mmprojPathRef.current = null

      const cp: ContextParams | null = await loadContextParams()
      const nSlots = cp?.n_parallel ?? 1
      const llamaContext = await initLlama(
        { model: path, n_parallel: nSlots, ...(cp || {}) },
        (progress) => setInitProgress(Math.round(progress * 0.8)),
      )

      if (contextRef.current && contextRef.current !== llamaContext) {
        await contextRef.current.release()
      }

      await llamaContext.parallel.enable({ n_parallel: nSlots, n_batch: 512 })

      if (mmprojPath) {
        setInitProgress(85)
        const imgMaxTokens = cp?.image_max_tokens
          ? parseInt(String(cp.image_max_tokens), 10)
          : undefined
        const success = await llamaContext.initMultimodal({
          path: mmprojPath,
          use_gpu: true,
          image_max_tokens: imgMaxTokens && !Number.isNaN(imgMaxTokens) ? imgMaxTokens : undefined,
        })
        if (success) {
          setInitProgress(95)
          const support = await llamaContext.getMultimodalSupport()
          setMultimodalSupport(support)
          setMmprojPath(mmprojPath)
          mmprojPathRef.current = mmprojPath
        }
      }

      contextRef.current = llamaContext
      setContext(llamaContext)
      setIsModelReady(true)
      setActiveModelName(name)
      setInitProgress(100)

      await AsyncStorage.setItem(ACTIVE_MODEL_KEY, JSON.stringify({ path, name, mmprojPath }))
      return llamaContext
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
    setMultimodalSupport(null)
    setMmprojPath(null)
    mmprojPathRef.current = null
    await AsyncStorage.removeItem(ACTIVE_MODEL_KEY)
    if (current) {
      if (mmprojPathRef.current) {
        await current.releaseMultimodal()
      }
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
      multimodalSupport, mmprojPath,
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
