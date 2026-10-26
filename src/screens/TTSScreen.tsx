import React, { useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { saveDocuments } from '@react-native-documents/picker'
import ReactNativeBlobUtil from 'react-native-blob-util'
import ContextParamsModal from '../components/ContextParamsModal'
import CompletionParamsModal from '../components/CompletionParamsModal'
import TTSParamsModal from '../components/TTSParamsModal'
import { AudioPlayer } from '../components/AudioPlayer'
import { MaskedProgress } from '../components/MaskedProgress'
import Icon from '@react-native-vector-icons/material-design-icons'
import { createThemedStyles } from '../styles/commonStyles'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import type {
  ContextParams,
  CompletionParams,
  TTSParams,
} from '../utils/storage'
import {
  loadContextParams,
  loadCompletionParams,
  type CustomModel,
} from '../utils/storage'
import { createWavFile } from '../utils/audioUtils'
import { initLlama } from '../../modules/llama.rn/src' // import 'llama.rn'
import {
  useStoredCompletionParams,
  useStoredContextParams,
  useStoredTTSParams,
  useStoredCustomModels,
} from '../hooks/useStoredSetting'
import { useExampleContext } from '../hooks/useExampleContext'
import { useExampleScreenHeader } from '../hooks/useExampleScreenHeader'

export default function TTSScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const themedStyles = createThemedStyles(theme.colors)
  const styles = createStyles(theme, themedStyles)
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVocoderReady, setIsVocoderReady] = useState(false)
  const [vocoderHintText, setVocoderHintText] = useState('检测中…')
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null)
  const [audioData, setAudioData] = useState<Float32Array | null>(null)
  const [sampleRate, setSampleRate] = useState<number>(24000)
  const [showContextParamsModal, setShowContextParamsModal] = useState(false)
  const [showCompletionParamsModal, setShowCompletionParamsModal] =
    useState(false)
  const [showTTSParamsModal, setShowTTSParamsModal] = useState(false)
  const {
    context,
    initProgress,
    isModelReady,
    replaceContext,
    setInitProgress,
  } = useExampleContext()
  const { value: contextParams, setValue: setContextParams } =
    useStoredContextParams()
  const { value: completionParams, setValue: setCompletionParams } =
    useStoredCompletionParams()
  const { value: ttsParams, setValue: setTtsParams } = useStoredTTSParams()
  const { value: customModels, reload: reloadCustomModels } =
    useStoredCustomModels()
  const availableModels = useMemo(() =>
    (customModels || []).filter(m => {
      const p = m.localPath || ''
      return p.includes('/tts/')
    }),
  [customModels])

  const handleSaveContextParams = (params: ContextParams) => {
    setContextParams(params)
  }

  const handleSaveCompletionParams = (params: CompletionParams) => {
    setCompletionParams(params)
  }

  const handleSaveTTSParams = (params: TTSParams) => {
    setTtsParams(params)
  }

  const saveAudioAsWav = async () => {
    if (!audioData || audioData.length === 0) {
      Alert.alert(t.examples.error, t.examples.noAudioData)
      return
    }

    try {
      console.log('Starting WAV file creation...')

      // Create WAV file from audio data
      const wavBuffer = createWavFile(audioData, sampleRate || 24000, 16)
      console.log('WAV buffer created, size:', wavBuffer.byteLength)

      // Convert to base64 for proper binary file handling
      const uint8Array = new Uint8Array(wavBuffer)
      // Convert Uint8Array to string for base64 encoding
      const binaryString = String.fromCharCode.apply(
        null,
        Array.from(uint8Array),
      )
      const base64Data = ReactNativeBlobUtil.base64.encode(binaryString)
      console.log('Base64 data length:', base64Data.length)

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[.:]/g, '-')
      const filename = `generated-speech-${timestamp}.wav`

      // Create temporary file path in a more accessible location
      const tempFilePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`

      // Write the WAV file as base64 binary data
      await ReactNativeBlobUtil.fs.writeFile(tempFilePath, base64Data, 'base64')

      // Save using documents picker with proper file URI
      await saveDocuments({
        sourceUris: [`file://${tempFilePath}`],
        fileName: filename,
        mimeType: 'audio/wav',
        copy: false,
      })

      // Clean up temp file
      try {
        await ReactNativeBlobUtil.fs.unlink(tempFilePath)
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError)
      }

      Alert.alert(t.examples.success, `Audio saved as ${filename}`)
    } catch (error: any) {
      console.error('Error saving audio:', error)

      // Provide more detailed error information
      if (error.message?.includes('User cancelled')) {
        // User cancelled the save dialog, don't show error
        return
      }

      Alert.alert(
        t.examples.error,
        `Failed to save audio: ${
          error.message || 'Unknown error'
        }\n\nPlease check the console for more details.`,
      )
    }
  }

  useExampleScreenHeader({
    navigation,
    isModelReady,
    readyActions: [
      {
        key: 'tts-settings',
        iconName: 'speaker',
        onPress: () => setShowTTSParamsModal(true),
      },
      {
        key: 'completion-settings',
        iconName: 'cog-outline',
        onPress: () => setShowCompletionParamsModal(true),
      },
    ],
    setupActions: [
      {
        key: 'context-settings',
        iconName: 'cog-outline',
        onPress: () => setShowContextParamsModal(true),
      },
    ],
  })

  // Resolve the vocoder GGUF. Loading a model from the local list only hands us
  // the TTS path, so fall back to an explicit association and then to scanning
  // the model directories for a WavTokenizer / vocoder GGUF.
  const resolveVocoderPath = async (explicit?: string) => {
    if (explicit) {
      console.log('[TTS] vocoder from model association:', explicit)
      return explicit
    }
    const base = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/LLMs`
    const dirs = [`${base}/wavtokenizer`, `${base}/tts`]
    for (const dir of dirs) {
      try {
        const exists = await ReactNativeBlobUtil.fs.exists(dir)
        if (!exists) {
          console.log('[TTS] vocoder dir missing:', dir)
          continue
        }
        const files: string[] = await ReactNativeBlobUtil.fs.ls(dir)
        console.log('[TTS] scanning', dir, '->', JSON.stringify(files))
        const ggufs = files.filter((f: string) =>
          f.toLowerCase().endsWith('.gguf'),
        )
        // Rank candidates so the codec.cpp export wins over the legacy
        // ggml-org/WavTokenizer file, which the 0.13+ backend cannot load.
        const rank = (f: string) => {
          const n = f.toLowerCase()
          if (/speech-75tokens|wavtokenizer-large-speech/.test(n)) return 0
          if (/(codec|dac|soprano|vocoder)/.test(n)) return 1
          if (/wavtokenizer-large-75-q5_1/.test(n)) return 8 // legacy, unusable
          if (n.endsWith('.gguf')) return 2
          return 9
        }
        const ranked = ggufs
          .filter((f: string) => rank(f) < 8)
          .sort((a: string, b: string) => rank(a) - rank(b))
        const chosen = ranked[0]
        if (chosen) {
          console.log('[TTS] vocoder resolved:', `${dir}/${chosen}`)
          return `${dir}/${chosen}`
        }
        if (ggufs.length > 0) {
          console.log(
            '[TTS] only legacy vocoder files found in',
            dir,
            '- they are not loadable by codec.cpp:',
            JSON.stringify(ggufs),
          )
        }
      } catch (e) {
        console.log('[TTS] scan failed for', dir, e)
      }
    }
    console.log('[TTS] no vocoder model found')
    return undefined
  }

  // Show which vocoder will be used, so a missing file is visible before
  // the user tries to generate speech.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const found = await resolveVocoderPath()
      if (cancelled) return
      setVocoderHintText(
        found ? found.split('/').pop() || found : '未找到（请在模型页导入声码器）',
      )
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initializeModels = async (ttsPath: string, vocoderPath?: string) => {
    const resolvedVocoderPath = await resolveVocoderPath(vocoderPath)
    if (!resolvedVocoderPath) {
      Alert.alert(
        t.examples.vocoderFailed,
        'No compatible vocoder found. Download the codec.cpp vocoder from the Models tab (Vocoder category):\n' +
          'BricksDisplay/codec.cpp-gguf → wavtokenizer-large-speech-75tokens.gguf\n\n' +
          'The legacy WavTokenizer-Large-75-Q5_1.gguf from ggml-org/WavTokenizer is not supported by llama.rn 0.13+.',
      )
      return
    }
    try {
      setIsLoading(true)
      setInitProgress(0)

      const params = contextParams || (await loadContextParams())
      // Initialize the TTS model
      const llamaContext = await initLlama(
        {
          model: ttsPath,
          ...params,
        },
        (progress) => {
          // Progress is reported as 1 to 100
          setInitProgress(progress)
        },
      )

      await replaceContext(llamaContext)

      // Initialize vocoder directly after TTS model.
      // initVocoder reports failure by returning false (native errors are
      // swallowed), so the result must be checked — otherwise the UI shows
      // "ready" while generation throws "Vocoder is not enabled".
      let vocoderOk = false
      try {
        // Let the codec follow the context's backend selection (n_gpu_layers /
        // devices from the settings), so GPU/NPU acceleration applies here too.
        vocoderOk = await llamaContext.initVocoder({
          path: resolvedVocoderPath,
          n_batch: 256,
        })
        if (!vocoderOk) {
          // Some backends cannot host the codec graphs; retry on the CPU so a
          // GPU/NPU selection never blocks synthesis entirely.
          console.log('[TTS] vocoder on selected backend failed, retrying on CPU')
          vocoderOk = await llamaContext.initVocoder({
            path: resolvedVocoderPath,
            n_batch: 256,
            use_gpu: false,
          })
        }
        if (!vocoderOk) {
          vocoderOk = await llamaContext.isVocoderEnabled()
        }
      } catch (vocoderError) {
        console.log('Vocoder initialization error:', vocoderError)
        vocoderOk = false
      }
      setIsVocoderReady(vocoderOk)
      console.log('[TTS] initVocoder result:', vocoderOk, resolvedVocoderPath)
      if (!vocoderOk) {
        setVocoderHintText(
          `${resolvedVocoderPath.split('/').pop()} (加载失败：格式可能不兼容)`,
        )
        Alert.alert(
          t.examples.vocoderFailed,
          `无法加载声码器：\n${resolvedVocoderPath.split('/').pop()}\n\n` +
            'llama.rn 0.13+ 使用 codec.cpp 作为声码器后端，旧的 ggml-org/WavTokenizer ' +
            '导出格式已不再支持。请在「模型 → 声码器」重新下载 codec.cpp 版本：\n' +
            'BricksDisplay/codec.cpp-gguf → wavtokenizer-large-speech-75tokens.gguf',
        )
      }
    } catch (error: any) {
      Alert.alert(t.examples.error, `Failed to initialize models: ${error.message}`)
    } finally {
      setIsLoading(false)
      setInitProgress(0)
    }
  }

  const generateSpeech = async () => {
    if (!inputText.trim() || !context || isLoading) return
    if (!isVocoderReady) {
      Alert.alert(
        t.examples.vocoderFailed,
        'The vocoder is not loaded, so audio tokens cannot be decoded into speech. Pick the vocoder file together with the TTS model before generating.',
      )
      return
    }

    try {
      setIsLoading(true)

      const text = inputText.trim()
      // Build formatted audio completion using the OuteTTS-compatible API.
      // `speakerConfig` (when present) is a raw OuteTTS speaker JSON payload.
      const { prompt: formattedPrompt, grammar, embedding } =
        await context.getFormattedAudioCompletion({
          prompt: text,
          ...(ttsParams?.speakerConfig
            ? { speaker: ttsParams.speakerConfig }
            : {}),
        })

      const collectedTokens: number[] = []
      const params = completionParams || (await loadCompletionParams())

      const result = await context.completion(
        {
          prompt: formattedPrompt,
          grammar,
          embedding,
          n_predict: params.n_predict || 4096,
          temperature: params.temperature || 0.7,
          top_p: params.top_p || 0.9,
          stop: params.stop || ['<|im_end|>', '<|SPEECH_GENERATION_END|>'],
        },
        (data) => {
          // Collect tokens for potential audio processing
          if (data.token && typeof data.token === 'number') {
            collectedTokens.push(data.token)
          }
        },
      )

      // Check if we got audio tokens
      if (result.audio_tokens && result.audio_tokens.length > 0) {
        setGeneratedAudio(
          `Generated ${
            result.audio_tokens.length
          } audio tokens for: "${inputText.trim()}"`,
        )

        // If vocoder is available, decode audio tokens
        if (isVocoderReady && context.decodeAudioTokens) {
          try {
            const decodedAudio = await context.decodeAudioTokens(
              result.audio_tokens,
            )
            console.log('Generated audio data length:', decodedAudio.length)

            // Convert ArrayBuffer to Float32Array for AudioPlayer
            const audioFloat32 = new Float32Array(decodedAudio)
            setAudioData(audioFloat32)
            setSampleRate(24000) // OuteTTS default sample rate

            setGeneratedAudio(
              `Generated audio data (${
                audioFloat32.length
              } samples) for: "${inputText.trim()}"`,
            )
          } catch (decodeError) {
            console.log('Audio decoding error:', decodeError)
          }
        }

        Alert.alert(
          t.examples.speechGenerated,
          `Successfully generated ${result.audio_tokens.length} audio tokens! ${
            isVocoderReady
              ? t.examples.audioReady
              : t.examples.downloadVocoder
          }`,
        )
      } else {
        setGeneratedAudio(
          `Text processed: "${inputText.trim()}" (No audio tokens generated)`,
        )
        Alert.alert(
          t.examples.processingComplete,
          t.examples.noAudioTokens,
        )
      }
    } catch (error: any) {
      Alert.alert(t.examples.error, `Failed to generate speech: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isModelReady) {
    return (
      <>
        <ScrollView
          style={styles.setupScroll}
          contentContainerStyle={styles.setupContent}
        >
          <Text style={styles.setupDescription}>{t.examples.ttsDesc}</Text>

          <Text style={styles.sectionTitle}>
            {`已导入的 TTS 模型 (${availableModels.length})`}
          </Text>

          {availableModels.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyStateText}>
                还没有导入 TTS 模型。请到「模型 → 语音模型」分类下载或导入 OuteTTS GGUF，然后回到本页。
              </Text>
              <TouchableOpacity
                style={styles.emptyAction}
                onPress={() =>
                  navigation.navigate('MainTabs', { screen: 'ModelTab' })
                }
              >
                <Text style={styles.emptyActionText}>前往模型页 →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            availableModels.map(model => (
              <View key={model.id} style={styles.localModelCard}>
                <Icon
                  name="bullseye-arrow"
                  size={18}
                  color={theme.colors.primary}
                />
                <Text style={styles.localModelName} numberOfLines={1}>
                  {model.id}
                </Text>
                <TouchableOpacity
                  style={styles.loadButton}
                  onPress={() =>
                    initializeModels(
                      (model.localPath || '').replace(/^file:\/\//, ''),
                      (model as any).vocoderLocalPath || undefined,
                    )
                  }
                  disabled={isLoading}
                >
                  <Text style={styles.loadButtonText}>加载</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <Text style={styles.vocoderHint}>
            {`声码器：${vocoderHintText}`}
          </Text>
        </ScrollView>

        <ContextParamsModal
          visible={showContextParamsModal}
          onClose={() => setShowContextParamsModal(false)}
          onSave={handleSaveContextParams}
        />

        <TTSParamsModal
          visible={showTTSParamsModal}
          onClose={() => setShowTTSParamsModal(false)}
          onSave={handleSaveTTSParams}
        />

        <MaskedProgress
          visible={isLoading}
          text={
            context
              ? t.examples.initializingVocoder
              : t.examples.initializing.replace(
                  '{progress}',
                  String(initProgress),
                )
          }
          progress={initProgress}
          showProgressBar={!context && initProgress > 0}
        />
      </>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>{t.examples.enterTextToSpeak}</Text>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t.examples.enterText}
            multiline
            textAlignVertical="top"
            maxLength={500}
            keyboardType="ascii-capable"
          />
          <Text style={styles.characterCount}>
            {inputText.length}
            /500
          </Text>
        </View>

        <View style={styles.controlSection}>
          <TouchableOpacity
            style={[
              styles.generateButton,
              (!inputText.trim() || isLoading) && styles.generateButtonDisabled,
            ]}
            onPress={generateSpeech}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.generateButtonText}>{t.examples.generateSpeech}</Text>
            )}
          </TouchableOpacity>
        </View>

        {generatedAudio && (
          <View style={styles.audioSection}>
            <Text style={styles.sectionTitle}>{t.examples.generatedAudio}</Text>
            <View style={styles.audioCard}>
              <Text style={styles.audioDescription}>{generatedAudio}</Text>

              {audioData && audioData.length > 0 ? (
                <>
                  <AudioPlayer audio={audioData} sr={sampleRate} />
                  <TouchableOpacity
                    style={[
                      styles.generateButton,
                      { marginTop: 12, backgroundColor: theme.colors.valid },
                    ]}
                    onPress={saveAudioAsWav}
                  >
                    <Text style={styles.generateButtonText}>{t.examples.saveAsWav}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.infoText}>
                  {isVocoderReady
                    ? t.examples.audioReady
                    : t.examples.downloadVocoder}
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>{t.examples.aboutOuteTTS}</Text>
          <Text style={styles.infoText}>
            {t.examples.ttsAboutDesc}
          </Text>

          <Text style={styles.infoTitle}>{t.examples.speakerConfig}</Text>
          <Text style={styles.infoText}>
            {t.examples.speakerConfigDesc}
          </Text>

          <Text style={styles.infoTitle}>{t.examples.tipsForResults}</Text>
          <Text style={styles.infoText}>
            {t.examples.tipsList}
          </Text>
        </View>
      </ScrollView>

      <ContextParamsModal
        visible={showContextParamsModal}
        onClose={() => setShowContextParamsModal(false)}
        onSave={handleSaveContextParams}
      />

      <CompletionParamsModal
        visible={showCompletionParamsModal}
        onClose={() => setShowCompletionParamsModal(false)}
        onSave={handleSaveCompletionParams}
      />

      <TTSParamsModal
        visible={showTTSParamsModal}
        onClose={() => setShowTTSParamsModal(false)}
        onSave={handleSaveTTSParams}
      />
    </View>
  )
}

function createStyles(
  theme: ReturnType<typeof useTheme>['theme'],
  themedStyles: ReturnType<typeof createThemedStyles>,
) {
  return StyleSheet.create({
    container: themedStyles.container,
    setupContainer: themedStyles.setupContainer,
    scrollContent: themedStyles.scrollContent,
    setupDescription: themedStyles.setupDescription,
    loadingContainer: themedStyles.loadingContainer,
    loadingText: themedStyles.loadingText,
    header: {
      ...themedStyles.header,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    textInput: {
      ...themedStyles.textInput,
      height: 120,
      textAlignVertical: 'top',
    },
    button: themedStyles.primaryButton,
    buttonText: themedStyles.primaryButtonText,
    disabledButton: themedStyles.primaryButtonDisabled,
    generateButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    generateButtonText: {
      color: theme.colors.white,
      fontSize: 18,
      fontWeight: '600',
    },
    audioCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    audioDescription: {
      fontSize: 16,
      color: theme.colors.text,
      marginBottom: 16,
      fontStyle: 'italic',
    },
    infoSection: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 8,
      marginTop: 16,
    },
    infoText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    content: {
      flex: 1,
      padding: 16,
    },
    inputSection: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 12,
    },
    characterCount: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textAlign: 'right',
      marginTop: 4,
    },
    controlSection: {
      marginBottom: 24,
    },
    generateButtonDisabled: {
      backgroundColor: theme.colors.disabled,
    },
    setupScroll: { flex: 1 },
    setupContent: { padding: 16, paddingBottom: 32 },
    emptyCard: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    emptyStateText: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textSecondary,
    },
    emptyAction: {
      marginTop: 10,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
    },
    emptyActionText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FFF',
    },
    localModelCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    localModelName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    loadButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
    },
    loadButtonText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
    vocoderHint: {
      marginTop: 8,
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary,
    },
    audioSection: {
      marginBottom: 24,
    },
  })
}
