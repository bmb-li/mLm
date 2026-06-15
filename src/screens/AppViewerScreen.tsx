import React, { useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import AppPreview from '../components/AppPreview'

export default function AppViewerScreen({ route, navigation }: any) {
  const { theme } = useTheme()
  const colors = theme.colors
  const { htmlCode, name } = route.params || {}

  const handleAIMessage = useCallback(async (_msg: any, _postMessage: any) => {
    throw new Error('AI chat is not available in viewer mode. Open in chat to use AI features.')
  }, [])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: (StatusBar.currentHeight || 20) + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>关闭</Text>
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
