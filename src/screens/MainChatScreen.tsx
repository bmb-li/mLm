import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, FlatList, TextInput, TouchableOpacity, Text, KeyboardAvoidingView, Platform, Keyboard, Alert, Modal, StyleSheet, Pressable, Dimensions, ActivityIndicator, Image, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import AppHeader from '../components/AppHeader'
import ModelSelectorBar from '../components/ModelSelectorBar'
import CompletionParamsModal from '../components/CompletionParamsModal'
import { useModelContext } from '../contexts/ModelContext'
import { useStoredCompletionParams } from '../hooks/useStoredSetting'
import { useTtsEngine, useTtsAutoSpeak, useTtsSpeed, useTtsVoice, useStoredCustomModels } from '../hooks/useStoredSetting'
import Speech from '@mhpdev/react-native-speech'
import { searchWebViaApi, buildSearchSystemPrompt, getSearchEngineIcon } from '../features/websearch/services/SearchOrchestrator'
import { enrichWithContent } from '../features/websearch/services/ContentFetchService'
import { loadSearchEnabled, loadSearchEngine, loadTavilyApiKey } from '../features/websearch/utils/searchStorage'
import type { SearchResult, SearchEngine } from '../features/websearch/types'
import SearchWebView from '../features/websearch/services/SearchWebView'
import SearchResultModal from '../features/websearch/services/SearchResultModal'
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'
import ReactNativeBlobUtil from 'react-native-blob-util'
import RNBlobUtil from 'react-native-blob-util'
import Icon from '@react-native-vector-icons/material-design-icons'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
  searchResults?: SearchResult[]
  imageData?: string
  audioData?: string
  timings?: any
}

interface Conversation {
  id: string
  title: string
  timestamp: number
  messages: ChatMessage[]
}

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful, harmless, and honest AI assistant. Be concise and helpful in your responses.'
const CONVERSATIONS_KEY = '@chat_conversations'

function formatRate(value?: number) {
  if (typeof value !== 'number' || value <= 0) return undefined
  return value >= 100 ? `${Math.round(value)} tok/s` : `${value.toFixed(1)} tok/s`
}

function formatDuration(ms?: number) {
  if (typeof ms !== 'number' || ms <= 0) return undefined
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`
}

function formatTokenCount(value?: number) {
  if (typeof value !== 'number' || value < 0) return undefined
  return value === 0 ? '0 tok' : `${value} tok`
}

export default function MainChatScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showCompletionParams, setShowCompletionParams] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set())
  const [expandedTimings, setExpandedTimings] = useState<Set<string>>(new Set())
  const [isReadOnly, setIsReadOnly] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const insets = useSafeAreaInsets()
  const stopRef = useRef<(() => Promise<void>) | null>(null)
  const reasoningPreferenceRef = useRef(false)
  const autoExpandedRef = useRef(false)
  const [actionMenuMsg, setActionMenuMsg] = useState<ChatMessage | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [editMsgId, setEditMsgId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [selectableMsgId, setSelectableMsgId] = useState<string | null>(null)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)

  const [searchEnabled, setSearchEnabled] = useState(false)
  const [searchEngine, setSearchEngine] = useState<SearchEngine>('google')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchSources, setShowSearchSources] = useState<string>('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('')
  const searchResultsRef = useRef<SearchResult[] | null>(null)
  const tavilyApiKeyRef = useRef('')
  const searchResolveRef = useRef<((r: SearchResult[]) => void) | null>(null)
  const searchRejectRef = useRef<((e: string) => void) | null>(null)
  const [showMetasoModal, setShowMetasoModal] = useState(false)
  const pendingQueryRef = useRef('')
  const pendingAssistantIdRef = useRef('')

  useFocusEffect(useCallback(() => {
    loadSearchEnabled().then(setSearchEnabled)
    loadSearchEngine().then(setSearchEngine)
    loadTavilyApiKey().then(k => { tavilyApiKeyRef.current = k })
    reloadTtsEngine()
    reloadTtsAutoSpeak()
    reloadTtsSpeed()
    reloadTtsVoice()
  }, []))

  const { context, isModelReady, activeModelName, vocoderReady, loadModel } = useModelContext()
  const { value: customModels } = useStoredCustomModels()
  const { value: completionParams, setValue: setCompletionParams } = useStoredCompletionParams()

  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<{ type: 'image' | 'audio'; data: string; mimeType: string } | null>(null)
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const recordingRef = useRef<{ stop: () => Promise<string> } | null>(null)
  const processingImageRef = useRef(false)
  const ttsBufferRef = useRef('')
  const ttsSentenceRef = useRef('')
  const ttsEventsRef = useRef<any>(null)
  const ttsSpeakingRef = useRef(false)
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null)
  const { value: ttsEngine, reload: reloadTtsEngine } = useTtsEngine()
  const { value: ttsAutoSpeak, reload: reloadTtsAutoSpeak } = useTtsAutoSpeak()
  const { value: ttsSpeed, reload: reloadTtsSpeed } = useTtsSpeed()
  const { value: ttsVoice, reload: reloadTtsVoice } = useTtsVoice()

  useEffect(() => {
    AsyncStorage.getItem(CONVERSATIONS_KEY).then(data => {
      if (data) setConversations(JSON.parse(data))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: !isStreaming }), 50)
    }
  }, [messages, isStreaming])

  const saveConversations = useCallback(async (convs: Conversation[]) => {
    setConversations(convs)
    await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs))
  }, [])

  const handleNewChat = () => {
    if (messages.length > 0) {
      const title = messages.find(m => m.role === 'user')?.content.slice(0, 50) || 'Chat'
      const conv: Conversation = { id: Date.now().toString(), title, timestamp: Date.now(), messages }
      saveConversations([conv, ...conversations])
    }
    setMessages([])
    setIsReadOnly(false)
  }

  useEffect(() => {
    if (activeModelName) {
      setIsReadOnly(false)
    }
  }, [activeModelName])

  const handleLoadConversation = (conv: Conversation) => {
    setMessages(conv.messages)
    setShowHistory(false)
    setIsReadOnly(!activeModelName)
  }

  const handleDeleteConversation = (id: string) => {
    saveConversations(conversations.filter(c => c.id !== id))
  }

  const handleStop = useCallback(() => {
    stopRef.current?.()
    setIsStreaming(false)
  }, [])

  const handleTakePhoto = useCallback(async () => {
    try {
      const result = await launchCamera({ mediaType: 'photo', quality: 0.8, includeBase64: false })
      if (result.assets?.[0]?.uri) {
        const b64 = await RNBlobUtil.fs.readFile(result.assets[0].uri.replace('file://', ''), 'base64')
        const mimeType = result.assets[0].type || 'image/jpeg'
        setPendingMedia({ type: 'image', data: `data:${mimeType};base64,${b64}`, mimeType })
      }
    } catch {}
    setShowAttachMenu(false)
  }, [])

  const handlePickFromGallery = useCallback(async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, includeBase64: false })
      if (result.assets?.[0]?.uri) {
        const b64 = await RNBlobUtil.fs.readFile(result.assets[0].uri.replace('file://', ''), 'base64')
        const mimeType = result.assets[0].type || 'image/jpeg'
        setPendingMedia({ type: 'image', data: `data:${mimeType};base64,${b64}`, mimeType })
      }
    } catch {}
    setShowAttachMenu(false)
  }, [])

  const handlePickFile = useCallback(async () => {
    try {
      const { pick } = require('@react-native-documents/picker')
      const [file] = await pick({ type: ['*/*'] })
      if (file?.uri) {
        const path = file.uri.replace('file://', '')
        const b64 = await RNBlobUtil.fs.readFile(path, 'base64')
        const mimeType = file.type || 'application/octet-stream'
        const isImage = mimeType.startsWith('image/')
        if (isImage) {
          setPendingMedia({ type: 'image', data: `data:${mimeType};base64,${b64}`, mimeType })
        } else if (mimeType.startsWith('audio/')) {
          setPendingMedia({ type: 'audio', data: `data:${mimeType};base64,${b64}`, mimeType })
        }
      }
    } catch {}
    setShowAttachMenu(false)
  }, [])

  const handleStartRecording = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const PermissionsAndroid = require('react-native').PermissionsAndroid
        const has = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
        if (!has) {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
          if (granted === 'never_ask_again') {
            Alert.alert('需要麦克风权限', '请在系统设置中为 mLm 开启麦克风权限')
            return
          }
          if (granted !== 'granted') { return }
        }
      }
      const { AudioRecorder } = require('react-native-audio-api')
      if (!AudioRecorder) return
      const recorder = new AudioRecorder()
      const chunks: Float32Array[] = []
      recorder.onAudioReady({ sampleRate: 16000, bufferLength: 4096, channelCount: 1 }, (event: any) => {
        if (event.buffer) {
          try { chunks.push(event.buffer.getChannelData(0)) } catch {}
        }
      })
      recorder.start()
      setIsRecording(true)
      recordingRef.current = {
        stop: async () => {
          recorder.stop()
          if (chunks.length === 0) return ''
          const totalLen = chunks.reduce((s, c) => s + c.length, 0)
          const merged = new Float32Array(totalLen)
          let offset = 0
          for (const c of chunks) { merged.set(c, offset); offset += c.length }
          chunks.length = 0
          const pcm16 = new Int16Array(merged.length)
          for (let i = 0; i < merged.length; i++) {
            const s = Math.max(-1, Math.min(1, merged[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          const header = new ArrayBuffer(44)
          const dv = new DataView(header)
          const writeStr = (off: number, str: string) => { for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i)) }
          writeStr(0, 'RIFF')
          dv.setUint32(4, 36 + pcm16.length * 2, true)
          writeStr(8, 'WAVE')
          writeStr(12, 'fmt ')
          dv.setUint32(16, 16, true)
          dv.setUint16(20, 1, true)
          dv.setUint16(22, 1, true)
          dv.setUint32(24, 16000, true)
          dv.setUint32(28, 16000 * 2, true)
          dv.setUint16(32, 2, true)
          dv.setUint16(34, 16, true)
          writeStr(36, 'data')
          dv.setUint32(40, pcm16.length * 2, true)
          const wav = new Uint8Array(header.byteLength + pcm16.length * 2)
          wav.set(new Uint8Array(header), 0)
          wav.set(new Uint8Array(pcm16.buffer), 44)
          let binary = ''
          const cs = 4096
          for (let i = 0; i < wav.length; i += cs) {
            const end = Math.min(i + cs, wav.length)
            for (let j = i; j < end; j++) binary += String.fromCharCode(wav[j])
          }
          const b64 = btoa(binary)
          const filePath = `${ReactNativeBlobUtil.fs.dirs.MusicDir}/mLm_rec_${Date.now()}.wav`
          await ReactNativeBlobUtil.fs.writeFile(filePath, b64, 'base64')
          return filePath
        },
      }
    } catch (e) {
      console.warn('[RECORD] handleStartRecording error:', e)
      setIsRecording(false)
    }
  }, [])

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const audioCtxRef = useRef<any>(null)

  const handlePlayAudio = useCallback(async (id: string, filePath: string) => {
    if (audioCtxRef.current) {
      await audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    const { AudioContext } = require('react-native-audio-api')
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    try {
      setPlayingAudioId(id)
      const audioBuffer = await ctx.decodeAudioData('file://' + filePath)
      if (!audioBuffer) { await ctx.close(); audioCtxRef.current = null; setPlayingAudioId(null); return }
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.start()
      const timeout = setTimeout(() => {
        ctx.close().then(() => { audioCtxRef.current = null })
        setPlayingAudioId(null)
      }, (audioBuffer.duration + 0.5) * 1000)
      source.onended = () => {
        clearTimeout(timeout)
        ctx.close().then(() => { audioCtxRef.current = null })
        setPlayingAudioId(null)
      }
    } catch {
      await ctx.close()
      audioCtxRef.current = null
      setPlayingAudioId(null)
    }
  }, [])

  const handleSend = useCallback(async (mediaOverride?: typeof pendingMedia) => {
    const text = inputText.trim()
    const media = mediaOverride || pendingMedia
    if ((!text && !media) || isStreaming) return

    if (!context) {
      Alert.alert(t.chat.noModelTitle, t.chat.noModelMessage)
      return
    }

    const userMsg: ChatMessage = { id: `user_${Date.now()}`, role: 'user', content: media ? text : text, imageData: media?.type === 'image' ? media.data : undefined, audioData: media?.type === 'audio' ? media.data : undefined }
    const assistantId = `assistant_${Date.now()}`
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInputText('')
    Keyboard.dismiss()

    // 构建多模态或纯文本消息
    let userContent: any
    if (media) {
      userContent = text ? [{ type: 'text', text }] : []
      if (media.type === 'image') {
        userContent.push({ type: 'image_url', image_url: { url: media.data } })
      } else if (media.type === 'audio') {
        userContent.push({ type: 'input_audio', input_audio: { format: 'wav', url: `file://${media.data}` } })
      }
      setPendingMedia(null)
      processingImageRef.current = true
    }

    // 秘塔搜索：弹出 WebView 窗口让用户查看结果
    if (searchEnabled && searchEngine === 'metaso') {
      pendingQueryRef.current = text
      pendingAssistantIdRef.current = assistantId
      setShowMetasoModal(true)
      return
    }

    setIsStreaming(true)
    autoExpandedRef.current = false

    try {
      let searchSystemPrompt = ''
      let searchHits: SearchResult[] | null = null

      if (searchEnabled) {
        setIsSearching(true)
        setActiveSearchQuery(text)
        setMessages(prev => prev.map(msg =>
          msg.id === assistantId ? { ...msg, content: '🔍 ' + t.search.searching } : msg,
        ))
        try {
          let results: SearchResult[]
          if (searchEngine === 'tavily') {
            results = await searchWebViaApi(text, searchEngine, tavilyApiKeyRef.current)
          } else {
            results = await new Promise<SearchResult[]>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Search timeout')), 30000)
              searchResolveRef.current = (r: SearchResult[]) => {
                clearTimeout(timeout)
                resolve(r)
              }
              searchRejectRef.current = (e: string) => {
                clearTimeout(timeout)
                reject(new Error(e))
              }
            })
            results = await enrichWithContent(results)
          }
          searchHits = results
          searchResultsRef.current = results
          setSearchResults(results)
          if (results.length > 0) {
            searchSystemPrompt = buildSearchSystemPrompt(results, text)
          }
        } catch (e: any) {
          searchHits = null
          searchResultsRef.current = null
          setSearchResults(null)
          setMessages(prev => prev.map(msg =>
            msg.id === assistantId ? { ...msg, content: `⚠️ ${t.search.searchError}: ${e.message || ''}` } : msg,
          ))
        } finally {
          setIsSearching(false)
          setActiveSearchQuery('')
        }
      }

      const systemContent = searchSystemPrompt
        ? DEFAULT_SYSTEM_PROMPT + '\n\n' + searchSystemPrompt
        : DEFAULT_SYSTEM_PROMPT
      const allMessages = [
        { role: 'system' as const, content: systemContent },
        ...messages.map(m => {
          if ((m as any).audioData) {
            return {
              role: m.role as 'user' | 'assistant',
              content: [
                ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
                { type: 'input_audio' as const, input_audio: { format: 'wav' as const, url: 'file://' + (m as any).audioData } },
              ],
            }
          }
          return { role: m.role as 'user' | 'assistant', content: m.content }
        }),
        { role: 'user' as const, content: userContent || text },
      ]

      const params = completionParams || {}
      const { promise, stop } = await context.parallel.completion(
        { ...params, messages: allMessages, reasoning_format: 'auto' },
        (_reqId: number, data: any) => {
          if (processingImageRef.current) processingImageRef.current = false
          const reasoningContent = data.reasoning_content || ''
          let content = data.content || ''
          if (reasoningContent || /<think>/i.test(content)) {
            content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim()
          }
          if (content || reasoningContent) {
            setMessages(prev => prev.map(msg =>
              msg.id === assistantId ? { ...msg, content, reasoningContent } : msg,
            ))
          }
          if (reasoningContent && reasoningPreferenceRef.current && !autoExpandedRef.current) {
            autoExpandedRef.current = true
            setExpandedReasoning(prev => new Set(prev).add(assistantId))
          }
          // TTS: stream by sentence using incremental token
          if (ttsAutoSpeak && ttsEngine === 'system' && data.token && data.content) {
            if (!ttsSpeakingRef.current) {
              ttsSpeakingRef.current = true
              setSpeakingMsgId(assistantId)
            }
            ttsSentenceRef.current += data.token
            const m = ttsSentenceRef.current.match(/[，,。！？.!?\n]/)
            if (m) {
              const sentence = ttsSentenceRef.current.substring(0, m.index! + 1).trim()
              ttsSentenceRef.current = ttsSentenceRef.current.substring(m.index! + 1)
              if (sentence) Speech.speak(sentence, { rate: ttsSpeed || 1.0, voice: ttsVoice || undefined }).catch(() => {})
            }
          }
        },
      )
      stopRef.current = stop
      const completionResult = await promise
      stopRef.current = null

      const finalContent = completionResult.interrupted ? completionResult.text : (completionResult.content || completionResult.text)
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId ? { ...msg, content: finalContent, searchResults: searchHits || undefined, timings: completionResult.timings } : msg,
      ))

      // TTS: speak remaining buffered text
      if (ttsAutoSpeak && ttsSentenceRef.current.trim() && ttsEngine === 'system') {
        Speech.speak(ttsSentenceRef.current.trim(), { rate: ttsSpeed || 1.0, voice: ttsVoice || undefined }).catch(() => {})
      }
      ttsSentenceRef.current = ''
      ttsBufferRef.current = ''
      // TTS: poll for queue empty to clear icon
      if (ttsSpeakingRef.current) {
        const pollDone = () => {
          Speech.isSpeaking().then(speaking => {
            if (!speaking) { ttsSpeakingRef.current = false; setSpeakingMsgId(null) }
            else setTimeout(pollDone, 500)
          }).catch(() => {})
        }
        setTimeout(pollDone, 1000)
      }
    } catch (error: any) {
      if (error?.message?.toLowerCase().includes('model') || error?.message?.toLowerCase().includes('no model')) {
        Alert.alert(t.chat.noModelTitle, t.chat.noModelMessage)
      } else {
        Alert.alert(t.common.error, error?.message || '未知错误')
      }
    } finally {
      setIsStreaming(false)
    }
  }, [inputText, isStreaming, context, messages, completionParams, searchEnabled, searchEngine, ttsEngine, ttsAutoSpeak, ttsSpeed])

  const handleStopRecording = useCallback(async () => {
    if (!recordingRef.current) { setIsRecording(false); return }
    setIsRecording(false)
    try {
      const filePath = await recordingRef.current.stop()
      recordingRef.current = null
      if (!filePath) { setIsVoiceMode(false); return }
      const media = { type: 'audio' as const, data: filePath, mimeType: 'audio/wav' }
      handleSend(media)
    } catch (e) {
      console.warn('[RECORD] handleStopRecording error:', e)
    }
  }, [handleSend])

  const handleMetasoResults = useCallback(async (extractedText: string) => {
    setShowMetasoModal(false)
    const text = pendingQueryRef.current
    const assistantId = pendingAssistantIdRef.current
    if (!text || !assistantId) return

    setIsStreaming(true)
    autoExpandedRef.current = false

    try {
      const systemContent = DEFAULT_SYSTEM_PROMPT + '\n\n' + buildSearchSystemPrompt(
        [{ title: '', url: '', content: extractedText }], text,
      )
      const allMessages = [
        { role: 'system' as const, content: systemContent },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: text },
      ]

      const params = completionParams || {}
      const { promise, stop } = await context.parallel.completion(
        { ...params, messages: allMessages, reasoning_format: 'auto' },
        (_reqId: number, data: any) => {
          const reasoningContent = data.reasoning_content || ''
          let content = data.content || ''
          if (reasoningContent || /<think>/i.test(content)) {
            content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim()
          }
          if (content || reasoningContent) {
            setMessages(prev => prev.map(msg =>
              msg.id === assistantId ? { ...msg, content, reasoningContent } : msg,
            ))
          }
          if (reasoningContent && reasoningPreferenceRef.current && !autoExpandedRef.current) {
            autoExpandedRef.current = true
            setExpandedReasoning(prev => new Set(prev).add(assistantId))
          }
        },
      )
      stopRef.current = stop
      const completionResult = await promise
      stopRef.current = null
      const finalContent = completionResult.interrupted ? completionResult.text : (completionResult.content || completionResult.text)
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId ? { ...msg, content: finalContent, timings: completionResult.timings } : msg,
      ))
    } catch (error: any) {
      Alert.alert(t.common.error, error.message)
    } finally {
      setIsStreaming(false)
    }
  }, [context, messages, completionParams])

  const toggleReasoning = (id: string) => {
    setExpandedReasoning(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        reasoningPreferenceRef.current = false
      } else {
        next.add(id)
        reasoningPreferenceRef.current = true
      }
      return next
    })
  }

  const toggleTimings = (id: string) => {
    setExpandedTimings(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    if (!expandedTimings.has(id) && messages.length > 0) {
      const last = messages[messages.length - 1]
      if (last.id === id) {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
      }
    }
  }

  const copyToClipboard = useCallback((text: string) => {
    Clipboard.setString(text)
  }, [])

  const writeLog = useCallback(async (tag: string, msg: string) => {
    try {
      const p = `${RNBlobUtil.fs.dirs.CacheDir}/mlm_debug.log`
      const entry = `[${new Date().toISOString().slice(11,19)}] [${tag}] ${msg}\n`
      const prev = (await RNBlobUtil.fs.exists(p)) ? await RNBlobUtil.fs.readFile(p, 'utf8') : ''
      await RNBlobUtil.fs.writeFile(p, (prev + entry).slice(-10000), 'utf8')
    } catch {}
  }, [])

  const handleSpeak = useCallback(async (msgId: string, text: string) => {
    if (!text) return
    if (ttsEngine === 'off') return
    const speaking = await Speech.isSpeaking().catch(() => false)
    if (speaking) {
      try { await Speech.stop() } catch {}
      ttsSpeakingRef.current = false
      setSpeakingMsgId(null)
      return
    }
    setSpeakingMsgId(msgId)
    ttsSpeakingRef.current = true

    if (ttsEngine === 'model') {
      try {
        writeLog('TTS', `model speak: id=${msgId.slice(0,8)}, len=${text.length}`)
        // Auto-load TTS model if vocoder not ready
        if (!vocoderReady && customModels) {
          const ttsModel = customModels.find(m => (m as any).vocoderLocalPath)
          if (!ttsModel) {
            Alert.alert('未找到 TTS 模型', '请先在语音模型选项卡下载 OuteTTS 模型和声码器。')
            setSpeakingMsgId(null); return
          }
          writeLog('TTS', `auto-loading model: ${ttsModel.id}`)
          await loadModel(ttsModel.localPath || '', ttsModel.id, undefined, (ttsModel as any).vocoderLocalPath)
        }
        if (!context || !vocoderReady) { setSpeakingMsgId(null); return }
        writeLog('TTS', 'formatting audio completion...')
        const { prompt, grammar } = await context.getFormattedAudioCompletion(null, text)
        const guideTokens = await context.getAudioCompletionGuideTokens(text)
        writeLog('TTS', 'generating audio...')
        const result = await context.completion({
          prompt, grammar, guide_tokens: guideTokens,
          n_predict: 4096, temperature: 0.7, stop: ['<|im_end|>'],
        })
        if (result.audio_tokens?.length > 0) {
          writeLog('TTS', `decoding ${result.audio_tokens.length} tokens...`)
          const decoded = await context.decodeAudioTokens(result.audio_tokens)
          const float32 = new Float32Array(decoded)
          const { AudioContext } = require('react-native-audio-api')
          const actx = new AudioContext({ sampleRate: 24000 })
          const buf = actx.createBuffer(1, float32.length, 24000)
          buf.copyToChannel(float32, 0)
          const src = actx.createBufferSource()
          src.buffer = buf; src.connect(actx.destination)
          src.onended = () => { actx.close(); setSpeakingMsgId(null) }
          src.start()
          writeLog('TTS', 'playing...')
        } else {
          writeLog('TTS', 'no audio tokens')
          setSpeakingMsgId(null)
        }
      } catch (e: any) {
        writeLog('TTS', `model error: ${e?.message || e}`)
        Alert.alert('模型 TTS 错误', e?.message || String(e))
        setSpeakingMsgId(null)
      }
      return
    }

    // System TTS
    try {
      writeLog('TTS', `sys speak: id=${msgId.slice(0,8)}, len=${text.length}`)
      if (ttsEventsRef.current) ttsEventsRef.current.remove()
      ttsEventsRef.current = Speech.onFinish(() => {
        writeLog('TTS', 'finish event')
        setSpeakingMsgId(null)
      })
      writeLog('TTS', 'calling speak...')
      await Speech.speak(text, { rate: ttsSpeed || 1.0, voice: ttsVoice || undefined })
      writeLog('TTS', 'speak returned ok')
    } catch (e: any) {
      writeLog('TTS', `sys error: ${e?.message || e}`)
      setSpeakingMsgId(null)
    }
  }, [ttsSpeed, writeLog, ttsEngine, vocoderReady, customModels, loadModel, context])

  const deleteMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id))
  }, [])

  const startEdit = useCallback((msg: ChatMessage) => {
    setEditMsgId(msg.id)
    setEditText(msg.content)
    setActionMenuMsg(null)
  }, [])

  const saveEdit = useCallback(() => {
    if (editMsgId) {
      setMessages(prev => prev.map(m =>
        m.id === editMsgId ? { ...m, content: editText } : m,
      ))
      setEditMsgId(null)
      setEditText('')
    }
  }, [editMsgId, editText])

  const cancelEdit = useCallback(() => {
    setEditMsgId(null)
    setEditText('')
  }, [])

  const regenerateFromIndex = useCallback(async (userMsgIndex: number) => {
    const userMsg = messages[userMsgIndex]
    if (!userMsg || userMsg.role !== 'user') return
    if (!context) {
      Alert.alert(t.chat.noModelTitle, t.chat.noModelMessage)
      return
    }

    const assistantId = `assistant_${Date.now()}`
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }

    setMessages(prev => {
      const before = prev.slice(0, userMsgIndex + 1)
      const after = prev.slice(userMsgIndex + 2)
      return [...before, assistantMsg, ...after]
    })
    setIsStreaming(true)
    autoExpandedRef.current = false

    try {
      const msgs = messages.slice(0, userMsgIndex + 1)
      const allMessages = [
        { role: 'system' as const, content: DEFAULT_SYSTEM_PROMPT },
        ...msgs.map(m => {
          if ((m as any).imageData) {
            return {
              role: m.role as 'user' | 'assistant',
              content: [
                { type: 'text', text: m.content || '' },
                { type: 'image_url', image_url: { url: (m as any).imageData } },
              ],
            }
          }
          if ((m as any).audioData) {
            return {
              role: m.role as 'user' | 'assistant',
              content: [
                ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
                { type: 'input_audio' as const, input_audio: { format: 'wav' as const, url: 'file://' + (m as any).audioData } },
              ],
            }
          }
          return { role: m.role as 'user' | 'assistant', content: m.content }
        }),
      ]

      const params = completionParams || {}
      const { promise, stop } = await context.parallel.completion(
        { ...params, messages: allMessages, reasoning_format: 'auto' },
        (_reqId: number, data: any) => {
          const reasoningContent = data.reasoning_content || ''
          let content = data.content || ''
          if (reasoningContent || /<think>/i.test(content)) {
            content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim()
          }
          if (content || reasoningContent) {
            setMessages(prev => prev.map(msg =>
              msg.id === assistantId ? { ...msg, content, reasoningContent } : msg,
            ))
          }
          if (reasoningContent && reasoningPreferenceRef.current && !autoExpandedRef.current) {
            autoExpandedRef.current = true
            setExpandedReasoning(prev => new Set(prev).add(assistantId))
          }
          // TTS: stream by sentence using incremental token
          if (ttsAutoSpeak && ttsEngine === 'system' && data.token && data.content) {
            if (!ttsSpeakingRef.current) {
              ttsSpeakingRef.current = true
              setSpeakingMsgId(assistantId)
            }
            ttsSentenceRef.current += data.token
            const m = ttsSentenceRef.current.match(/[，,。！？.!?\n]/)
            if (m) {
              const sentence = ttsSentenceRef.current.substring(0, m.index! + 1).trim()
              ttsSentenceRef.current = ttsSentenceRef.current.substring(m.index! + 1)
              if (sentence) Speech.speak(sentence, { rate: ttsSpeed || 1.0, voice: ttsVoice || undefined }).catch(() => {})
            }
          }
        },
      )
      stopRef.current = stop
      const completionResult = await promise
      stopRef.current = null

      const finalContent = completionResult.interrupted ? completionResult.text : (completionResult.content || completionResult.text)
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId ? { ...msg, content: finalContent, timings: completionResult.timings } : msg,
      ))

      // TTS: speak remaining buffered text
      if (ttsAutoSpeak && ttsSentenceRef.current.trim() && ttsEngine === 'system') {
        Speech.speak(ttsSentenceRef.current.trim(), { rate: ttsSpeed || 1.0, voice: ttsVoice || undefined }).catch(() => {})
      }
      ttsSentenceRef.current = ''
      // TTS: poll for queue empty to clear icon
      if (ttsSpeakingRef.current) {
        const pollDone = () => {
          Speech.isSpeaking().then(speaking => {
            if (!speaking) { ttsSpeakingRef.current = false; setSpeakingMsgId(null) }
            else setTimeout(pollDone, 500)
          }).catch(() => {})
        }
        setTimeout(pollDone, 1000)
      }
    } catch (error: any) {
      Alert.alert(t.common.error, error.message)
    } finally {
      setIsStreaming(false)
    }
  }, [context, messages, completionParams, ttsEngine, ttsAutoSpeak, ttsSpeed])

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user'
    const hasReasoning = !!item.reasoningContent
    const showReason = expandedReasoning.has(item.id)
    const showTime = expandedTimings.has(item.id)
    const tData = item.timings
    const genRate = formatRate(tData?.predicted_per_second)
    const promptLine = tData ? `Prompt: ${formatTokenCount(tData.prompt_n) || ''} ${formatDuration(tData.prompt_ms) || ''} ${formatRate(tData.prompt_per_second) || ''}`.trim() : ''
    const genLine = tData ? `Generation: ${formatTokenCount(tData.predicted_n) || ''} ${formatDuration(tData.predicted_ms) || ''} ${formatRate(tData.predicted_per_second) || ''}`.trim() : ''
    const isSelectable = selectableMsgId === item.id

    const handleLongPress = (e: any) => {
      if (isSelectable) return
      setMenuPos({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
      setActionMenuMsg(item)
    }

    return (
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={500}
        style={({ pressed }) => ({
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          maxWidth: '80%',
          minWidth: isUser ? undefined : 180,
          marginVertical: 4,
          marginHorizontal: 16,
          borderRadius: 16,
          backgroundColor: isUser ? colors.card : '#000000',
          overflow: 'hidden',
          borderWidth: isSelectable ? 2 : 0,
          borderStyle: 'dashed',
          borderColor: '#FFA500',
          opacity: pressed && !isSelectable ? 0.8 : 1,
        })}
      >
        {hasReasoning && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, backgroundColor: colors.card }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => toggleReasoning(item.id)}
            >
              <Text style={{ fontSize: 12, color: '#DAA520', fontWeight: '600' }}>
                {showReason ? t.chat.hideReasoning : t.chat.showReasoning}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              hitSlop={8}
              onPress={() => {
                copyToClipboard(item.reasoningContent || '')
              }}
              style={{ marginLeft: 8 }}
            >
              <Text style={{ fontSize: 14, color: '#DAA520' }}>📋</Text>
            </TouchableOpacity>
          </View>
        )}
        {showReason && hasReasoning && (
          <View style={{
            paddingHorizontal: 12, paddingVertical: 10,
            backgroundColor: '#000000',
            borderLeftWidth: 3,
            borderLeftColor: '#DAA520',
          }}>
            <Text style={{ fontSize: 13, color: '#DAA520', fontFamily: 'monospace', lineHeight: 18, fontStyle: 'italic' }} selectable>
              {item.reasoningContent}
            </Text>
          </View>
        )}
        {editMsgId === item.id ? (
          <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              style={{ color: colors.text, fontSize: 15, lineHeight: 20, backgroundColor: colors.inputBackground, borderRadius: 8, padding: 8 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 }}>
              <TouchableOpacity onPress={cancelEdit} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.disabled }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{t.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}>
                <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>{t.common.save}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {item.searchResults && item.searchResults.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowSearchSources(prev => prev === item.id ? '' : item.id)}
                style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 }}
              >
                <Text style={{ fontSize: 12, color: '#4A90D9', fontWeight: '500' }}>
                  {showSearchSources === item.id ? '▼' : '▶'} 🌐 {t.search.sources} ({item.searchResults.length})
                </Text>
              </TouchableOpacity>
            )}
            {showSearchSources === item.id && item.searchResults && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
                {item.searchResults.map((sr, i) => (
                  <TouchableOpacity key={i} onPress={() => {}} style={{ marginVertical: 2 }}>
                    <Text style={{ fontSize: 11, color: '#4A90D9' }} numberOfLines={1}>
                      [{i + 1}] {sr.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              {item.imageData && (
                <Image source={{ uri: item.imageData }} style={{ width: 200, height: 200, borderRadius: 8, marginBottom: 6 }} resizeMode="contain" />
              )}
              {item.audioData ? (
                <TouchableOpacity onPress={() => handlePlayAudio(item.id, item.audioData!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 24 }}>{playingAudioId === item.id ? '🔊' : '🔈'}</Text>
                  <Text style={{ color: isUser ? '#FFF' : colors.text, fontSize: 14 }}>{playingAudioId === item.id ? '播放中...' : '点击播放音频'}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: isUser ? '#FFF' : colors.text, fontSize: 15, lineHeight: 20 }} selectable={selectableMsgId === item.id}>
                  {item.content || (isStreaming && !isUser ? (processingImageRef.current ? '⏳ ' + t.chat.processing : '...') : '')}
              </Text>
              )}
            </View>
          </>
        )}
        {!isUser && (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {!isStreaming && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TouchableOpacity
                    hitSlop={6}
                    onPress={() => { copyToClipboard(item.content); setCopiedMsgId(item.id); setTimeout(() => setCopiedMsgId(prev => prev === item.id ? null : prev), 2000) }}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>{copiedMsgId === item.id ? '✅' : '📋'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    hitSlop={6}
                    onPress={() => setSelectableMsgId(item.id)}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    hitSlop={6}
                    onPress={() => {
                      const idx = messages.findIndex(m => m.id === item.id)
                      if (idx > 0) regenerateFromIndex(idx - 1)
                    }}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>🔄</Text>
                  </TouchableOpacity>
                  {ttsEngine !== 'off' && (
                    <TouchableOpacity
                      hitSlop={6}
                      onPress={() => handleSpeak(item.id, item.content)}
                      style={{ padding: 4 }}
                    >
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>{speakingMsgId === item.id ? '🔊' : '🔈'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {(genRate || tData) && (
                  <TouchableOpacity
                    activeOpacity={tData ? 0.6 : 1}
                    disabled={!tData}
                    onPress={() => toggleTimings(item.id)}
                    style={{ backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 12, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', fontFamily: 'monospace' }}>
                      {genRate || 'Timings'}
                    </Text>
                    {tData && <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{showTime ? '▾' : '▸'}</Text>}
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {showTime && tData && (
              <View style={{ marginTop: 6, gap: 2, alignItems: 'flex-end' }}>
                {promptLine && <Text style={{ color: colors.textSecondary, fontSize: 10, fontFamily: 'monospace' }}>{promptLine}</Text>}
                {genLine && <Text style={{ color: colors.textSecondary, fontSize: 10, fontFamily: 'monospace' }}>{genLine}</Text>}
            </View>
          )}
        </View>
          )}
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['left', 'right']}>
      <AppHeader
        leftComponent={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 8 }}
              onPress={() => { setShowHistory(true) }}
            >
              <Text style={{ color: colors.headerText, fontSize: 20 }}>☰</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 22 }}>🦙</Text>
          </View>
        }
        rightButtons={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' }}
              onPress={handleNewChat}
            >
              <Text style={{ color: colors.headerText, fontSize: 18 }}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' }}
              onPress={() => setShowCompletionParams(true)}
            >
              <Text style={{ color: colors.headerText, fontSize: 18 }}>⚙️</Text>
            </TouchableOpacity>
          </View>
        }
      />
      <ModelSelectorBar activeModelName={activeModelName} onPress={() => navigation.navigate('ModelTab')} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={{ flex: 1 }}>
          {isReadOnly && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFF3CD' }}>
              <Text style={{ fontSize: 13, color: '#856404' }}>
                {t.chat.readOnlyBanner}
              </Text>
            </View>
          )}
          {!isModelReady && !isReadOnly ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center' }}>{t.chat.noModelSelected}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8 }}>{t.app.tagline}</Text>
            </View>
          ) : messages.length === 0 && !isReadOnly ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t.app.tagline}</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderMessage}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 16 }}
              onScrollBeginDrag={() => { if (selectableMsgId) setSelectableMsgId(null) }}
            />
          )}
          {/* 输入区域 */}
          <View style={{
            borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
          }}>
            {/* 待发送附件预览 */}
            {pendingMedia && (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
                {pendingMedia.type === 'image' ? (
                  <Image source={{ uri: pendingMedia.data }} style={{ width: 40, height: 40, borderRadius: 6 }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' }}>
                    <Text>🎤</Text>
                  </View>
                )}
                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12, marginLeft: 8 }} numberOfLines={1}>
                  {pendingMedia.type === 'image' ? '图片待发送' : '音频待发送'}
                </Text>
                <TouchableOpacity onPress={() => setPendingMedia(null)}>
                  <Text style={{ color: colors.error, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 第1行：编辑框 / 语音按钮 */}
            {isVoiceMode ? (
              <Pressable
                onPressIn={handleStartRecording}
                onPressOut={handleStopRecording}
                style={({ pressed }) => ({
                  margin: 8, paddingVertical: 16, borderRadius: 12,
                  backgroundColor: isRecording ? colors.error + '20' : (pressed ? colors.primary + '20' : colors.inputBackground),
                  alignItems: 'center',
                })}
              >
                <Text style={{ color: isRecording ? colors.error : colors.text, fontSize: 16, fontWeight: '600' }}>
                  {isRecording ? t.chat.voiceRelease : t.chat.voiceTip}
                </Text>
              </Pressable>
            ) : (
              <TextInput
                value={inputText}
                onChangeText={(text) => { setInputText(text); if (text && isVoiceMode) setIsVoiceMode(false) }}
                placeholder={isModelReady ? t.chat.typeMessage : t.chat.noModelSelected}
                placeholderTextColor={colors.textSecondary}
                multiline
                style={{
                  margin: 8, maxHeight: 100, paddingHorizontal: 14, paddingVertical: 10,
                  borderRadius: 12, backgroundColor: colors.inputBackground, color: colors.text, fontSize: 15,
                }}
              />
            )}

            {/* 第2行：按钮栏 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
              <TouchableOpacity
                onPress={() => setSearchEnabled(!searchEnabled)}
                style={{ width: 28, height: 28, justifyContent: 'center', alignItems: 'center' }}
              >
                <Image
                  source={searchEnabled ? getSearchEngineIcon(searchEngine, theme.dark) : require('../assets/search/web_search_grey.png')}
                  style={{ width: 22, height: 22, opacity: searchEnabled ? 1 : 0.4 }}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              {!isStreaming && (
                <TouchableOpacity
                  onPress={() => setShowAttachMenu(!showAttachMenu)}
                  style={{ width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Icon name={showAttachMenu ? 'close-circle-outline' : 'plus-circle-outline'} size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={isStreaming ? handleStop : (inputText.trim() || pendingMedia ? () => handleSend() : () => setIsVoiceMode(!isVoiceMode))}
                style={{
                  marginLeft: 4, width: 44, height: 44, borderRadius: 22,
                  backgroundColor: isStreaming ? colors.error : (isVoiceMode ? colors.primary : (inputText.trim() || pendingMedia ? colors.primary : colors.disabled)),
                  justifyContent: 'center', alignItems: 'center',
                }}
              >
                {isStreaming ? (
                  <Icon name="stop" size={20} color="#FFF" />
                ) : isVoiceMode ? (
                  <Icon name="microphone" size={22} color="#FFF" />
                ) : (inputText.trim() || pendingMedia) ? (
                  <Icon name="send" size={20} color="#FFF" />
                ) : (
                  <Icon name="microphone" size={22} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>

            {/* 第3行：附件菜单 */}
            {showAttachMenu && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <TouchableOpacity onPress={handleTakePhoto} style={{ alignItems: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 20 }}>📷</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>{t.chat.attachPhoto}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePickFromGallery} style={{ alignItems: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 20 }}>🖼️</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>{t.chat.attachAlbum}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePickFile} style={{ alignItems: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 20 }}>📁</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>{t.chat.attachFile}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      <CompletionParamsModal visible={showCompletionParams} onClose={() => setShowCompletionParams(false)} onSave={setCompletionParams} />

      {actionMenuMsg !== null && (
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => { setActionMenuMsg(null); setSelectableMsgId(null) }}>
          <View style={{
            position: 'absolute',
            top: Math.min(menuPos.y, Dimensions.get('window').height - (actionMenuMsg?.role === 'user' ? 220 : 80) - 16),
            left: Math.min(menuPos.x, Dimensions.get('window').width - 180),
            backgroundColor: colors.surface,
            borderRadius: 12,
            paddingVertical: 4,
            minWidth: 160,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
          }}>
            {actionMenuMsg?.role === 'user' ? (
              <>
                <FloatingMenuItem icon="📋" label={t.common.copy} onPress={() => { copyToClipboard(actionMenuMsg!.content); setActionMenuMsg(null) }} />
                <FloatingMenuItem icon="✏️" label={t.chat.selectText} onPress={() => {
                  setSelectableMsgId(actionMenuMsg!.id)
                  setActionMenuMsg(null)
                }} />
                <FloatingMenuItem icon="✏️" label={t.chat.editMessage} onPress={() => startEdit(actionMenuMsg!)} />
                <FloatingMenuItem icon="🗑️" label={t.chat.deleteMessage} destructive onPress={() => { deleteMessage(actionMenuMsg!.id); setActionMenuMsg(null) }} />
              </>
            ) : (
              <>
                <FloatingMenuItem icon="🗑️" label={t.chat.deleteMessage} destructive onPress={() => { deleteMessage(actionMenuMsg!.id); setActionMenuMsg(null) }} />
              </>
            )}
          </View>
        </Pressable>
      )}

      <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowHistory(false)} />
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '75%', backgroundColor: colors.surface, paddingTop: insets.top + 60 }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{t.chat.history}</Text>
            </View>
            <FlatList
              data={conversations}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
                  onPress={() => handleLoadConversation(item)}
                  onLongPress={() => {
                    Alert.alert(t.chat.deleteConvTitle, t.chat.deleteConvMsg.replace('{title}', item.title), [
                      { text: t.common.cancel, style: 'cancel' },
                      { text: t.common.delete, style: 'destructive', onPress: () => handleDeleteConversation(item.id) },
                    ])
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                    {t.chat.messages.replace('{count}', String(item.messages.length))} · {new Date(item.timestamp).toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', padding: 32 }}>{t.chat.noConversations}</Text>
              }
            />
          </View>
        </View>
      </Modal>


      {/* 隐藏 WebView 用于 Google/Bing/Baidu/Tavily 搜索 */}
      {activeSearchQuery !== '' && searchEngine !== 'tavily' && searchEngine !== 'metaso' && (
        <SearchWebView
          query={activeSearchQuery}
          engine={searchEngine}
          onResults={(results) => {
            searchResolveRef.current?.(results)
            searchResolveRef.current = null
          }}
          onError={(err) => {
            searchRejectRef.current?.(err)
            searchRejectRef.current = null
          }}
          onReady={() => {}}
        />
      )}

      {/* 秘塔搜索弹窗 */}
      <SearchResultModal
        visible={showMetasoModal}
        query={pendingQueryRef.current}
        onUseResults={handleMetasoResults}
        onClose={() => setShowMetasoModal(false)}
      />
    </SafeAreaView>
  )
}

function FloatingMenuItem({ icon, label, destructive, onPress }: { icon: string; label: string; destructive?: boolean; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}
    >
      <Text style={{ fontSize: 14, marginRight: 10 }}>{icon}</Text>
      <Text style={{ fontSize: 15, color: destructive ? theme.colors.error : theme.colors.text }}>{label}</Text>
    </TouchableOpacity>
  )
}
