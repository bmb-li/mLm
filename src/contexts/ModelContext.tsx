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
  loadModel: (path: string, name: string, mmprojPath?: string, vocoderPath?: string) => Promise<LlamaContext>
  unloadModel: () => Promise<void>
  clearCache: () => Promise<void>
  multimodalSupport: MultimodalSupport | null
  mmprojPath: string | null
  vocoderReady: boolean
  initVocoder: (path: string) => Promise<boolean>
  releaseVocoder: () => Promise<void>
  isVocoderEnabled: () => Promise<boolean>
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
  const [vocoderReady, setVocoderReady] = useState(false)
  const contextRef = useRef<LlamaContext | null>(null)
  const mmprojPathRef = useRef<string | null>(null)
  const writeLogRef = useRef<(tag: string, msg: string) => Promise<void>>(undefined as any)

  writeLogRef.current = async (tag: string, msg: string) => {
    try {
      const RNBlobUtil = require('react-native-blob-util').default || require('react-native-blob-util')
      const p = RNBlobUtil.fs.dirs.CacheDir + '/mlm_debug.log'
      const entry = `[${new Date().toISOString().slice(11,19)}] [${tag}] ${msg}\n`
      const prev = (await RNBlobUtil.fs.exists(p)) ? await RNBlobUtil.fs.readFile(p, 'utf8') : ''
      await RNBlobUtil.fs.writeFile(p, (prev + entry).slice(-10000), 'utf8')
    } catch {}
  }

  useEffect(() => {
    contextRef.current = context
  }, [context])

  useEffect(() => () => {
    if (contextRef.current) {
      void contextRef.current.release().catch(() => {})
    }
  }, [])

  const loadModel = useCallback(async (path: string, name: string, mmprojPath?: string, vocoderPath?: string): Promise<LlamaContext> => {
    try {
      setIsLoading(true)
      setInitProgress(0)
      setMultimodalSupport(null)
      setMmprojPath(null)
      setVocoderReady(false)
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

      writeLogRef.current?.('MODEL', 'parallel.enable start')
      await llamaContext.parallel.enable({ n_parallel: nSlots, n_batch: 512 })
      writeLogRef.current?.('MODEL', 'parallel.enable done')

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

      if (vocoderPath) {
        writeLogRef.current?.('MODEL', 'initVocoder start')
        const vocoderOk = await llamaContext.initVocoder({ path: vocoderPath, n_batch: 256 })
        writeLogRef.current?.('MODEL', `initVocoder done: ${vocoderOk}`)
        setVocoderReady(vocoderOk)
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
    setVocoderReady(false)
    mmprojPathRef.current = null
    await AsyncStorage.removeItem(ACTIVE_MODEL_KEY)
    if (current) {
      if (mmprojPathRef.current) {
        await current.releaseMultimodal()
      }
      await current.releaseVocoder()
      await current.release()
    }
  }, [])

  const clearCache = useCallback(async () => {
    if (contextRef.current) {
      await contextRef.current.clearCache()
    }
  }, [])

  const initVocoder = useCallback(async (path: string): Promise<boolean> => {
    if (!contextRef.current) return false
    try {
      const ok = await contextRef.current.initVocoder({ path, n_batch: 256 })
      setVocoderReady(ok)
      return ok
    } catch {
      setVocoderReady(false)
      return false
    }
  }, [])

  const releaseVocoder = useCallback(async () => {
    if (contextRef.current) {
      await contextRef.current.releaseVocoder()
    }
    setVocoderReady(false)
  }, [])

  const isVocoderEnabled = useCallback(async (): Promise<boolean> => {
    if (!contextRef.current) return false
    return await contextRef.current.isVocoderEnabled()
  }, [])

  return (
    <ModelContext.Provider value={{
      context, isModelReady, isLoading, initProgress, activeModelName,
      loadModel, unloadModel, clearCache,
      multimodalSupport, mmprojPath, vocoderReady, initVocoder, releaseVocoder, isVocoderEnabled,
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
