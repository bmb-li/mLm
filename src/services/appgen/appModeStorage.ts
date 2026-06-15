import AsyncStorage from '@react-native-async-storage/async-storage'
import { APP_GEN_PROMPT, SIMPLE_APP_GEN_PROMPT } from './prompts'

const CONFIG_KEY = '@appgen_config'

export interface AppGenConfig {
  mode: 'simple' | 'complex'
  simplePrompt?: string
  complexPrompt?: string
}

export const loadConfig = async (): Promise<AppGenConfig> => {
  try {
    const json = await AsyncStorage.getItem(CONFIG_KEY)
    if (json) return JSON.parse(json)
  } catch {}
  return { mode: 'complex' }
}

export const saveConfig = async (config: AppGenConfig): Promise<void> => {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export const getEffectivePrompt = (config: AppGenConfig): string => {
  if (config.mode === 'simple') {
    return config.simplePrompt || SIMPLE_APP_GEN_PROMPT
  }
  return config.complexPrompt || APP_GEN_PROMPT
}
