import en from './translations/en'
import zh from './translations/zh'
import type { Language, TranslationStrings } from './types'

const translations: Record<Language, TranslationStrings> = { en, zh }

export type { Language, TranslationStrings }
export { translations }
