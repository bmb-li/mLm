import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SearchEngine } from '../types'

const SEARCH_ENABLED_KEY = '@llama_search_enabled'
const SEARCH_ENGINE_KEY = '@llama_search_engine'
const TAVILY_API_KEY_KEY = '@llama_tavily_api_key'

export async function loadSearchEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(SEARCH_ENABLED_KEY)
    return val === 'true'
  } catch {
    return false
  }
}

export async function saveSearchEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SEARCH_ENABLED_KEY, enabled ? 'true' : 'false')
}

export async function loadSearchEngine(): Promise<SearchEngine> {
  try {
    const val = await AsyncStorage.getItem(SEARCH_ENGINE_KEY)
    if (val === 'google' || val === 'bing' || val === 'baidu' || val === 'tavily' || val === 'metaso') {
      return val
    }
  } catch {}
  return 'google'
}

export async function saveSearchEngine(engine: SearchEngine): Promise<void> {
  await AsyncStorage.setItem(SEARCH_ENGINE_KEY, engine)
}

export async function loadTavilyApiKey(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(TAVILY_API_KEY_KEY)) || ''
  } catch {
    return ''
  }
}

export async function saveTavilyApiKey(key: string): Promise<void> {
  await AsyncStorage.setItem(TAVILY_API_KEY_KEY, key)
}
