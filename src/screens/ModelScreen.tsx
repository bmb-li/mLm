import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, Clipboard, TextInput, Switch, ActivityIndicator, FlatList, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import RNBlobUtil from 'react-native-blob-util'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import AppHeader from '../components/AppHeader'
import ContextParamsModal from '../components/ContextParamsModal'
import { MaskedProgress } from '../components/MaskedProgress'
import { loadLlamaModelInfo } from '../../modules/llama.rn/src'
import { useModelContext } from '../contexts/ModelContext'
import { loadContextParams, saveContextParams, saveCustomModel, deleteCustomModel, updateCustomModel, type ContextParams, type CustomModel } from '../utils/storage'
import { useStoredCustomModels } from '../hooks/useStoredSetting'
import { ModelDownloader } from '../services/ModelDownloader'
import { getModelDownloadUrl } from '../utils/constants'

const downloader = new ModelDownloader()

const AUTO_SERVER_KEY = '@llama_auto_start_server'
const AUTO_LOAD_KEY = '@llama_auto_load_model'

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
  const [activeTab, setActiveTab] = useState<'available' | 'mmproj' | 'tts' | 'wavtokenizer' | 'mtp' | 'mtp-assistant'>('available')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mmprojPickerTarget, setMmprojPickerTarget] = useState<string | null>(null)
  const [vocoderPickerTarget, setVocoderPickerTarget] = useState<string | null>(null)
  const [mtpAssistantPickerTarget, setMtpAssistantPickerTarget] = useState<string | null>(null)
  const [importingFor, setImportingFor] = useState<string | null>(null)

  const { isModelReady, isLoading, initProgress, activeModelName, context, loadModel, unloadModel } = useModelContext()
  const { value: customModels, reload: reloadCustomModels } = useStoredCustomModels()
  const [autoLoadConfig, setAutoLoadConfig] = useState<{id:string;path:string;mmprojPath?:string;vocoderPath?:string} | null>(null)

  useEffect(() => {
    loadContextParams().then(setCtxParams).catch(() => {})
  }, [])

  // Read auto-load config on mount
  useEffect(() => {
    AsyncStorage.getItem(AUTO_LOAD_KEY).then(val => {
      if (val) setAutoLoadConfig(JSON.parse(val))
    }).catch(() => {})
  }, [])

  // Auto-load model on mount (startup only)
  useEffect(() => {
    AsyncStorage.getItem(AUTO_LOAD_KEY).then(val => {
      if (!val) return
      AsyncStorage.getItem(AUTO_SERVER_KEY).then(autoServer => {
        if (autoServer === 'true') return
        try {
          const cfg = JSON.parse(val)
          if (!cfg.path) return
          if (context && activeModelName === cfg.id) {
            ;(navigation as any).navigate('HomeTab')
            return
          }
          loadModel(cfg.path, cfg.id, cfg.mmprojPath, cfg.vocoderPath)
            .then(() => (navigation as any).navigate('HomeTab'))
            .catch((err: any) => {
              Alert.alert('自动加载失败', err?.message || String(err))
              AsyncStorage.removeItem(AUTO_LOAD_KEY).catch(() => {})
              setAutoLoadConfig(null)
            })
        } catch {}
      }).catch(() => {})
    }).catch(() => {})
  }, [context, activeModelName])

  const filteredModels = useMemo(() => {
    return (customModels || []).filter(m => {
      const p = m.localPath || ''
      if (activeTab === 'available') return p.includes('/llm/')
      if (activeTab === 'mmproj') return p.includes('/mmproj/')
      if (activeTab === 'tts') return p.includes('/tts/')
      if (activeTab === 'wavtokenizer') return p.includes('/wavtokenizer/')
      if (activeTab === 'mtp') return p.includes('/mtp/')
      if (activeTab === 'mtp-assistant') return p.includes('/mtp-assistant/')
      return false
    })
  }, [customModels, activeTab])

  const availableMmprojFiles = useMemo(() => {
    const seen = new Set<string>()
    return (customModels || []).reduce<{ label: string; path: string }[]>((acc, m) => {
      const p = m.localPath || ''
      if (p.includes('/mmproj/') && !seen.has(p)) {
        seen.add(p)
        acc.push({ label: m.id, path: p })
      }
      return acc
    }, [])
  }, [customModels])

  const availableVocoderFiles = useMemo(() => {
    const vocoderPath = `${RNBlobUtil.fs.dirs.DocumentDir}/LLMs/wavtokenizer`
    const files: { label: string; path: string }[] = []
    // Can't read filesystem synchronously in useMemo, fall back to customModels
    if (!customModels) return files
    const seen = new Set<string>()
    for (const m of customModels) {
      const p = m.localPath || ''
      if (p.includes('/wavtokenizer/') && !seen.has(p)) {
        seen.add(p)
        files.push({ label: m.id, path: p })
      }
    }
    return files
  }, [customModels])

  const availableMtpAssistantFiles = useMemo(() => {
    const seen = new Set<string>()
    return (customModels || []).reduce<{ label: string; path: string }[]>((acc, m) => {
      const p = m.localPath || ''
      if (p.includes('/mtp-assistant/') && !seen.has(p)) {
        seen.add(p)
        acc.push({ label: m.id, path: p })
      }
      return acc
    }, [])
  }, [customModels])

  const updateModel = useCallback(async (model: CustomModel, changes: Partial<CustomModel>) => {
    await updateCustomModel(model.id, changes)
    reloadCustomModels()
  }, [reloadCustomModels])

  const handleImportMmproj = useCallback(async (model: CustomModel) => {
    try {
      setImportingFor(model.id)
      const { pick, keepLocalCopy } = require('@react-native-documents/picker')
      const [file] = await pick({ type: ['*/*'] })
      if (!file?.uri || !file?.name) return
      if (!file.name.toLowerCase().endsWith('.gguf')) {
        Alert.alert('Invalid File', 'Please select a GGUF file')
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
      const destDir = `${RNBlobUtil.fs.dirs.DocumentDir}/LLMs/mmproj`
      if (!(await RNBlobUtil.fs.exists(destDir))) await RNBlobUtil.fs.mkdir(destDir)
      await RNBlobUtil.fs.mv(localCopy.localUri.replace(/^file:\/\//, ''), `${destDir}/${file.name}`)
      await updateModel(model, { mmprojFilename: file.name, mmprojLocalPath: `file://${destDir}/${file.name}` })
      await reloadCustomModels()
    } catch (e: any) {
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') Alert.alert(t.common.error, e.message)
    } finally {
      setImportingFor(null)
    }
  }, [updateModel, t, reloadCustomModels])

  const handleRemoveMmproj = useCallback(async (model: CustomModel) => {
    await updateModel(model, { mmprojFilename: undefined, mmprojLocalPath: undefined })
  }, [updateModel])

  const handleToggleVision = useCallback(async (model: CustomModel, value: boolean) => {
    await updateModel(model, { visionEnabled: value })
  }, [updateModel])

  const handleToggleAudio = useCallback(async (model: CustomModel, value: boolean) => {
    await updateModel(model, { audioEnabled: value })
  }, [updateModel])

  const handleImportVocoder = useCallback(async (model: CustomModel) => {
    try {
      setImportingFor(model.id)
      const { pick, keepLocalCopy } = require('@react-native-documents/picker')
      const [file] = await pick({ type: ['*/*'] })
      if (!file?.uri || !file?.name) return
      if (!file.name.toLowerCase().endsWith('.gguf')) {
        Alert.alert('Invalid File', 'Please select a GGUF file')
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
      const destDir = `${RNBlobUtil.fs.dirs.DocumentDir}/LLMs/wavtokenizer`
      if (!(await RNBlobUtil.fs.exists(destDir))) await RNBlobUtil.fs.mkdir(destDir)
      await RNBlobUtil.fs.mv(localCopy.localUri.replace(/^file:\/\//, ''), `${destDir}/${file.name}`)
      await updateModel(model, { vocoderFilename: file.name, vocoderLocalPath: `file://${destDir}/${file.name}` })
      await reloadCustomModels()
    } catch (e: any) {
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') Alert.alert(t.common.error, e.message)
    } finally {
      setImportingFor(null)
    }
  }, [updateModel, t, reloadCustomModels])

  const handleRemoveVocoder = useCallback(async (model: CustomModel) => {
    await updateModel(model, { vocoderFilename: undefined, vocoderLocalPath: undefined })
  }, [updateModel])

  const handleVocoderSelect = useCallback(async (targetId: string, path: string, label: string) => {
    const model = (customModels || []).find(m => m.id === targetId)
    if (model) {
      await updateModel(model, { vocoderFilename: label, vocoderLocalPath: path })
    }
    setVocoderPickerTarget(null)
  }, [customModels, updateModel])

  const handleMmprojSelect = useCallback(async (targetId: string, path: string, label: string) => {
    const model = (customModels || []).find(m => m.id === targetId)
    if (model) {
      await updateModel(model, { mmprojFilename: label, mmprojLocalPath: path })
    }
    setMmprojPickerTarget(null)
  }, [customModels, updateModel])

  const handleMtpAssistantSelect = useCallback(async (targetId: string, path: string, label: string) => {
    const model = (customModels || []).find(m => m.id === targetId)
    if (model) {
      await updateModel(model, { mtpAssistantFilename: label, mtpAssistantLocalPath: path })
    }
    setMtpAssistantPickerTarget(null)
  }, [customModels, updateModel])

  const handleImportMtpAssistant = useCallback(async (model: CustomModel) => {
    try {
      setImportingFor(model.id)
      const { pick, keepLocalCopy } = require('@react-native-documents/picker')
      const [file] = await pick({ type: ['*/*'] })
      if (!file?.uri || !file?.name) return
      if (!file.name.toLowerCase().endsWith('.gguf')) {
        Alert.alert('Invalid File', 'Please select a GGUF file')
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
      const destDir = `${RNBlobUtil.fs.dirs.DocumentDir}/LLMs/mtp-assistant`
      if (!(await RNBlobUtil.fs.exists(destDir))) await RNBlobUtil.fs.mkdir(destDir)
      await RNBlobUtil.fs.mv(localCopy.localUri.replace(/^file:\/\//, ''), `${destDir}/${file.name}`)
      await updateModel(model, { mtpAssistantFilename: file.name, mtpAssistantLocalPath: `file://${destDir}/${file.name}` })
      await reloadCustomModels()
    } catch (e: any) {
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') Alert.alert(t.common.error, e.message)
    } finally {
      setImportingFor(null)
    }
  }, [updateModel, t, reloadCustomModels])

  const handleRemoveMtpAssistant = useCallback(async (model: CustomModel) => {
    await updateModel(model, { mtpAssistantFilename: undefined, mtpAssistantLocalPath: undefined })
  }, [updateModel])

  const handleLoadModel = async (path: string, name: string, mmprojPath?: string, vocoderPath?: string) => {
    try {
      await loadModel(path, name, mmprojPath, vocoderPath)
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
      const oldPath = renameModel.localPath?.replace(/^file:\/\//, '')
      if (oldPath) {
        const dir = oldPath.substring(0, oldPath.lastIndexOf('/'))
        const newPath = `${dir}/${newId}.gguf`
        if (await RNBlobUtil.fs.exists(oldPath)) {
          await RNBlobUtil.fs.mv(oldPath, newPath)
        }
      }
      await reloadCustomModels()
      setRenameVis(false)
    } catch (e: any) {
      Alert.alert(t.common.error, e.message)
    }
  }

  const activeModel = (customModels || []).find(m => m.id === activeModelName)

  // TTS 下载状态
  const [ttsDownloading, setTtsDownloading] = useState(false)
  const [ttsDownloadProgress, setTtsDownloadProgress] = useState(0)
  const [ttsDownloadStatus, setTtsDownloadStatus] = useState('')
  const ttsModelRepo = 'OuteAI/OuteTTS-0.3-500M-GGUF'
  const ttsModelFile = 'OuteTTS-0.3-500M-Q4_K_M.gguf'
  const ttsVocoderRepo = 'ggml-org/WavTokenizer'
  const ttsVocoderFile = 'WavTokenizer-Large-75-Q5_1.gguf'

  const handleTtsDownloadLocal = useCallback(async () => {
    try {
      setTtsDownloading(true)
      setTtsDownloadProgress(0)
      setTtsDownloadStatus(t.models.ttsModel + '...')
      const ttsPath = await downloader.downloadModel(ttsModelRepo, ttsModelFile, (p) => {
        setTtsDownloadProgress(Math.round(p.percentage / 2))
        setTtsDownloadStatus(`${t.models.ttsModel}: ${p.percentage}%`)
      })
      setTtsDownloadStatus(t.models.selectVocoder + '...')
      const vocoderPath = await downloader.downloadModel(ttsVocoderRepo, ttsVocoderFile, (p) => {
        setTtsDownloadProgress(50 + Math.round(p.percentage / 2))
        setTtsDownloadStatus(`Vocoder: ${p.percentage}%`)
      })
      setTtsDownloadProgress(100)
      setTtsDownloadStatus(t.common.success)
      const newModel: CustomModel = {
        id: 'OuteTTS-0.3-500M',
        repo: ttsModelRepo,
        filename: ttsModelFile,
        quantization: 'Q4_K_M',
        addedAt: Date.now(),
        localPath: ttsPath,
        vocoderFilename: ttsVocoderFile,
        vocoderLocalPath: vocoderPath,
      }
      await saveCustomModel(newModel)
      await reloadCustomModels()
      Alert.alert(t.common.success, 'TTS model downloaded successfully!')
    } catch (e: any) {
      Alert.alert(t.common.error, e.message)
    } finally {
      setTtsDownloading(false)
      setTtsDownloadProgress(0)
      setTtsDownloadStatus('')
    }
  }, [t, reloadCustomModels])

  const handleTtsDownloadBrowser = useCallback(() => {
    Linking.openURL(getModelDownloadUrl(ttsModelRepo, ttsModelFile))
    setTimeout(() => Linking.openURL(getModelDownloadUrl(ttsVocoderRepo, ttsVocoderFile)), 800)
  }, [])

  // MTP download states
  const [mtpDownloading, setMtpDownloading] = useState(false)
  const [mtpDownloadProgress, setMtpDownloadProgress] = useState(0)
  const [mtpDownloadStatus, setMtpDownloadStatus] = useState('')
  const [mtpAssistantDownloading, setMtpAssistantDownloading] = useState(false)
  const [mtpAssistantDownloadProgress, setMtpAssistantDownloadProgress] = useState(0)
  const [mtpAssistantDownloadStatus, setMtpAssistantDownloadStatus] = useState('')

  const handleMtpDownloadLocal = useCallback(async (modelDef: { repo: string; filename: string; id: string; name: string }) => {
    try {
      setMtpDownloading(true)
      setMtpDownloadProgress(0)
      setMtpDownloadStatus(modelDef.name + '...')
      const path = await downloader.downloadModel(modelDef.repo, modelDef.filename, (p) => {
        setMtpDownloadProgress(Math.round(p.percentage))
        setMtpDownloadStatus(`${p.percentage}%`)
      })
      setMtpDownloadProgress(100)
      setMtpDownloadStatus(t.common.success)
      const newModel: CustomModel = {
        id: modelDef.id,
        repo: modelDef.repo,
        filename: modelDef.filename,
        quantization: 'Unknown',
        addedAt: Date.now(),
        localPath: path,
      }
      await saveCustomModel(newModel)
      await reloadCustomModels()
      Alert.alert(t.common.success, `${modelDef.name} downloaded!`)
    } catch (e: any) {
      Alert.alert(t.common.error, e.message)
    } finally {
      setMtpDownloading(false)
      setMtpDownloadProgress(0)
      setMtpDownloadStatus('')
    }
  }, [t, reloadCustomModels])

  const handleMtpDraftDownloadLocal = useCallback(async () => {
    if (mtpAssistantDownloading) return
    const repo = 'lym00/gemma-4-E2B-it-qat-q4_0-unquantized-assistant-gguf-test'
    const filename = 'gemma-4-E2B-it-qat-assistant-q4_0.gguf'
    const name = 'Gemma 4 E2B MTP Assistant'
    try {
      setMtpAssistantDownloading(true)
      setMtpAssistantDownloadProgress(0)
      setMtpAssistantDownloadStatus(name + '...')
      const path = await downloader.downloadModel(repo, filename, (p) => {
        setMtpAssistantDownloadProgress(Math.round(p.percentage))
        setMtpAssistantDownloadStatus(`${p.percentage}%`)
      })
      setMtpAssistantDownloadProgress(100)
      setMtpAssistantDownloadStatus(t.common.success)
      const newModel: CustomModel = {
        id: 'gemma-4-e2b-mtp-assistant',
        repo,
        filename,
        quantization: 'Unknown',
        addedAt: Date.now(),
        localPath: path,
      }
      await saveCustomModel(newModel)
      await reloadCustomModels()
      Alert.alert(t.common.success, `${name} downloaded!`)
    } catch (e: any) {
      Alert.alert(t.common.error, e.message)
    } finally {
      setMtpAssistantDownloading(false)
      setMtpAssistantDownloadProgress(0)
      setMtpAssistantDownloadStatus('')
    }
  }, [t, reloadCustomModels, mtpAssistantDownloading])

  const handleImportModel = useCallback(async () => {
    try {
      const { pick, keepLocalCopy } = require('@react-native-documents/picker')
      const [file] = await pick({ type: ['*/*'] })
      if (!file?.uri || !file?.name) return
      if (!file.name.toLowerCase().endsWith('.gguf')) {
        Alert.alert('Invalid File', 'Please select a GGUF model file')
        return
      }
      const [local] = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: file.name }],
        destination: 'documentDirectory',
      })
      if (local.status !== 'success') throw new Error(local.copyError)
      const dirMap: Record<string, string> = { available: 'llm', mmproj: 'mmproj', tts: 'tts', wavtokenizer: 'wavtokenizer', mtp: 'mtp', 'mtp-assistant': 'mtp-assistant' }
      const subDir = dirMap[activeTab] || 'llm'
      const destDir = `${RNBlobUtil.fs.dirs.DocumentDir}/LLMs/${subDir}`
      if (!(await RNBlobUtil.fs.exists(destDir))) await RNBlobUtil.fs.mkdir(destDir)
      await RNBlobUtil.fs.mv(local.localUri.replace(/^file:\/\//, ''), `${destDir}/${file.name}`)
      await reloadCustomModels()
    } catch (e: any) {
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') Alert.alert(t.common.error, e.message)
    }
  }, [reloadCustomModels, activeTab])

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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabRow} contentContainerStyle={{ paddingRight: 16 }}>
          {[
            { key: 'available' as const, label: t.models.tabText },
            { key: 'mmproj' as const, label: t.models.tabMmproj },
            { key: 'tts' as const, label: t.models.tabTts },
            { key: 'wavtokenizer' as const, label: (t.models as any).tabWavtokenizer || 'Vocoder' },
            { key: 'mtp' as const, label: t.models.tabMtp },
            { key: 'mtp-assistant' as const, label: t.models.tabMtpAssistant },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[s.tab, { borderColor: c.border }, activeTab === tab.key && { backgroundColor: c.primary, borderColor: c.primary }]}
              onPress={() => { setActiveTab(tab.key); setExpandedId(null) }}
            >
              <Text style={[s.tabTxt, { color: activeTab === tab.key ? '#FFF' : c.textSecondary }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {(filteredModels || []).length === 0 && (
          <Text style={[s.empty, { color: c.textSecondary }]}>{t.models.noModels}</Text>
        )}
        {(filteredModels || []).map(model => {
          const isActive = model.id === activeModelName
          const isExpanded = expandedId === model.id
          return (
            <View key={model.id} style={[s.card, { backgroundColor: c.surface, borderColor: isActive ? c.primary : c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                {isActive && <View style={[s.dot, { backgroundColor: '#34A759', marginRight: 6 }]} />}
                <Text style={[s.name, { color: autoLoadConfig?.id === model.id ? '#4CAF50' : c.text, flex: 1 }]}>{model.id}</Text>
                {model.visionEnabled && <View style={[s.tag, { backgroundColor: c.primary + '20' }]}><Text style={[s.tagTxt, { color: c.primary }]}>视觉</Text></View>}
                {model.audioEnabled && <View style={[s.tag, { backgroundColor: c.primary + '20', marginLeft: 4 }]}><Text style={[s.tagTxt, { color: c.primary }]}>音频</Text></View>}
              </View>
              <View style={s.acts}>
                <TouchableOpacity style={[s.btn, { borderColor: c.primary }]} onPress={() => showInfo(model.localPath || '', model.id)}>
                  <Text style={[s.btnTxt, { color: c.primary }]}>{t.models.info}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { borderColor: c.textSecondary }]} onPress={() => handleRenameOpen(model)}>
                  <Text style={[s.btnTxt, { color: c.textSecondary }]}>{t.models.rename}</Text>
                </TouchableOpacity>
                {activeTab !== 'mmproj' && activeTab !== 'wavtokenizer' && activeTab !== 'mtp-assistant' && (
                  isActive ? (
                    <TouchableOpacity style={[s.btn, { borderColor: c.error }]} onPress={unloadModel}>
                      <Text style={[s.btnTxt, { color: c.error }]}>{t.models.unload}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[s.btn, { borderColor: c.primary }]}
                      onPress={() => handleLoadModel(model.localPath || '', model.id, model.mmprojLocalPath, (model as any).vocoderLocalPath)}
                      disabled={isLoading}
                    >
                      <Text style={[s.btnTxt, { color: c.primary }]}>{t.models.load}</Text>
                    </TouchableOpacity>
                  )
                )}
                <TouchableOpacity style={[s.btn, { borderColor: c.error }]} onPress={() => handleDelete(model)}>
                  <Text style={[s.btnTxt, { color: c.error }]}>{t.models.delete}</Text>
                </TouchableOpacity>
                {activeTab !== 'mmproj' && activeTab !== 'wavtokenizer' && (
                  <TouchableOpacity onPress={() => setExpandedId(isExpanded ? null : model.id)} style={{ marginLeft: 'auto', paddingHorizontal: 4 }}>
                    <Text style={{ color: c.textSecondary, fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {isExpanded && (
                <View style={{ marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 10 }}>
                  {activeTab === 'tts' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                        onPress={() => setVocoderPickerTarget(model.id)}
                      >
                        <Text style={{ color: (model as any).vocoderFilename ? c.text : c.textSecondary, fontSize: 14 }}>
                          {(model as any).vocoderFilename || t.models.selectVocoder}
                        </Text>
                        <Text style={{ color: c.textSecondary }}>›</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: (model as any).vocoderLocalPath ? c.error : c.primary }}
                        onPress={(model as any).vocoderLocalPath ? () => handleRemoveVocoder(model) : () => handleImportVocoder(model)}
                        disabled={importingFor === model.id}
                      >
                        <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>
                          {importingFor === model.id ? '...' : (model as any).vocoderLocalPath ? t.models.removeVocoder : t.models.importVocoder}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : activeTab === 'mtp' ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                          onPress={() => setMtpAssistantPickerTarget(model.id)}
                        >
                          <Text style={{ color: (model as any).mtpAssistantFilename ? c.text : c.textSecondary, fontSize: 14 }}>
                            {(model as any).mtpAssistantFilename || t.models.selectMtpAssistant}
                          </Text>
                          <Text style={{ color: c.textSecondary }}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: (model as any).mtpAssistantLocalPath ? c.error : c.primary }}
                          onPress={(model as any).mtpAssistantLocalPath ? () => handleRemoveMtpAssistant(model) : () => handleImportMtpAssistant(model)}
                          disabled={importingFor === model.id}
                        >
                          <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>
                            {importingFor === model.id ? '...' : (model as any).mtpAssistantLocalPath ? t.models.removeMtpAssistant : t.models.importMtpAssistant}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Switch value={autoLoadConfig?.id === model.id} onValueChange={v => {
                            if (v) {
                              const cfg = { id: model.id, path: model.localPath || '', mmprojPath: model.mmprojLocalPath, vocoderPath: (model as any).vocoderLocalPath }
                              AsyncStorage.setItem(AUTO_LOAD_KEY, JSON.stringify(cfg)).catch(() => {})
                              setAutoLoadConfig(cfg)
                            } else {
                              AsyncStorage.removeItem(AUTO_LOAD_KEY).catch(() => {})
                              setAutoLoadConfig(null)
                            }
                          }} />
                          <Text style={{ color: c.text, fontSize: 14 }}>{t.models.autoLoad}</Text>
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                          onPress={() => setMmprojPickerTarget(model.id)}
                        >
                          <Text style={{ color: model.mmprojFilename ? c.text : c.textSecondary, fontSize: 14 }}>
                            {model.mmprojFilename || t.models.mmprojSelect}
                          </Text>
                          <Text style={{ color: c.textSecondary }}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: model.mmprojLocalPath ? c.error : c.primary }}
                          onPress={model.mmprojLocalPath ? () => handleRemoveMmproj(model) : () => handleImportMmproj(model)}
                          disabled={importingFor === model.id}
                        >
                          <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>
                            {importingFor === model.id ? '...' : model.mmprojLocalPath ? t.models.removeMmproj : t.models.importMmproj}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Switch value={model.visionEnabled || false} onValueChange={v => handleToggleVision(model, v)} />
                          <Text style={{ color: c.text, fontSize: 14 }}>{t.models.vision}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Switch value={model.audioEnabled || false} onValueChange={v => handleToggleAudio(model, v)} />
                          <Text style={{ color: c.text, fontSize: 14 }}>{t.models.audio}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Switch value={autoLoadConfig?.id === model.id} onValueChange={v => {
                            if (v) {
                              const cfg = { id: model.id, path: model.localPath || '', mmprojPath: model.mmprojLocalPath, vocoderPath: (model as any).vocoderLocalPath }
                              AsyncStorage.setItem(AUTO_LOAD_KEY, JSON.stringify(cfg)).catch(() => {})
                              setAutoLoadConfig(cfg)
                            } else {
                              AsyncStorage.removeItem(AUTO_LOAD_KEY).catch(() => {})
                              setAutoLoadConfig(null)
                            }
                          }} />
                          <Text style={{ color: c.text, fontSize: 14 }}>{t.models.autoLoad}</Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          )
        })}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[s.importBtn, { backgroundColor: c.primary, flex: 1 }]} onPress={handleImportModel}>
            <Text style={s.importBtnTxt}>📁 {t.models.importModel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.importBtn, { backgroundColor: c.primary, flex: 1 }]} onPress={() => Linking.openURL('https://huggingface.co/models?sort=created&search=gguf')}>
            <Text style={s.importBtnTxt}>{(t.models as any).goHuggingFace || '🌐 HuggingFace'}</Text>
          </TouchableOpacity>
        </View>
        {activeTab === 'tts' && !ttsDownloading && (
          <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.name, { color: c.text, marginBottom: 4 }]}>📥 OuteTTS 0.3 500M + WavTokenizer</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 10 }}>454MB + 70MB</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.btn, { borderColor: c.primary, flex: 1 }]} onPress={handleTtsDownloadLocal}>
                <Text style={[s.btnTxt, { color: c.primary, textAlign: 'center' }]}>⬇ {t.models.ttsModel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { borderColor: c.textSecondary, flex: 1 }]} onPress={handleTtsDownloadBrowser}>
                <Text style={[s.btnTxt, { color: c.textSecondary, textAlign: 'center' }]}>🌐 浏览器下载</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {activeTab === 'tts' && ttsDownloading && (
          <View style={[s.card, { backgroundColor: c.surface, borderColor: c.primary }]}>
            <Text style={{ color: c.text, fontSize: 14, marginBottom: 6 }}>{ttsDownloadStatus}</Text>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border }}>
              <View style={{ width: `${ttsDownloadProgress}%`, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
            </View>
          </View>
        )}

        {activeTab === 'mtp' && !mtpDownloading && (
          <>
            <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[s.name, { color: c.text, marginBottom: 4 }]}>📥 Qwen3.5 4B MTP</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 10 }}>4.3GB</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.btn, { borderColor: c.primary, flex: 1 }]} onPress={() => handleMtpDownloadLocal({ repo: 'unsloth/Qwen3.5-4B-MTP-GGUF', filename: 'Qwen3.5-4B-Q8_0.gguf', id: 'Qwen3.5-4B-MTP', name: 'Qwen3.5 4B MTP' })}>
                  <Text style={[s.btnTxt, { color: c.primary, textAlign: 'center' }]}>⬇ 下载</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { borderColor: c.textSecondary, flex: 1 }]} onPress={() => Linking.openURL(getModelDownloadUrl('unsloth/Qwen3.5-4B-MTP-GGUF', 'Qwen3.5-4B-Q8_0.gguf'))}>
                  <Text style={[s.btnTxt, { color: c.textSecondary, textAlign: 'center' }]}>🌐 浏览器下载</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[s.name, { color: c.text, marginBottom: 4 }]}>📥 Gemma 4 E2B QAT</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 10 }}>~3.35GB</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.btn, { borderColor: c.primary, flex: 1 }]} onPress={() => handleMtpDownloadLocal({ repo: 'google/gemma-4-E2B-it-qat-q4_0-gguf', filename: 'gemma-4-E2B_q4_0-it.gguf', id: 'gemma-4-e2b-qat', name: 'Gemma 4 E2B QAT' })}>
                  <Text style={[s.btnTxt, { color: c.primary, textAlign: 'center' }]}>⬇ 下载</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { borderColor: c.textSecondary, flex: 1 }]} onPress={() => Linking.openURL(getModelDownloadUrl('google/gemma-4-E2B-it-qat-q4_0-gguf', 'gemma-4-E2B_q4_0-it.gguf'))}>
                  <Text style={[s.btnTxt, { color: c.textSecondary, textAlign: 'center' }]}>🌐 浏览器下载</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
        {activeTab === 'mtp' && mtpDownloading && (
          <View style={[s.card, { backgroundColor: c.surface, borderColor: c.primary }]}>
            <Text style={{ color: c.text, fontSize: 14, marginBottom: 6 }}>{mtpDownloadStatus}</Text>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border }}>
              <View style={{ width: `${mtpDownloadProgress}%`, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
            </View>
          </View>
        )}

        {activeTab === 'mtp-assistant' && !mtpAssistantDownloading && (
          <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.name, { color: c.text, marginBottom: 4 }]}>📥 Gemma 4 E2B MTP Assistant</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 10 }}>76.5MB</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.btn, { borderColor: c.primary, flex: 1 }]} onPress={() => handleMtpDraftDownloadLocal()}>
                <Text style={[s.btnTxt, { color: c.primary, textAlign: 'center' }]}>⬇ 下载</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { borderColor: c.textSecondary, flex: 1 }]} onPress={() => Linking.openURL(getModelDownloadUrl('lym00/gemma-4-E2B-it-qat-q4_0-unquantized-assistant-gguf-test', 'gemma-4-E2B-it-qat-assistant-q4_0.gguf'))}>
                <Text style={[s.btnTxt, { color: c.textSecondary, textAlign: 'center' }]}>🌐 浏览器下载</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {activeTab === 'mtp-assistant' && mtpAssistantDownloading && (
          <View style={[s.card, { backgroundColor: c.surface, borderColor: c.primary }]}>
            <Text style={{ color: c.text, fontSize: 14, marginBottom: 6 }}>{mtpAssistantDownloadStatus}</Text>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border }}>
              <View style={{ width: `${mtpAssistantDownloadProgress}%`, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
            </View>
          </View>
        )}
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

      {/* MMProj 选择器 */}
      <Modal visible={mmprojPickerTarget !== null} transparent animationType="fade" onRequestClose={() => setMmprojPickerTarget(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setMmprojPickerTarget(null)}>
          <View style={[s.modal, { backgroundColor: c.surface }]}>
            <View style={[s.modalHdr, { borderBottomColor: c.border }]}>
              <Text style={[s.modalTtl, { color: c.text }]}>{t.models.mmprojSelect}</Text>
              <TouchableOpacity onPress={() => setMmprojPickerTarget(null)}>
                <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>{t.common.close}</Text>
              </TouchableOpacity>
            </View>
            {availableMmprojFiles.length === 0 ? (
              <Text style={{ color: c.textSecondary, textAlign: 'center', padding: 20 }}>{t.models.noMmproj}</Text>
            ) : (
              <FlatList
                data={availableMmprojFiles}
                keyExtractor={item => item.path}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}
                    onPress={() => handleMmprojSelect(mmprojPickerTarget!, item.path, item.label)}
                  >
                    <Text style={{ color: c.text, fontSize: 15 }}>{item.label}</Text>
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 300 }}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Vocoder 选择器 */}
      <Modal visible={vocoderPickerTarget !== null} transparent animationType="fade" onRequestClose={() => setVocoderPickerTarget(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setVocoderPickerTarget(null)}>
          <View style={[s.modal, { backgroundColor: c.surface }]}>
            <View style={[s.modalHdr, { borderBottomColor: c.border }]}>
              <Text style={[s.modalTtl, { color: c.text }]}>{t.models.selectVocoder}</Text>
              <TouchableOpacity onPress={() => setVocoderPickerTarget(null)}>
                <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>{t.common.close}</Text>
              </TouchableOpacity>
            </View>
            {availableVocoderFiles.length === 0 ? (
              <Text style={{ color: c.textSecondary, textAlign: 'center', padding: 20 }}>{t.models.noVocoder}</Text>
            ) : (
              <FlatList
                data={availableVocoderFiles}
                keyExtractor={item => item.path}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}
                    onPress={() => handleVocoderSelect(vocoderPickerTarget!, item.path, item.label)}
                  >
                    <Text style={{ color: c.text, fontSize: 15 }}>{item.label}</Text>
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 300 }}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MTP Assistant 选择器 */}
      <Modal visible={mtpAssistantPickerTarget !== null} transparent animationType="fade" onRequestClose={() => setMtpAssistantPickerTarget(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setMtpAssistantPickerTarget(null)}>
          <View style={[s.modal, { backgroundColor: c.surface }]}>
            <View style={[s.modalHdr, { borderBottomColor: c.border }]}>
              <Text style={[s.modalTtl, { color: c.text }]}>{t.models.selectMtpAssistant}</Text>
              <TouchableOpacity onPress={() => setMtpAssistantPickerTarget(null)}>
                <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>{t.common.close}</Text>
              </TouchableOpacity>
            </View>
            {availableMtpAssistantFiles.length === 0 ? (
              <Text style={{ color: c.textSecondary, textAlign: 'center', padding: 20 }}>{t.models.noMtpAssistant}</Text>
            ) : (
              <FlatList
                data={availableMtpAssistantFiles}
                keyExtractor={item => item.path}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}
                    onPress={() => handleMtpAssistantSelect(mtpAssistantPickerTarget!, item.path, item.label)}
                  >
                    <Text style={{ color: c.text, fontSize: 15 }}>{item.label}</Text>
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 300 }}
              />
            )}
          </View>
        </TouchableOpacity>
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
  tabRow: { paddingVertical: 10, paddingLeft: 16 },
  tab: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, alignItems: 'center', marginRight: 8 },
  tabTxt: { fontSize: 13, fontWeight: '600' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagTxt: { fontSize: 11, fontWeight: '600' },
})
