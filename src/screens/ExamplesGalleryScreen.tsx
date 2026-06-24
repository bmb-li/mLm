import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Dimensions, Alert,
} from 'react-native'
import ReactNativeBlobUtil from 'react-native-blob-util'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BuildInfo, getBackendDevicesInfo } from '../../modules/llama.rn/src'

const { width } = Dimensions.get('window')

interface DeviceInfoItem {
  deviceName: string
  backend: string
  type: string
  maxMemorySize: number
  metadata?: Record<string, any>
  description?: string
  variant?: string
}

const EXAMPLE_SCREENS = [
  { routeName: 'TextCompletion', labelKey: 'textCompletion', descKey: 'textCompletionDesc' as const },
  { routeName: 'ParallelDecoding', labelKey: 'parallelDecoding', descKey: 'parallelDecodingDesc' as const },
  { routeName: 'Embeddings', labelKey: 'embedding', descKey: 'embeddingDesc' as const },
  { routeName: 'TTS', labelKey: 'tts', descKey: 'ttsDesc' as const },
  { routeName: 'Bench', labelKey: 'bench', descKey: 'benchDesc' as const },
  { routeName: 'StressTest', labelKey: 'stressTest', descKey: 'stressTestDesc' as const },
]

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

export default function ExamplesGalleryScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme()
  
  const { t } = useI18n()
  const colors = theme.colors
  const [showDeviceInfo, setShowDeviceInfo] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfoItem[]>([])
  const [loadingDeviceInfo, setLoadingDeviceInfo] = useState(false)

  const loadAndShowDeviceInfo = async () => {
    setLoadingDeviceInfo(true)
    try {
      const devices = await getBackendDevicesInfo()
      setDeviceInfo(devices || [])
      setShowDeviceInfo(true)
    } catch (error: any) {
      Alert.alert(t.examples.error, (error.message || t.examples.loadDeviceInfoFailed))
    } finally {
      setLoadingDeviceInfo(false)
    }
  }

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

        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={loadAndShowDeviceInfo}
          disabled={loadingDeviceInfo}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 16 }}>🖥️</Text>
            <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 8, marginBottom: 0 }]}>
              {loadingDeviceInfo ? t.examples.loading : t.examples.deviceInfo}
            </Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.textSecondary, marginTop: 4 }]}>
            llama.cpp b{BuildInfo.number} ({BuildInfo.commit?.slice(0, 7)})
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showDeviceInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeviceInfo(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t.examples.deviceInfoTitle}</Text>
              <TouchableOpacity onPress={() => setShowDeviceInfo(false)}>
                <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator>
              {deviceInfo.length === 0 ? (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>
                  {t.examples.noDeviceInfo}
                </Text>
              ) : (
                deviceInfo.map((device, index) => (
                  <View key={index} style={[styles.deviceCard, { backgroundColor: colors.card }]}>
                    <View style={styles.deviceCardHeader}>
                      <Text style={[styles.deviceName, { color: colors.text }]} numberOfLines={1}>
                        {device.deviceName}
                      </Text>
                      <View style={[styles.deviceBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.deviceBadgeText}>{device.backend}</Text>
                      </View>
                    </View>
                    <Text style={[styles.deviceDetail, { color: colors.textSecondary }]}>
                      {t.examples.typeLabel}: {device.type.toUpperCase()}
                    </Text>
                    <Text style={[styles.deviceDetail, { color: colors.textSecondary }]}>
                      {t.examples.memoryLabel}: {formatBytes(device.maxMemorySize)}
                    </Text>
                    {device.metadata && Object.keys(device.metadata).length > 0 && (
                      <Text style={[styles.deviceDetail, { color: colors.textSecondary }]}>
                        {t.examples.metadataLabel}: {Object.entries(device.metadata)
                          .filter(([_, v]) => v === true)
                          .map(([k]) => k)
                          .join(', ')}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 12,
    padding: 20,
    width: width * 0.9,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  deviceCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#660880',
  },
  deviceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  deviceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  deviceBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  deviceDetail: {
    fontSize: 12,
    marginTop: 4,
  },
})
