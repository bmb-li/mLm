import React, { useState, useRef, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'

const MAX_LOG_LINES = 500

export default function ServerLogsScreen() {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toISOString()}] Server initialized`,
  ])
  const flatListRef = useRef<FlatList>(null)

  const clearLogs = () => {
    setLogs([])
    setLogs([`[${new Date().toISOString()}] Logs cleared`])
  }

  const copyLogs = () => {
    const text = logs.join('\n')
    try {
      const Clipboard = require('@react-native-clipboard/clipboard').default
      Clipboard.setString(text)
    } catch {}
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(prev => {
        if (prev.length > MAX_LOG_LINES) {
          return prev.slice(prev.length - MAX_LOG_LINES)
        }
        return prev
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity style={styles.toolButton} onPress={clearLogs}>
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={copyLogs}>
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Copy</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        ref={flatListRef}
        data={logs}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <Text style={[styles.logLine, { color: colors.textSecondary }]} selectable>
            {item}
          </Text>
        )}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12 }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  toolButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  logLine: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
    paddingVertical: 2,
  },
})
