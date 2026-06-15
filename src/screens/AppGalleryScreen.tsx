import React, { useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, Alert, TextInput, Modal, StyleSheet, SafeAreaView } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import * as projectStorage from '../services/appgen/projectStorage'
import type { ProjectMeta } from '../services/appgen/projectStorage'

export default function AppGalleryScreen({ navigation }: any) {
  const { theme } = useTheme()
  const colors = theme.colors
  const [apps, setApps] = useState<ProjectMeta[]>([])
  const [menuApp, setMenuApp] = useState<ProjectMeta | null>(null)
  const [renameVis, setRenameVis] = useState(false)
  const [renameText, setRenameText] = useState('')

  useFocusEffect(useCallback(() => {
    projectStorage.listProjects().then(setApps)
  }, []))

  const handleOpen = async (meta: ProjectMeta) => {
    try {
      const code = await projectStorage.readFile(meta.id, meta.mainFile)
      navigation.navigate('AppViewer', { htmlCode: code, name: meta.name })
    } catch {
      Alert.alert('错误', '无法读取应用文件')
    }
  }

  const handleEdit = async (meta: ProjectMeta) => {
    try {
      const code = await projectStorage.readFile(meta.id, meta.mainFile)
      navigation.navigate('MainTabs', {
        screen: 'HomeTab',
        params: { editAppCode: code, editAppName: meta.name, editProjectId: meta.id },
      })
    } catch {
      Alert.alert('错误', '无法读取应用文件')
    }
  }

  const handleDelete = (meta: ProjectMeta) => {
    Alert.alert('删除应用', `确定删除"${meta.name}"？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        await projectStorage.deleteProject(meta.id)
        setApps(prev => prev.filter(a => a.id !== meta.id))
        setMenuApp(null)
      }},
    ])
  }

  const handleRename = async () => {
    if (!menuApp || !renameText.trim()) return
    await projectStorage.updateProjectName(menuApp.id, renameText.trim())
    setApps(prev => prev.map(a => a.id === menuApp.id ? { ...a, name: renameText.trim() } : a))
    setRenameVis(false); setMenuApp(null)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>应用画廊</Text>
      </View>
      {apps.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>还没有保存的应用</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>在聊天中打开 📱 App 模式生成应用后保存</Text>
        </View>
      ) : (
        <FlatList
          data={apps}
          numColumns={2}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleOpen(item)}
              onLongPress={() => { setMenuApp(item) }}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Long-press menu */}
      {menuApp && (
        <Modal transparent animationType="fade" onRequestClose={() => setMenuApp(null)}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setMenuApp(null)}>
            <View style={[styles.menu, { backgroundColor: colors.surface }]}>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleEdit(menuApp)}>
                <Text style={{ color: colors.text, fontSize: 16 }}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setRenameText(menuApp.name); setRenameVis(true) }}>
                <Text style={{ color: colors.text, fontSize: 16 }}>重命名</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleDelete(menuApp)}>
                <Text style={{ color: colors.error, fontSize: 16 }}>删除</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => setMenuApp(null)}>
                <Text style={{ color: colors.textSecondary, fontSize: 16 }}>取消</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Rename modal */}
      <Modal visible={renameVis} transparent animationType="fade" onRequestClose={() => setRenameVis(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setRenameVis(false)}>
          <View style={[styles.menu, { backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>重命名</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text, marginBottom: 12 }}
              autoFocus
              selectTextOnFocus
            />
            <TouchableOpacity onPress={handleRename} style={{ paddingVertical: 10 }}>
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>确定</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grid: { padding: 8 },
  card: { flex: 1, margin: 6, borderRadius: 12, borderWidth: 1, padding: 16, minHeight: 100, justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  menu: { borderRadius: 16, padding: 20, minWidth: 200 },
  menuItem: { paddingVertical: 12 },
})
