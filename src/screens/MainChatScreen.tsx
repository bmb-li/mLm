import React, { useState, useRef, useCallback, useEffect } from 'react'
import { View, FlatList, TextInput, TouchableOpacity, Text, KeyboardAvoidingView, Platform, Keyboard, Alert, Modal, StyleSheet, Pressable, Dimensions } from 'react-native'
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

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
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

  const { context, isModelReady, activeModelName } = useModelContext()
  const { value: completionParams, setValue: setCompletionParams } = useStoredCompletionParams()

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

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isStreaming) return

    if (!context) {
      Alert.alert(t.chat.noModelTitle, t.chat.noModelMessage)
      return
    }

    const userMsg: ChatMessage = { id: `user_${Date.now()}`, role: 'user', content: text }
    const assistantId = `assistant_${Date.now()}`
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInputText('')
    Keyboard.dismiss()
    setIsStreaming(true)
    autoExpandedRef.current = false

    try {
      const allMessages = [
        { role: 'system' as const, content: DEFAULT_SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: text },
      ]

      const params = completionParams || {}
      const { promise, stop } = await context.parallel.completion(
        { ...params, messages: allMessages, reasoning_format: 'auto' },
        (_reqId: number, data: any) => {
          const reasoningContent = data.reasoning_content || ''
          let content = data.content || data.accumulated_text || ''
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
  }, [inputText, isStreaming, context, messages, completionParams])

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
        ...msgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ]

      const params = completionParams || {}
      const { promise, stop } = await context.parallel.completion(
        { ...params, messages: allMessages, reasoning_format: 'auto' },
        (_reqId: number, data: any) => {
          const reasoningContent = data.reasoning_content || ''
          let content = data.content || data.accumulated_text || ''
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
          backgroundColor: isUser ? colors.primary : '#000000',
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
          <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ color: isUser ? '#FFF' : colors.text, fontSize: 15, lineHeight: 20 }} selectable={selectableMsgId === item.id}>
              {item.content || (isStreaming && !isUser ? '...' : '')}
            </Text>
          </View>
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
          <View style={{
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
            borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
          }}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder={isModelReady ? t.chat.typeMessage : t.chat.noModelSelected}
              placeholderTextColor={colors.textSecondary}
              multiline
              style={{
                flex: 1, maxHeight: 100, paddingHorizontal: 14, paddingVertical: 10,
                borderRadius: 20, backgroundColor: colors.inputBackground, color: colors.text, fontSize: 15,
              }}
            />
            <TouchableOpacity
              onPress={isStreaming ? handleStop : handleSend}
              disabled={isStreaming ? false : !inputText.trim() || !isModelReady || isReadOnly}
              style={{
                marginLeft: 8, width: 44, height: 44, borderRadius: 22,
                backgroundColor: isStreaming ? colors.error : (inputText.trim() && isModelReady && !isReadOnly ? colors.primary : colors.disabled),
                justifyContent: 'center', alignItems: 'center',
              }}
            >
              <Text style={{ color: '#FFF', fontSize: isStreaming ? 20 : 18 }}>
                {isStreaming ? '■' : '➤'}
              </Text>
            </TouchableOpacity>
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
