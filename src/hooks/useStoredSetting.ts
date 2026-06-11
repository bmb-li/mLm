import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadCompletionParams,
  loadContextParams,
  loadCustomModels,
  loadMCPConfig,
  loadTTSParams,
  loadTtsEngine,
  loadTtsAutoSpeak,
  loadTtsSpeed,
  loadTtsVoice,
  type CompletionParams,
  type ContextParams,
  type CustomModel,
  type MCPConfig,
  type TTSParams,
  type TtsEngine,
} from '../utils/storage'

interface UseStoredSettingOptions<T> {
  initialValue: T | null
  logLabel: string
}

export interface StoredSettingResult<T> {
  value: T | null
  setValue: Dispatch<SetStateAction<T | null>>
  reload: () => Promise<T | null>
}

export function useStoredSetting<T>(
  loadValue: () => Promise<T>,
  { initialValue, logLabel }: UseStoredSettingOptions<T>,
): StoredSettingResult<T> {
  const [value, setValue] = useState<T | null>(initialValue)
  const initialValueRef = useRef<T | null>(initialValue)
  const isMountedRef = useRef(true)

  useEffect(() => {
    initialValueRef.current = initialValue
  }, [initialValue])

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    [],
  )

  const reload = useCallback(async () => {
    try {
      const nextValue = await loadValue()
      if (isMountedRef.current) {
        setValue(nextValue)
      }
      return nextValue
    } catch (error) {
      console.error(`Failed to load ${logLabel}:`, error)
      return initialValueRef.current
    }
  }, [loadValue, logLabel])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    value,
    setValue,
    reload,
  }
}

export const useStoredContextParams = () =>
  useStoredSetting<ContextParams>(loadContextParams, {
    initialValue: null,
    logLabel: 'context params',
  })

export const useStoredCompletionParams = () =>
  useStoredSetting<CompletionParams>(loadCompletionParams, {
    initialValue: null,
    logLabel: 'completion params',
  })

export const useStoredTTSParams = () =>
  useStoredSetting<TTSParams>(loadTTSParams, {
    initialValue: null,
    logLabel: 'TTS params',
  })

export const useStoredCustomModels = () =>
  useStoredSetting<CustomModel[]>(loadCustomModels, {
    initialValue: [],
    logLabel: 'custom models',
  })

export const useStoredMCPConfig = () =>
  useStoredSetting<MCPConfig>(loadMCPConfig, {
    initialValue: null,
    logLabel: 'MCP config',
  })

export const useTtsEngine = () =>
  useStoredSetting<TtsEngine>(loadTtsEngine, {
    initialValue: 'off',
    logLabel: 'TTS engine',
  })

export const useTtsAutoSpeak = () =>
  useStoredSetting<boolean>(loadTtsAutoSpeak, {
    initialValue: false,
    logLabel: 'TTS auto speak',
  })

export const useTtsSpeed = () =>
  useStoredSetting<number>(loadTtsSpeed, {
    initialValue: 1.0,
    logLabel: 'TTS speed',
  })

export const useTtsVoice = () =>
  useStoredSetting<string | null>(loadTtsVoice, {
    initialValue: null,
    logLabel: 'TTS voice',
  })
