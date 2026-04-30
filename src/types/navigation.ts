import type { NavigatorScreenParams } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'

export type TabParamList = {
  HomeTab: undefined
  ModelTab: undefined
  ServerTab: undefined
  SettingsTab: undefined
}

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>
  SimpleChat: undefined
  TextCompletion: undefined
  ParallelDecoding: undefined
  Multimodal: undefined
  ToolCalling: undefined
  Embeddings: undefined
  TTS: undefined
  ModelInfo: undefined
  Bench: undefined
  StressTest: undefined
  ExamplesGallery: undefined
  ServerLogs: undefined
  APISetup: undefined
  ChatHistory: undefined
  ModelSettings: undefined
}

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>

export type TabScreenProps<T extends keyof TabParamList> =
  BottomTabScreenProps<TabParamList, T>
