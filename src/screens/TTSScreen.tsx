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
import { Waveform } from '../components/Waveform'
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
import type { TTSCapabilities } from '../../modules/llama.rn/src'
import { resolveTTSVoice, hasEnglishWords } from '../utils/ttsVoice'
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
  const [ttsCaps, setTtsCaps] = useState<TTSCapabilities | null>(null)
  const [liveTokens, setLiveTokens] = useState(0)
  const [liveStartedAt, setLiveStartedAt] = useState<number | null>(null)
  const [genStats, setGenStats] = useState<{
    genSec: number
    audioSec: number | null
    tokens: number
    label: string
  } | null>(null)
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

  // OuteTTS 0.2 / 0.3 only speak English (their frontend keeps a-z words).
  const englishOnlyModel =
    ttsCaps?.promptKind === 'outetts_v0_3' ||
    ttsCaps?.promptKind === 'outetts_legacy'

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
        key: 'tts-settings',
        iconName: 'speaker',
        onPress: () => setShowTTSParamsModal(true),
      },
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
          // rc.10 ships tokenizer-matched codec GGUFs named codec-*.gguf
          if (/^codec[-_].*\.gguf$/.test(n)) return 0
          if (/(codec|dac|soprano|vocoder)/.test(n)) return 1
          if (/speech-75tokens|wavtokenizer-large-speech/.test(n)) return 2
          if (/wavtokenizer-large-75-q5_1/.test(n)) return 8 // legacy, unusable
          if (n.endsWith('.gguf')) return 3
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
        // Init the codec first: getTTSCapabilities() only reports the codec's
        // family / builtin voices once a vocoder is attached, so it must not be
        // read before this point.
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

        if (vocoderOk) {
          // Chatterbox T3 decodes a guidance pair (needs >= 2 parallel slots);
          // otherwise the guidance has to be turned off when loading the codec.
          const capsNow = await llamaContext
            .getTTSCapabilities()
            .catch(() => null as any)
          const isChatterboxT3 =
            capsNow?.family === 'chatterbox' &&
            capsNow?.promptKind === 'chatterbox'
          const nParallel = Number(params.n_parallel ?? 1)
          if (isChatterboxT3 && nParallel < 2) {
            console.log('[TTS] chatterbox guidance disabled (n_parallel < 2)')
            await llamaContext.releaseVocoder().catch(() => {})
            vocoderOk = await llamaContext.initVocoder({
              path: resolvedVocoderPath,
              n_batch: 256,
              kv_overrides: ['codec.lm.chatterbox.sampling.cfg_weight=float:0'],
            })
          }
          const capsFinal = await llamaContext
            .getTTSCapabilities()
            .catch(() => null as any)
          setTtsCaps(capsFinal ?? capsNow ?? null)
        }
      } catch (vocoderError) {
        console.log('Vocoder initialization error:', vocoderError)
        vocoderOk = false
      }
      setIsVocoderReady(vocoderOk)
      console.log('[TTS] initVocoder result:', vocoderOk, resolvedVocoderPath)

      if (vocoderOk) {
        try {
          const caps = await llamaContext.getTTSCapabilities()
          setTtsCaps(caps)
          const voiceNames = (caps.builtinVoices || []).map(v => v.name)
          console.log(
            '[TTS] family:',
            caps.family,
            '| needsVoice:',
            caps.needsVoice,
            '| voices:',
            JSON.stringify(voiceNames),
          )
          if (voiceNames.length > 0) {
            setVocoderHintText(
              `${resolvedVocoderPath.split('/').pop()} · 内置音色: ${voiceNames.join(', ')}`,
            )
          }
          const chosenVoice =
            typeof ttsParams?.speakerConfig === 'string'
              ? ttsParams.speakerConfig.trim()
              : ''
          if (caps.needsVoice && !chosenVoice) {
            Alert.alert(
              '需要音色',
              `${caps.family} 模型没有自带音色。请在「TTS 参数」里填写音色名称${
                voiceNames.length > 0
                  ? `（可选：${voiceNames.join(', ')}）`
                  : '（该模型需要参考音频克隆音色）'
              }。`,
            )
          }
        } catch (e) {
          console.log('[TTS] capabilities read failed:', e)
        }
      }
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
    // OuteTTS 0.2 / 0.3 are English word-level models: their frontend keeps
    // only a-z, so text without English letters fails natively with
    // "no words in the input text". Block it here with an actionable hint.
    if (englishOnlyModel && !hasEnglishWords(inputText)) {
      Alert.alert(t.params.voiceEnglishBlocked, t.params.voiceEnglishBlockedDesc)
      return
    }

    let speakerRelease: (() => Promise<void>) | null = null
    try {
      setIsLoading(true)
      setGenStats(null)
      setLiveTokens(0)
      setLiveStartedAt(Date.now())

      // Each synthesis starts at position 0: embedding-driven TTS prefills
      // cannot safely reuse the previous generation's KV entries.
      try {
        await context.clearCache(false)
      } catch (e) {
        console.log('[TTS] clearCache failed:', e)
      }

      const text = inputText.trim()
      // llama.rn 0.13.0-rc.10: getFormattedAudioCompletion returns the whole
      // request (`completionParams`), including prompt/grammar/logit_bias, and
      // `speaker` must be a builtin voice name or a LlamaSpeaker — passing a
      // structured payload now throws.
      const voice = await resolveTTSVoice(context, ttsParams)
      speakerRelease = voice.release
      const speakerValue = voice.speaker

      // A name the codec does not know would fail natively with "no voice";
      // report it with the list the user can pick from instead.
      if (
        typeof speakerValue === 'string' &&
        (ttsCaps?.builtinVoices?.length ?? 0) > 0 &&
        !ttsCaps!.builtinVoices.some(v => v.name === speakerValue)
      ) {
        throw new Error(
          t.params.voiceNoSuchVoiceDesc.replace(
            '{voices}',
            ttsCaps!.builtinVoices.map(v => v.name).join(', '),
          ),
        )
      }

      const instruct =
        ttsCaps?.canTakeInstruct && ttsParams?.instruct?.trim()
          ? ttsParams.instruct.trim()
          : undefined

      const request = await context.getFormattedAudioCompletion({
        prompt: text,
        ...(speakerValue ? { speaker: speakerValue } : {}),
        ...(instruct ? { instruct } : {}),
      })

      const collectedTokens: number[] = []
      const params = completionParams || (await loadCompletionParams())
      const genStart = Date.now()
      const finishStats = (tokens: number, label: string, pcm?: Float32Array | null) =>
        setGenStats({
          genSec: (Date.now() - genStart) / 1000,
          audioSec: pcm && pcm.length > 0 ? pcm.length / (sampleRate || 24000) : null,
          tokens,
          label,
        })

      const result = await context.completion(
        {
          ...(request.completionParams ?? {}),
          prompt: request.prompt,
          grammar: request.grammar,
          embedding: request.embedding,
          ...(speakerValue ? { speaker: speakerValue } : {}),
          n_predict: params.n_predict ?? -1,
          temperature: params.temperature ?? 0.7,
          top_p: params.top_p ?? 0.9,
          stop: params.stop || ['<|im_end|>', '<|SPEECH_GENERATION_END|>'],
        },
        (data) => {
          // Collect tokens for potential audio processing
          if (data.token && typeof data.token === 'number') {
            collectedTokens.push(data.token)
            setLiveTokens(c => c + 1)
          }
        },
      )

      // Latent models (Soprano, BlueMagpie, Pocket-TTS) return audio_latents
      // instead of codec tokens; decode them with decodeAudioLatents().
      const latents = (result as any).audio_latents as number[] | undefined
      if (latents && latents.length > 0) {
        setGeneratedAudio(
          `Generated ${latents.length} audio latents for: "${inputText.trim()}"`,
        )
        try {
          const decodedAudio = await context.decodeAudioLatents(latents)
          const audioFloat32 = new Float32Array(decodedAudio)
          const rate = await context.getAudioSampleRate()
          setAudioData(audioFloat32)
          setSampleRate(rate || 24000)
          finishStats((result as any).tokens_predicted ?? latents.length, 'steps', audioFloat32)
          setGeneratedAudio(
            `Generated audio data (${audioFloat32.length} samples) for: "${inputText.trim()}"`,
          )
        } catch (decodeError) {
          console.log('Audio latent decoding error:', decodeError)
        }
        return
      }

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
            setSampleRate((await context.getAudioSampleRate()) || 24000)

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
      const message: string = error?.message ?? String(error)
      // Translate the native word-level model failure into an actionable hint.
      const friendly = message.includes('no words in the input text')
        ? `${t.params.voiceEnglishBlocked}: ${t.params.voiceEnglishOnly}`
        : message.startsWith('TTS: no voice')
        ? t.params.voiceNoSuchVoice
        : message
      Alert.alert(t.examples.error, `Failed to generate speech: ${friendly}`)
    } finally {
      if (speakerRelease) await speakerRelease().catch(() => {})
      setIsLoading(false)
      setLiveStartedAt(null)
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
          caps={ttsCaps}
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
          {englishOnlyModel && (
            <Text style={styles.languageHint}>{t.params.voiceEnglishOnly}</Text>
          )}
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

        {liveStartedAt != null && (
          <View style={styles.audioSection}>
            <View style={styles.audioCard}>
              <Text style={styles.infoTitle}>生成中…</Text>
              <View style={styles.statsRow}>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>
                    {`${((Date.now() - liveStartedAt) / 1000).toFixed(1)}s`}
                  </Text>
                  <Text style={styles.statLabel}>elapsed</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{liveTokens}</Text>
                  <Text style={styles.statLabel}>tokens</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {generatedAudio && (
          <View style={styles.audioSection}>
            <Text style={styles.sectionTitle}>{t.examples.generatedAudio}</Text>
            <View style={styles.audioCard}>
              <Text style={styles.audioDescription}>{generatedAudio}</Text>

              {audioData && audioData.length > 0 ? (
                <>
                  <Waveform audio={audioData} color={theme.colors.primary} />
                  {genStats && (
                    <View style={styles.statsRow}>
                      <View style={styles.statCell}>
                        <Text style={styles.statValue}>{`${genStats.genSec.toFixed(2)}s`}</Text>
                        <Text style={styles.statLabel}>generation</Text>
                      </View>
                      {genStats.audioSec != null && (
                        <>
                          <View style={styles.statCell}>
                            <Text style={styles.statValue}>{`${genStats.audioSec.toFixed(2)}s`}</Text>
                            <Text style={styles.statLabel}>audio</Text>
                          </View>
                          <View style={styles.statCell}>
                            <Text style={styles.statValue}>
                              {`${(genStats.genSec / genStats.audioSec).toFixed(2)}×`}
                            </Text>
                            <Text style={styles.statLabel}>RTF</Text>
                          </View>
                        </>
                      )}
                      <View style={styles.statCell}>
                        <Text style={styles.statValue}>{genStats.tokens}</Text>
                        <Text style={styles.statLabel}>{genStats.label}</Text>
                      </View>
                    </View>
                  )}
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
        caps={ttsCaps}
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
    languageHint: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.error,
    },
    statsRow: { flexDirection: 'row', gap: 18, marginTop: 8 },
    statCell: { alignItems: 'center' },
    statValue: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    statLabel: { fontSize: 11, color: theme.colors.textSecondary },
    audioSection: {
      marginBottom: 24,
    },
  })
}
