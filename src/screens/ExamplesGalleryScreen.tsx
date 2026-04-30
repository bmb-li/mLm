import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BuildInfo, getBackendDevicesInfo } from '../../modules/llama.rn/src'

const EXAMPLE_SCREENS = [
  { routeName: 'SimpleChat', labelKey: 'simpleChat', descKey: 'simpleChatDesc' as const },
  { routeName: 'Multimodal', labelKey: 'multimodal', descKey: 'multimodalDesc' as const },
  { routeName: 'TextCompletion', labelKey: 'textCompletion', descKey: 'textCompletionDesc' as const },
  { routeName: 'ToolCalling', labelKey: 'toolCalls', descKey: 'toolCallsDesc' as const },
  { routeName: 'ParallelDecoding', labelKey: 'parallelDecoding', descKey: 'parallelDecodingDesc' as const },
  { routeName: 'Embeddings', labelKey: 'embedding', descKey: 'embeddingDesc' as const },
  { routeName: 'TTS', labelKey: 'tts', descKey: 'ttsDesc' as const },
  { routeName: 'ModelInfo', labelKey: 'modelInfo', descKey: 'modelInfoDesc' as const },
  { routeName: 'Bench', labelKey: 'bench', descKey: 'benchDesc' as const },
  { routeName: 'StressTest', labelKey: 'stressTest', descKey: 'stressTestDesc' as const },
]

export default function ExamplesGalleryScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors
  const [devices, setDevices] = useState<string[]>([])

  useEffect(() => {
    getBackendDevicesInfo().then(info => {
      setDevices(info.map(d => `${d.backend} (${(d as any).description || (d as any).variant || ''})`))
    }).catch(() => {})
  }, [])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {EXAMPLE_SCREENS.map(screen => (
          <TouchableOpacity
            key={screen.routeName}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate(screen.routeName)}
          >
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {t.examples[screen.labelKey]}
            </Text>
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
              {t.examples[screen.descKey]}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 16 }}>📱</Text>
            <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 8, marginBottom: 0 }]}>
              {t.settings.deviceInfo}
            </Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.textSecondary, marginBottom: 4 }]}>
            llama.cpp b{BuildInfo.number} ({BuildInfo.commit?.slice(0, 7)})
          </Text>
          {devices.length > 0 && devices.map((d, i) => (
            <Text key={i} style={[styles.cardDesc, { color: colors.textSecondary, marginBottom: 2 }]}>
              Backend {i + 1}: {d}
            </Text>
          ))}
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            CPU: arm64-v8a
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
})
