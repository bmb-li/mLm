import { readWavFile } from './audioUtils'
import type { TTSCustomVoice, TTSParams } from './storage'
import type { LlamaContext, LlamaSpeaker } from '../../modules/llama.rn/src'

/** The voice selected in the TTS parameters: a custom clone, a builtin name, or nothing (default). */
export interface SelectedTTSVoice {
  /** The raw `speakerConfig` value (a builtin name or a custom voice id). */
  value: string
  /** The matching custom voice, when `value` is one of the user's clones. */
  custom?: TTSCustomVoice
}

export const getSelectedTTSVoice = (
  params: TTSParams | null | undefined,
): SelectedTTSVoice => {
  const value =
    typeof params?.speakerConfig === 'string'
      ? params.speakerConfig.trim()
      : ''
  return {
    value,
    custom: value
      ? (params?.customVoices ?? []).find(v => v.id === value)
      : undefined,
  }
}

/** A short human-readable label for a stored voice selection. */
export const ttsVoiceLabel = (
  params: TTSParams | null | undefined,
  defaultLabel: string,
): string => {
  const { value, custom } = getSelectedTTSVoice(params)
  if (custom) return `${custom.kind === 'file' ? '📄' : '🎤'} ${custom.name}`
  return value || defaultLabel
}

/**
 * A speaker the native side can use: a builtin voice name (a borrowed codec
 * voice) or a cloned `LlamaSpeaker` (reference audio / speaker file).
 * `release` frees the clone; it is a no-op for builtin names.
 */
export interface ResolvedTTSVoice {
  speaker?: string | LlamaSpeaker
  release: () => Promise<void>
}

const noop = async () => {}

/**
 * Turn the stored voice selection into a `speaker` argument. Clones are
 * re-created on every call because the native speaker handle is tied to the
 * current context and must be released after use.
 */
export const resolveTTSVoice = async (
  context: LlamaContext,
  params: TTSParams | null | undefined,
): Promise<ResolvedTTSVoice> => {
  const { value, custom } = getSelectedTTSVoice(params)

  if (custom?.kind === 'audio' && custom.audioPath) {
    const { pcm, sampleRate } = await readWavFile(custom.audioPath)
    if (pcm.length === 0) throw new Error('参考音频为空')
    const speaker = await context.createSpeaker({
      refAudio: pcm,
      refAudioSampleRate: sampleRate,
      refText: custom.refText?.trim() || undefined,
    })
    return {
      speaker,
      release: async () => {
        await speaker.release().catch(() => {})
      },
    }
  }

  if (custom?.kind === 'file' && custom.filePath) {
    const speaker = await context.loadSpeaker(custom.filePath)
    return {
      speaker,
      release: async () => {
        await speaker.release().catch(() => {})
      },
    }
  }

  return { speaker: value || undefined, release: noop }
}

/**
 * True when the text has no word an English word-level model (OuteTTS 0.2 /
 * 0.3) can speak: their frontend keeps only `a-z`, so CJK input yields an
 * empty word sequence and the native side fails with "no words in the input
 * text".
 */
export const hasEnglishWords = (text: string): boolean =>
  /[A-Za-z]/.test(text)
