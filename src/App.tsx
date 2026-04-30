/* eslint-disable jsx-a11y/accessible-emoji */
import * as React from 'react'
import {
  StyleSheet,
} from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { enableScreens } from 'react-native-screens'
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native'
import {
  toggleNativeLog,
  addNativeLogListener,
} from '../modules/llama.rn/src'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { I18nProvider } from './contexts/I18nContext'
import { ModelProvider } from './contexts/ModelContext'
import RootNavigator from './navigation/RootNavigator'

toggleNativeLog(true)
addNativeLogListener((level, text) => {
  console.log(
    ['[rnllama]', level ? `[${level}]` : '', text].filter(Boolean).join(' '),
  )
})

enableScreens()

function AppContent() {
  const { theme } = useTheme()

  const navigationTheme = theme.dark ? {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.primary,
    },
  } : {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.primary,
    },
  }

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <NavigationContainer theme={navigationTheme}>
        <RootNavigator />
      </NavigationContainer>
    </GestureHandlerRootView>
  )
}

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ModelProvider>
          <AppContent />
        </ModelProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}

export default App
