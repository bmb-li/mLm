import AsyncStorage from '@react-native-async-storage/async-storage'

const APPS_META_KEY = '@appgen_apps'
const APP_CODE_PREFIX = '@appgen_code_'

export interface SavedAppMeta {
  id: string
  name: string
  createdAt: number
}

export const saveApp = async (id: string, name: string, htmlCode: string): Promise<void> => {
  const metas = await getSavedAppsMeta()
  if (!metas.find(m => m.id === id)) {
    metas.push({ id, name, createdAt: Date.now() })
  }
  await AsyncStorage.setItem(APPS_META_KEY, JSON.stringify(metas))
  await AsyncStorage.setItem(APP_CODE_PREFIX + id, htmlCode)
}

export const getSavedAppsMeta = async (): Promise<SavedAppMeta[]> => {
  try {
    const json = await AsyncStorage.getItem(APPS_META_KEY)
    return json ? JSON.parse(json) : []
  } catch { return [] }
}

export const getAppCode = async (id: string): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(APP_CODE_PREFIX + id)
  } catch { return null }
}

export const deleteApp = async (id: string): Promise<void> => {
  const metas = await getSavedAppsMeta()
  await AsyncStorage.setItem(APPS_META_KEY, JSON.stringify(metas.filter(m => m.id !== id)))
  await AsyncStorage.removeItem(APP_CODE_PREFIX + id)
}

export const updateAppName = async (id: string, name: string): Promise<void> => {
  const metas = await getSavedAppsMeta()
  const m = metas.find(m => m.id === id)
  if (m) m.name = name
  await AsyncStorage.setItem(APPS_META_KEY, JSON.stringify(metas))
}
