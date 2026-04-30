import React, { useState, useCallback, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Switch, Clipboard, StyleSheet, Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import AppHeader from '../components/AppHeader'
import SettingsSection from '../components/SettingsSection'
import { useLocalServer } from '../hooks/useLocalServer'

const AUTO_SERVER_KEY = '@llama_auto_start_server'

export default function LocalServerScreen() {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors
  const { state, startServer, stopServer, activeModel } = useLocalServer()
  const [keepAwake, setKeepAwake] = useState(false)
  const [autoStart, setAutoStart] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(AUTO_SERVER_KEY).then(val => {
      if (val === 'true') {
        setAutoStart(true)
        console.log('[LocalServerScreen] Auto-start enabled, starting server...')
        if (!state.isRunning && !state.isLoading) {
          startServer().then(() => {
            console.log('[LocalServerScreen] Server started successfully')
          }).catch((e: any) => {
            console.log('[LocalServerScreen] Server start failed:', e?.message || e)
          })
        } else {
          console.log('[LocalServerScreen] Server already running or loading:', state.isRunning, state.isLoading)
        }
      }
    }).catch(() => {})
  }, [])

  const handleToggleAutoStart = useCallback(async (value: boolean) => {
    setAutoStart(value)
    await AsyncStorage.setItem(AUTO_SERVER_KEY, value ? 'true' : 'false')
    if (value && !state.isRunning && !state.isLoading) {
      try {
        await startServer()
      } catch (error: any) {
        Alert.alert(t.common.error, error.message || 'Server operation failed')
      }
    }
  }, [state.isRunning, state.isLoading, startServer, t])

  const handleToggleServer = useCallback(async () => {
    try {
      if (state.isRunning) {
        await stopServer()
      } else {
        await startServer()
      }
    } catch (error: any) {
      Alert.alert(t.common.error, error.message || 'Server operation failed')
    }
  }, [state.isRunning, startServer, stopServer])

  const getStatusColor = () => {
    if (state.isLoading) return '#FFA500'
    return state.isRunning ? '#28a745' : colors.textSecondary
  }

  const getStatusText = () => {
    if (state.isLoading) return t.server.statusStarting
    return state.isRunning ? t.server.statusRunning : t.server.statusStopped
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <AppHeader title={t.server.title} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsSection title={t.server.serverStatus}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 22 }}>🖥️</Text>
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: colors.text }]}>
                  API {t.server.title}
                </Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                  <Text style={[styles.statusText, { color: getStatusColor() }]}>
                    {getStatusText()}
                  </Text>
                </View>
              </View>
            </View>
            <Switch
              value={state.isRunning}
              onValueChange={handleToggleServer}
              disabled={state.isLoading}
              thumbColor={state.isRunning ? colors.primary : colors.textSecondary}
              trackColor={{ false: colors.border, true: colors.primary + '40' }}
            />
          </View>
          {state.isRunning && state.url && (
            <>
              <View style={[styles.separator, { backgroundColor: colors.background }]} />
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => {
                  Clipboard.setString(state.url)
                }}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                    <Text style={{ fontSize: 22 }}>📋</Text>
                  </View>
                  <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingText, { color: colors.text }]}>
                      {t.server.copyUrl}
                    </Text>
                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]} numberOfLines={1}>
                      {state.url}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 20 }}>›</Text>
              </TouchableOpacity>
            </>
          )}
        </SettingsSection>

        {state.isRunning && (
          <SettingsSection title={t.server.connectionInfo}>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                  <Text style={{ fontSize: 22 }}>🧠</Text>
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingText, { color: colors.text }]}>
                    {t.server.activeModel}
                  </Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]} numberOfLines={1}>
                    {activeModel ? activeModel.name : t.server.noModel}
                  </Text>
                </View>
              </View>
            </View>
            <View style={[styles.separator, { backgroundColor: colors.background }]} />
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                  <Text style={{ fontSize: 22 }}>🔗</Text>
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingText, { color: colors.text }]}>
                    {t.server.connectedPeers}
                  </Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                    {state.clientCount}
                  </Text>
                </View>
              </View>
            </View>
          </SettingsSection>
        )}

        <SettingsSection title={t.server.configuration}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 22 }}>⚡</Text>
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: colors.text }]}>
                  {t.server.autoStart}
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  {t.server.autoStartDesc}
                </Text>
              </View>
            </View>
            <Switch
              value={autoStart}
              onValueChange={handleToggleAutoStart}
              thumbColor={autoStart ? colors.primary : colors.textSecondary}
              trackColor={{ false: colors.border, true: colors.primary + '40' }}
            />
          </View>
          <View style={[styles.separator, { backgroundColor: colors.background }]} />
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 22 }}>☀️</Text>
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: colors.text }]}>
                  {t.server.keepAwake}
                </Text>
              </View>
            </View>
            <Switch
              value={keepAwake}
              onValueChange={setKeepAwake}
              thumbColor={keepAwake ? colors.primary : colors.textSecondary}
              trackColor={{ false: colors.border, true: colors.primary + '40' }}
            />
          </View>
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 32 },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingTextContainer: { flex: 1 },
  settingText: { fontSize: 16, fontWeight: '500', marginBottom: 2 },
  settingDescription: { fontSize: 14, lineHeight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { fontSize: 14, fontWeight: '500' },
  separator: { height: 1, marginHorizontal: 16 },
})
