import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { translations } from '../i18n'
import type { Language, TranslationStrings } from '../i18n/types'

type I18nContextType = {
  language: Language
  setLanguage: (lang: Language) => Promise<void>
  t: TranslationStrings
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

const LANG_STORAGE_KEY = '@llama_language'

type I18nProviderProps = {
  children: ReactNode
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en')

  const setLanguage = useCallback(async (lang: Language) => {
    try {
      await AsyncStorage.setItem(LANG_STORAGE_KEY, lang)
      setLanguageState(lang)
    } catch (error) {
      console.error('Error saving language:', error)
    }
  }, [])

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const saved = await AsyncStorage.getItem(LANG_STORAGE_KEY)
        if (saved === 'en' || saved === 'zh') {
          setLanguageState(saved)
        }
      } catch (error) {
        console.error('Error loading language:', error)
      }
    }
    loadLanguage()
  }, [])

  const t = translations[language]

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
