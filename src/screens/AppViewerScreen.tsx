import React, { useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import AppPreview from '../components/AppPreview'
import CodePreview from '../components/CodePreview'

export default function AppViewerScreen({ route, navigation }: any) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors
  const { htmlCode, code, language, name } = route.params || {}

  const handleAIMessage = useCallback(async (_msg: any, _postMessage: any) => {
    throw new Error('AI chat is not available in viewer mode. Open in chat to use AI features.')
  }, [])

  if (code) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: (StatusBar.currentHeight || 20) + 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>{t.common?.close || '关闭'}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{language || '代码'}</Text>
          <View style={{ width: 50 }} />
        </View>
        <CodePreview code={code} language={language || 'code'} style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: (StatusBar.currentHeight || 20) + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>{t.common?.close || '关闭'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{name || 'App'}</Text>
        <View style={{ width: 50 }} />
      </View>
      <AppPreview html={htmlCode || ''} onAIMessage={handleAIMessage} fill />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1 },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center', marginHorizontal: 8 },
})
