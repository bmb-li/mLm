import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert, StyleSheet, StatusBar, Keyboard } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import { loadConfig, saveConfig, type AppGenConfig } from '../services/appgen/appModeStorage'
import { APP_GEN_PROMPT, SIMPLE_APP_GEN_PROMPT } from '../services/appgen/prompts'

export default function AppGenSettingsScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<'simple' | 'complex'>('complex')
  const [simplePrompt, setSimplePrompt] = useState('')
  const [complexPrompt, setComplexPrompt] = useState('')
  const [promptEditable, setPromptEditable] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [])

  useEffect(() => {
    loadConfig().then(cfg => {
      setMode(cfg.mode)
      setSimplePrompt(cfg.simplePrompt || SIMPLE_APP_GEN_PROMPT)
      setComplexPrompt(cfg.complexPrompt || APP_GEN_PROMPT)
    })
  }, [])

  const handleSave = async () => {
    await saveConfig({
      mode,
      simplePrompt: simplePrompt === SIMPLE_APP_GEN_PROMPT ? undefined : simplePrompt,
      complexPrompt: complexPrompt === APP_GEN_PROMPT ? undefined : complexPrompt,
    })
    Alert.alert('', (t as any).appgen?.saved || '已保存')
    navigation.goBack()
  }

  const handleReset = () => {
    setSimplePrompt(SIMPLE_APP_GEN_PROMPT)
    setComplexPrompt(APP_GEN_PROMPT)
  }

  const promptText = mode === 'simple' ? simplePrompt : complexPrompt
  const setPromptText = mode === 'simple' ? setSimplePrompt : setComplexPrompt

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: (StatusBar.currentHeight || 24) + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>← {(t as any).common?.back || '返回'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{(t as any).appgen?.settingsTitle || '应用创建设置'}</Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>{(t as any).common?.save || '保存'}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} nestedScrollEnabled={true} contentContainerStyle={{ padding: 16 }}>
          {/* Mode selection */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{(t as any).appgen?.mode || '模式'}</Text>
        <TouchableOpacity
          style={[styles.radio, { backgroundColor: colors.surface, borderColor: mode === 'simple' ? colors.primary : colors.border }]}
          onPress={() => setMode('simple')}
        >
          <View style={[styles.radioDot, mode === 'simple' && { backgroundColor: colors.primary }]} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{(t as any).appgen?.modeSimple || '极简模式'}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{(t as any).appgen?.modeSimpleDesc || '纯聊天生成，无需工具'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.radio, { backgroundColor: colors.surface, borderColor: mode === 'complex' ? colors.primary : colors.border, marginTop: 8 }]}
          onPress={() => setMode('complex')}
        >
          <View style={[styles.radioDot, mode === 'complex' && { backgroundColor: colors.primary }]} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{(t as any).appgen?.modeComplex || '复杂模式'}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{(t as any).appgen?.modeComplexDesc || '工具 + 代办 + 文件树'}</Text>
          </View>
        </TouchableOpacity>

        {/* Prompt editor */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>{(t as any).appgen?.systemPrompt || '系统提示词'}</Text>
          <TouchableOpacity onPress={() => setPromptEditable(!promptEditable)} style={{ padding: 4 }}>
            <Text style={{ fontSize: 18 }}>{promptEditable ? '🔓' : '🔒'}</Text>
          </TouchableOpacity>
        </View>
        <View pointerEvents={promptEditable ? 'auto' : 'none'}>
          <TextInput
            value={promptText}
            onChangeText={setPromptText}
            editable={promptEditable}
            multiline
            scrollEnabled={false}
            style={{
              backgroundColor: colors.surface,
              color: colors.text,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              padding: 12,
              marginTop: 8,
              fontSize: 13,
              fontFamily: 'monospace',
              lineHeight: 18,
              textAlignVertical: 'top',
            }}
          />
        </View>
          <TouchableOpacity
            onPress={handleReset}
            style={{ marginTop: 12, alignSelf: 'flex-start' }}
          >
            <Text style={{ color: colors.primary, fontSize: 14 }}>{(t as any).appgen?.restoreDefault || '恢复默认提示词'}</Text>
          </TouchableOpacity>
          <View style={{ height: Math.max(insets.bottom, 64) + keyboardHeight }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  radio: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#999', marginRight: 12 },
})
