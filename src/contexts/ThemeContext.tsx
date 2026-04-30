import React, { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Appearance } from 'react-native'
import type { ColorSchemeName } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeColors {
  primary: string
  background: string
  surface: string
  card: string
  white: string
  black: string
  text: string
  textSecondary: string
  border: string
  error: string
  disabled: string
  inputBackground: string
  shadow: string
  buttonBackground: string
  valid: string
  headerBackground: string
  headerText: string
  tabBarBackground: string
  tabBarActiveText: string
  tabBarInactiveText: string
  statusBarStyle: 'light' | 'dark'
  headerStatusBg: string
  navigationBar: string
}

export interface Theme {
  colors: ThemeColors
  dark: boolean
}

const lightColors: ThemeColors = {
  primary: '#007AFF',
  background: '#F5F5F5',
  surface: '#FFFFFF',
  card: '#EBEBEB',
  white: '#FFFFFF',
  black: '#000000',
  text: '#1A1A1A',
  textSecondary: '#8E8E93',
  border: '#E0E0E0',
  error: '#CC3B30',
  disabled: '#C0C0C0',
  inputBackground: '#F0F0F0',
  shadow: '#000000',
  buttonBackground: '#007AFF',
  valid: '#34A759',
  headerBackground: '#1A1A1A',
  headerText: '#FFFFFF',
  tabBarBackground: '#1A1A1A',
  tabBarActiveText: '#FFFFFF',
  tabBarInactiveText: 'rgba(255, 255, 255, 0.5)',
  statusBarStyle: 'light',
  headerStatusBg: '#000000',
  navigationBar: '#1A1A1A',
}

const darkColors: ThemeColors = {
  primary: '#0A84FF',
  background: '#121212',
  surface: '#1E1E1E',
  card: '#2C2C2E',
  white: '#FFFFFF',
  black: '#000000',
  text: '#F0F0F0',
  textSecondary: '#AEAEB2',
  border: '#3A3A3C',
  error: '#CC453A',
  disabled: '#48484A',
  inputBackground: '#2A2A2A',
  shadow: '#000000',
  buttonBackground: '#0A84FF',
  valid: '#34A759',
  headerBackground: '#1A1A1A',
  headerText: '#FFFFFF',
  tabBarBackground: '#1A1A1A',
  tabBarActiveText: '#FFFFFF',
  tabBarInactiveText: 'rgba(255, 255, 255, 0.5)',
  statusBarStyle: 'light',
  headerStatusBg: '#000000',
  navigationBar: '#1A1A1A',
}

export const lightTheme: Theme = {
  colors: lightColors,
  dark: false,
}

export const darkTheme: Theme = {
  colors: darkColors,
  dark: true,
}

interface ThemeContextType {
  theme: Theme
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = '@llama_theme_mode'

interface ThemeProviderProps {
  children: ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system')
  const [systemColorScheme, setSystemColorScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() || 'light',
  )

  const getEffectiveTheme = (
    mode: ThemeMode,
    systemScheme: ColorSchemeName,
  ): Theme => {
    if (mode === 'system') {
      return systemScheme === 'dark' ? darkTheme : lightTheme
    }
    return mode === 'dark' ? darkTheme : lightTheme
  }

  const theme = getEffectiveTheme(themeMode, systemColorScheme)
  const isDark = theme.dark

  const setThemeMode = async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode)
      setThemeModeState(mode)
    } catch (error) {
      console.error('Error saving theme mode:', error)
    }
  }

  const loadThemeMode = async () => {
    try {
      const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY)
      if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
        setThemeModeState(savedMode as ThemeMode)
      }
    } catch (error) {
      console.error('Error loading theme mode:', error)
    }
  }

  useEffect(() => {
    loadThemeMode()

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemColorScheme(colorScheme)
    })

    return () => subscription.remove()
  }, [])

  const contextValue: ThemeContextType = {
    theme,
    themeMode,
    setThemeMode,
    isDark,
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
