import React, { useEffect, useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { pick, keepLocalCopy } from '@react-native-documents/picker'
import Icon from '@react-native-vector-icons/material-design-icons'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import { createThemedStyles } from '../styles/commonStyles'
import { readWavFile } from '../utils/audioUtils'
import { getSelectedTTSVoice } from '../utils/ttsVoice'
import type { TTSCustomVoice, TTSParams } from '../utils/storage'
import type { TTSCapabilities } from '../../modules/llama.rn/src'

interface TTSVoiceSectionProps {
  /** The loaded model's capabilities (null before a model + codec is ready). */
  caps: TTSCapabilities | null
  params: TTSParams
  updateParam: (key: keyof TTSParams, value: any) => void
}

const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}`

const baseName = (path: string) => path.split('/').pop() || path

/**
 * The voice controls of the TTS parameters modal.
 *
 * Voices are baked into the codec GGUF (the native side lists them through
 * `getTTSCapabilities().builtinVoices`) — a name that is not in that list
 * makes the native side fail with `no voice '<name>'`. The dropdown is
 * therefore the authoritative source; the manual field only exists for codecs
 * that do not report their voices.
 */
export function TTSVoiceSection({
  caps,
  params,
  updateParam,
}: TTSVoiceSectionProps) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const themedStyles = createThemedStyles(theme.colors)
  const styles = createStyles(theme)

  const { value: selected, custom: selectedCustom } = getSelectedTTSVoice(params)
  const builtinVoices = caps?.builtinVoices ?? []
  const customVoices = params.customVoices ?? []

  const [listOpen, setListOpen] = useState(false)
  const [manualText, setManualText] = useState('')
  const [refAudioPath, setRefAudioPath] = useState<string | null>(null)
  const [refText, setRefText] = useState('')
  const [busy, setBusy] = useState(false)

  // Keep the manual field in sync with the dropdown selection (a custom voice
  // shows its display name; the stored value stays its id).
  useEffect(() => {
    if (selectedCustom) setManualText(selectedCustom.name)
    else setManualText(selected)
  }, [selected, selectedCustom])

  const selectVoice = (next: string | null) => {
    updateParam('speakerConfig', next)
    setListOpen(false)
  }

  const handleManualChange = (text: string) => {
    setManualText(text)
    updateParam('speakerConfig', text.trim() ? text.trim() : null)
  }

  const addCustomVoice = (voice: TTSCustomVoice) => {
    updateParam('customVoices', [
      ...customVoices.filter(v => v.id !== voice.id),
      voice,
    ])
    updateParam('speakerConfig', voice.id)
    setManualText(voice.name)
  }

  const handleDeleteCustomVoice = (voice: TTSCustomVoice) => {
    Alert.alert(t.params.voiceDelete, voice.name, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () => {
          updateParam(
            'customVoices',
            customVoices.filter(v => v.id !== voice.id),
          )
          if (selected === voice.id) updateParam('speakerConfig', null)
        },
      },
    ])
  }

  const handlePickRefAudio = async () => {
    try {
      const [file] = await pick({ type: ['audio/x-wav', 'audio/wav', '*/*'] })
      if (!file?.uri || !file?.name) return
      if (!file.name.toLowerCase().endsWith('.wav')) {
        Alert.alert(t.params.voiceWavOnly, t.params.voiceWavOnlyDesc)
        return
      }
      const [local] = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: file.name }],
        destination: 'documentDirectory',
      })
      if (local.status !== 'success') throw new Error(local.copyError)
      setRefAudioPath(local.localUri.replace(/^file:\/\//, ''))
    } catch (e: any) {
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') {
        Alert.alert(t.common.error, e?.message ?? String(e))
      }
    }
  }

  const handleCreateClone = async () => {
    if (!refAudioPath) return
    setBusy(true)
    try {
      // Decoding here validates the clip; the speaker itself is created at
      // synthesis time, when the model's context is available.
      const { pcm, sampleRate } = await readWavFile(refAudioPath)
      if (pcm.length === 0) throw new Error(t.params.voiceEmptyAudio)
      const seconds = pcm.length / (sampleRate || 24000)
      if (seconds < 0.5) throw new Error(t.params.voiceTooShort)
      addCustomVoice({
        id: newId('voice'),
        name: baseName(refAudioPath),
        kind: 'audio',
        audioPath: refAudioPath,
        refText: refText.trim() || undefined,
      })
      setRefAudioPath(null)
      setRefText('')
    } catch (e: any) {
      Alert.alert(t.params.voiceCloneFailed, e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const handlePickSpeakerFile = async () => {
    try {
      const [file] = await pick({ type: ['*/*'] })
      if (!file?.uri || !file?.name) return
      if (!file.name.toLowerCase().endsWith('.gguf')) {
        Alert.alert(t.params.voiceGgufOnly, t.params.voiceGgufOnlyDesc)
        return
      }
      const [local] = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: file.name }],
        destination: 'documentDirectory',
      })
      if (local.status !== 'success') throw new Error(local.copyError)
      const filePath = local.localUri.replace(/^file:\/\//, '')
      addCustomVoice({
        id: newId('speaker'),
        name: file.name,
        kind: 'file',
        filePath,
      })
    } catch (e: any) {
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') {
        Alert.alert(t.common.error, e?.message ?? String(e))
      }
    }
  }

  const currentLabel = selectedCustom
    ? `${selectedCustom.kind === 'file' ? '📄' : '🎤'} ${selectedCustom.name}`
    : selected || t.params.voiceDefault

  const needsVoiceWarning = !!caps?.needsVoice && !selected
  const noBuiltinHint = caps != null && builtinVoices.length === 0
  // Cloning needs the model to take reference audio; before a model is loaded
  // we cannot know, so the controls stay available.
  const cloneUnsupported = caps != null && !caps.canSpeakerFromAudio

  return (
    <>
      <View style={themedStyles.paramGroup}>
        <Text style={themedStyles.paramLabel}>{t.params.voiceSection}</Text>
        <Text style={themedStyles.paramDescription}>
          {t.params.voiceSectionDesc}
        </Text>

        <TouchableOpacity
          style={styles.selector}
          onPress={() => setListOpen(open => !open)}
        >
          <Text style={styles.selectorText} numberOfLines={1}>
            {currentLabel}
          </Text>
          <Icon
            name={listOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>

        {listOpen && (
          <View style={styles.list}>
            <ScrollView
              style={styles.listScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                style={styles.row}
                onPress={() => selectVoice(null)}
              >
                <Text style={styles.rowText}>{t.params.voiceDefault}</Text>
                {!selected && <Icon name="check" size={18} color={theme.colors.primary} />}
              </TouchableOpacity>

              {builtinVoices.map(voice => {
                const active = !selectedCustom && selected === voice.name
                return (
                  <TouchableOpacity
                    key={`builtin-${voice.name}`}
                    style={styles.row}
                    onPress={() => selectVoice(voice.name)}
                  >
                    <View style={styles.rowBody}>
                      <Text style={styles.rowText} numberOfLines={1}>
                        {voice.isDefault
                          ? `${voice.name} (${t.params.voiceIsDefault})`
                          : voice.name}
                      </Text>
                      {!!voice.refText && (
                        <Text style={styles.rowSubText} numberOfLines={1}>
                          {voice.refText}
                        </Text>
                      )}
                    </View>
                    {active && (
                      <Icon name="check" size={18} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                )
              })}

              {customVoices.length > 0 && (
                <Text style={styles.listGroupLabel}>
                  {t.params.voiceCustomSection}
                </Text>
              )}
              {customVoices.map(voice => {
                const active = selectedCustom?.id === voice.id
                return (
                  <TouchableOpacity
                    key={voice.id}
                    style={styles.row}
                    onPress={() => selectVoice(voice.id)}
                  >
                    <Text style={styles.rowText} numberOfLines={1}>
                      {`${voice.kind === 'file' ? '📄' : '🎤'} ${voice.name}`}
                    </Text>
                    {active && (
                      <Icon name="check" size={18} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        )}

        {caps == null && (
          <Text style={styles.hint}>{t.params.voiceNeedModel}</Text>
        )}
        {noBuiltinHint && (
          <Text style={styles.hint}>{t.params.voiceNoBuiltin}</Text>
        )}
        {needsVoiceWarning && (
          <Text style={styles.warning}>{t.params.voiceNeedsVoice}</Text>
        )}

        <Text style={[themedStyles.paramLabel, styles.subLabel]}>
          {t.params.voiceManual}
        </Text>
        <TextInput
          style={themedStyles.textInput}
          value={manualText}
          onChangeText={handleManualChange}
          placeholder={t.params.voiceNamePlaceholder}
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>{t.params.voiceManualDesc}</Text>
      </View>

      <View style={themedStyles.paramGroup}>
        <Text style={themedStyles.paramLabel}>
          {t.params.voiceCustomSection}
        </Text>
        <Text style={themedStyles.paramDescription}>
          {t.params.voiceCustomDesc}
        </Text>

        {customVoices.map(voice => (
          <View key={voice.id} style={styles.customRow}>
            <Text style={styles.customName} numberOfLines={1}>
              {`${voice.kind === 'file' ? '📄' : '🎤'} ${voice.name}`}
            </Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteCustomVoice(voice)}
            >
              <Text style={styles.deleteButtonText}>{t.common.delete}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <Text style={styles.hint}>
          {refAudioPath
            ? t.params.voiceRefAudio.replace('{name}', baseName(refAudioPath))
            : t.params.voiceRefAudioNone}
        </Text>

        {cloneUnsupported && (
          <Text style={styles.warning}>{t.params.voiceCloneUnsupported}</Text>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.smallButton} onPress={handlePickRefAudio}>
            <Text style={styles.smallButtonText}>{t.params.voicePickWav}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.smallButton,
              styles.smallButtonPrimary,
              (!refAudioPath || busy || cloneUnsupported) && styles.smallButtonDisabled,
            ]}
            onPress={handleCreateClone}
            disabled={!refAudioPath || busy || cloneUnsupported}
          >
            <Text style={styles.smallButtonTextPrimary}>
              {busy ? t.params.voiceCloning : t.params.voiceCreateClone}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={handlePickSpeakerFile}
          >
            <Text style={styles.smallButtonText}>{t.params.voiceSpeakerFile}</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[themedStyles.textInput, styles.refTextInput]}
          value={refText}
          onChangeText={setRefText}
          placeholder={t.params.voiceRefTextPlaceholder}
          placeholderTextColor={theme.colors.textSecondary}
          multiline
        />
      </View>

      {!!caps?.canTakeInstruct && (
        <View style={themedStyles.paramGroup}>
          <Text style={themedStyles.paramLabel}>{t.params.voiceInstruct}</Text>
          <Text style={themedStyles.paramDescription}>
            {t.params.voiceInstructDesc}
          </Text>
          <TextInput
            style={themedStyles.textInput}
            value={params.instruct ?? ''}
            onChangeText={text => updateParam('instruct', text || null)}
            placeholder={t.params.voiceInstructPlaceholder}
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}
    </>
  )
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    selector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    selectorText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
    },
    list: {
      marginTop: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    listScroll: { maxHeight: 240 },
    listGroupLabel: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 4,
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    rowBody: { flex: 1 },
    rowText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    rowSubText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    hint: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textSecondary,
      marginTop: 6,
    },
    warning: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.error,
      marginTop: 6,
    },
    subLabel: { marginTop: 14 },
    customRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    customName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    deleteButton: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.colors.error,
    },
    deleteButtonText: { fontSize: 12, fontWeight: '600', color: theme.colors.error },
    buttonRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    smallButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    smallButtonPrimary: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    smallButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    smallButtonTextPrimary: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.white,
    },
    smallButtonDisabled: { opacity: 0.4 },
    refTextInput: { minHeight: 60, marginTop: 10, textAlignVertical: 'top' },
  })

export default TTSVoiceSection
