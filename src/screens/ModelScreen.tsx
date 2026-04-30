import React, { useState, useCallback, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, Clipboard, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import RNBlobUtil from 'react-native-blob-util'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import AppHeader from '../components/AppHeader'
import ContextParamsModal from '../components/ContextParamsModal'
import { MaskedProgress } from '../components/MaskedProgress'
import { loadLlamaModelInfo } from '../../modules/llama.rn/src'
import { useModelContext } from '../contexts/ModelContext'
import { loadContextParams, saveContextParams, saveCustomModel, deleteCustomModel, type ContextParams, type CustomModel } from '../utils/storage'
import { useStoredCustomModels } from '../hooks/useStoredSetting'

function fmt(v: any): string {
  if (v === null || v === undefined) return 'N/A'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

export default function ModelScreen() {
  const navigation = useNavigation()
  const { theme } = useTheme()
  const { t } = useI18n()
  const c = theme.colors
  const [infoVis, setInfoVis] = useState(false)
  const [infoTitle, setInfoTitle] = useState('')
  const [infoItems, setInfoItems] = useState<Array<{ k: string; v: string }>>([])
  const [showCtx, setShowCtx] = useState(false)
  const [ctxParams, setCtxParams] = useState<ContextParams | null>(null)
  const [renameVis, setRenameVis] = useState(false)
  const [renameModel, setRenameModel] = useState<CustomModel | null>(null)
  const [renameText, setRenameText] = useState('')

  const { isModelReady, isLoading, initProgress, activeModelName, loadModel, unloadModel } = useModelContext()
  const { value: customModels, reload: reloadCustomModels } = useStoredCustomModels()

  useEffect(() => {
    loadContextParams().then(setCtxParams).catch(() => {})
  }, [])

  const handleLoadModel = async (path: string, name: string) => {
    try {
      await loadModel(path, name)
      ;(navigation as any).navigate('HomeTab')
    } catch (error: any) {
      Alert.alert(t.common.error, error.message)
    }
  }

  const showInfo = useCallback(async (p: string, n: string) => {
    try {
      const info: any = await loadLlamaModelInfo(p)
      const items: Array<{ k: string; v: string }> = []
      for (const [k, v] of Object.entries(info)) items.push({ k, v: fmt(v) })
      setInfoTitle(n); setInfoItems(items); setInfoVis(true)
    } catch (e: any) { Alert.alert(t.common.error, e.message) }
  }, [t])

  const handleImportFile = async () => {
    try {
      const { pick, keepLocalCopy } = require('@react-native-documents/picker')
      const [file] = await pick({ type: ['*/*'] })
      if (!file?.uri || !file?.name) return
      if (!file.name.toLowerCase().endsWith('.gguf')) {
        Alert.alert('Invalid File', 'Please select a GGUF model file (.gguf extension)')
        return
      }
      const [localCopy] = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: file.name }],
        destination: 'documentDirectory',
      })
      if (localCopy.status !== 'success') {
        Alert.alert('Error', `Failed to copy file: ${localCopy.copyError}`)
        return
      }
      const modelName = file.name.replace(/\.gguf$/i, '')
      const customModel: CustomModel = {
        id: modelName,
        repo: 'local-file',
        filename: file.name,
        quantization: 'Unknown',
        addedAt: Date.now(),
        localPath: localCopy.localUri,
      }
      await saveCustomModel(customModel)
      await reloadCustomModels()
      Alert.alert(t.common.success, 'Model imported successfully!')
    } catch (e: any) {
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') {
        Alert.alert(t.common.error, e.message)
      }
    }
  }

  const handleDelete = useCallback(async (model: CustomModel) => {
    Alert.alert(
      t.models.delete,
      t.models.deleteConfirm.replace('{name}', model.id),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              if (model.localPath) {
                const cleanPath = model.localPath.replace(/^file:\/\//, '')
                if (await RNBlobUtil.fs.exists(cleanPath)) {
                  await RNBlobUtil.fs.unlink(cleanPath)
                }
              }
              await deleteCustomModel(model.id)
              await reloadCustomModels()
            } catch (e: any) {
              Alert.alert(t.common.error, e.message)
            }
          },
        },
      ],
    )
  }, [t, reloadCustomModels])

  const handleRenameOpen = (model: CustomModel) => {
    setRenameModel(model)
    setRenameText(model.id)
    setRenameVis(true)
  }

  const handleRenameConfirm = async () => {
    if (!renameModel || !renameText.trim()) return
    const newId = renameText.trim()
    if (newId === renameModel.id) { setRenameVis(false); return }
    try {
      const updated: CustomModel = { ...renameModel, id: newId }
      await deleteCustomModel(renameModel.id)
      await saveCustomModel(updated)
      await reloadCustomModels()
      setRenameVis(false)
    } catch (e: any) {
      Alert.alert(t.common.error, e.message)
    }
  }

  const activeModel = (customModels || []).find(m => m.id === activeModelName)

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.background }]} edges={['left', 'right']}>
      <AppHeader title={t.models.title} rightButtons={
        <TouchableOpacity style={s.hdrBtn} onPress={() => setShowCtx(true)}>
          <Text style={{ color: c.headerText, fontSize: 20 }}>⚙️</Text>
        </TouchableOpacity>
      } />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {isModelReady && activeModel && (
          <>
            <Text style={[s.secTtl, { color: c.primary }]}>{t.models.loaded}</Text>
            <View style={[s.card, { backgroundColor: c.surface, borderColor: c.primary }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[s.dot, { backgroundColor: '#34A759' }]} />
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', marginLeft: 6 }}>
                    {activeModel.id}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.btn, { borderColor: c.error }]}
                  onPress={unloadModel}
                >
                  <Text style={[s.btnTxt, { color: c.error }]}>{t.models.unload}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        <Text style={[s.secTtl, { color: c.primary }]}>{t.models.customModelsSection}</Text>
        {(customModels || []).length === 0 && (
          <Text style={[s.empty, { color: c.textSecondary }]}>{t.models.noModels}</Text>
        )}
        {(customModels || []).map(model => {
          const isActive = model.id === activeModelName
          return (
            <View key={model.id} style={[s.card, { backgroundColor: c.surface, borderColor: isActive ? c.primary : c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                {isActive && <View style={[s.dot, { backgroundColor: '#34A759', marginRight: 6 }]} />}
                <Text style={[s.name, { color: c.text }]}>{model.id}</Text>
              </View>
              <View style={s.acts}>
                <TouchableOpacity style={[s.btn, { borderColor: c.primary }]} onPress={() => showInfo(model.localPath || '', model.id)}>
                  <Text style={[s.btnTxt, { color: c.primary }]}>{t.models.info}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { borderColor: c.textSecondary }]} onPress={() => handleRenameOpen(model)}>
                  <Text style={[s.btnTxt, { color: c.textSecondary }]}>{t.models.rename}</Text>
                </TouchableOpacity>
                {isActive ? (
                  <TouchableOpacity style={[s.btn, { borderColor: c.error }]} onPress={unloadModel}>
                    <Text style={[s.btnTxt, { color: c.error }]}>{t.models.unload}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[s.btn, { borderColor: c.primary }]}
                    onPress={() => handleLoadModel(model.localPath || '', model.id)}
                    disabled={isLoading}
                  >
                    <Text style={[s.btnTxt, { color: c.primary }]}>{t.models.load}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[s.btn, { borderColor: c.error }]} onPress={() => handleDelete(model)}>
                  <Text style={[s.btnTxt, { color: c.error }]}>{t.models.delete}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        })}

        <TouchableOpacity style={[s.importBtn, { backgroundColor: c.primary }]} onPress={handleImportFile}>
          <Text style={s.importBtnTxt}>+ {t.models.importModel}</Text>
        </TouchableOpacity>
      </ScrollView>

      <ContextParamsModal visible={showCtx} onClose={() => setShowCtx(false)} onSave={(p) => { setCtxParams(p); saveContextParams(p) }} />
      <MaskedProgress visible={isLoading} text={`${t.models.initializing} ${initProgress}%`} progress={initProgress} showProgressBar={initProgress > 0} />

      <Modal visible={infoVis} transparent animationType="fade" onRequestClose={() => setInfoVis(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setInfoVis(false)} />
          <View style={[s.modal, { backgroundColor: c.surface }]}>
            <View style={[s.modalHdr, { borderBottomColor: c.border }]}>
              <Text style={[s.modalTtl, { color: c.text }]}>{t.models.modelInfo}</Text>
              <TouchableOpacity onPress={() => setInfoVis(false)}>
                <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>{t.common.close}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[s.infoTitle, { color: c.primary }]}>{infoTitle}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {infoItems.map(item => (
                <View key={item.k} style={[s.infoRow, { backgroundColor: c.card }]}>
                  <View style={s.infoLabelRow}>
                    <Text style={[s.infoLabel, { color: c.text }]}>{item.k}</Text>
                    <TouchableOpacity style={[s.copyBtn, { backgroundColor: c.primary }]} onPress={() => Clipboard.setString(item.v)}>
                      <Text style={s.copyBtnTxt}>{t.models.copy}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.infoVal, { color: c.textSecondary }]} selectable>{item.v}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={renameVis} transparent animationType="fade" onRequestClose={() => setRenameVis(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setRenameVis(false)} />
          <View style={[s.modal, { backgroundColor: c.surface }]}>
            <View style={[s.modalHdr, { borderBottomColor: c.border }]}>
              <Text style={[s.modalTtl, { color: c.text }]}>{t.models.renameTitle}</Text>
              <TouchableOpacity onPress={() => setRenameVis(false)}>
                <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>{t.common.close}</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                color: c.text,
                marginVertical: 16,
              }}
              autoFocus
              selectTextOnFocus
            />
            <TouchableOpacity
              style={{ backgroundColor: c.primary, borderRadius: 8, padding: 12, alignItems: 'center' }}
              onPress={handleRenameConfirm}
            >
              <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>{t.common.save}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingTop: 8, paddingBottom: 32, paddingHorizontal: 16 },
  hdrBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  secTtl: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3, paddingVertical: 10 },
  empty: { fontSize: 14, textAlign: 'center', padding: 20 },
  card: { borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  name: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  acts: { flexDirection: 'row', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3A3A3C40' },
  btn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1 },
  btnTxt: { fontSize: 13, fontWeight: '600' },
  importBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  importBtnTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { borderRadius: 16, padding: 20, margin: 20, maxHeight: '80%', width: '90%' },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, marginBottom: 8 },
  modalTtl: { fontSize: 18, fontWeight: '700' },
  infoTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  infoRow: { borderRadius: 8, padding: 12, marginBottom: 10 },
  infoLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  infoLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  copyBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginLeft: 8 },
  copyBtnTxt: { fontSize: 12, color: '#FFF', fontWeight: '600' },
  infoVal: { fontSize: 13, fontFamily: 'Courier', lineHeight: 18 },
})
