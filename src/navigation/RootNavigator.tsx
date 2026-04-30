import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useTheme } from '../contexts/ThemeContext'
import MainTabNavigator from './MainTabNavigator'
import ExamplesGalleryScreen from '../screens/ExamplesGalleryScreen'
import ServerLogsScreen from '../screens/ServerLogsScreen'
import APISetupScreen from '../screens/APISetupScreen'
import SimpleChatScreen from '../screens/SimpleChatScreen'
import MultimodalScreen from '../screens/MultimodalScreen'
import TextCompletionScreen from '../screens/TextCompletionScreen'
import ToolCallsScreen from '../screens/ToolCallsScreen'
import ParallelDecodingScreen from '../screens/ParallelDecodingScreen'
import EmbeddingScreen from '../screens/EmbeddingScreen'
import TTSScreen from '../screens/TTSScreen'
import ModelInfoScreen from '../screens/ModelInfoScreen'
import BenchScreen from '../screens/BenchScreen'
import StressTestScreen from '../screens/StressTestScreen'
import type { RootStackParamList } from '../types/navigation'

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function RootNavigator() {
  const { theme } = useTheme()

  return (
    <Stack.Navigator
      id={undefined as any}
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.headerBackground,
        },
        headerTintColor: theme.colors.headerText,
        headerTitleStyle: {
          fontWeight: '600',
          color: theme.colors.headerText,
        },
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ExamplesGallery"
        component={ExamplesGalleryScreen}
        options={{ title: 'Example Demos' }}
      />
      <Stack.Screen
        name="SimpleChat"
        component={SimpleChatScreen}
        options={{ title: 'Simple Chat' }}
      />
      <Stack.Screen
        name="Multimodal"
        component={MultimodalScreen}
        options={{ title: 'Multimodal' }}
      />
      <Stack.Screen
        name="TextCompletion"
        component={TextCompletionScreen}
        options={{ title: 'Text Completion' }}
      />
      <Stack.Screen
        name="ToolCalling"
        component={ToolCallsScreen}
        options={{ title: 'Tool Calls' }}
      />
      <Stack.Screen
        name="ParallelDecoding"
        component={ParallelDecodingScreen}
        options={{ title: 'Parallel Decoding' }}
      />
      <Stack.Screen
        name="Embeddings"
        component={EmbeddingScreen}
        options={{ title: 'Embedding' }}
      />
      <Stack.Screen
        name="TTS"
        component={TTSScreen}
        options={{ title: 'Text to Speech' }}
      />
      <Stack.Screen
        name="ModelInfo"
        component={ModelInfoScreen}
        options={{ title: 'Model Info' }}
      />
      <Stack.Screen
        name="Bench"
        component={BenchScreen}
        options={{ title: 'Benchmark' }}
      />
      <Stack.Screen
        name="StressTest"
        component={StressTestScreen}
        options={{ title: 'Stress Test' }}
      />
      <Stack.Screen
        name="ServerLogs"
        component={ServerLogsScreen}
        options={{ title: 'Server Logs' }}
      />
      <Stack.Screen
        name="APISetup"
        component={APISetupScreen}
        options={{ title: 'API Setup Guide' }}
      />
    </Stack.Navigator>
  )
}
