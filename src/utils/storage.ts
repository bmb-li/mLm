import AsyncStorage from '@react-native-async-storage/async-storage'
import RNBlobUtil from 'react-native-blob-util'
import type {
  ContextParams as LlamaContextParams,
  CompletionParams as LlamaCompletionParams,
} from '../../modules/llama.rn/src'

export type ContextParams = Omit<LlamaContextParams, 'model'> & { image_max_tokens?: number }
export type CompletionParams = Omit<LlamaCompletionParams, 'prompt'>

export interface TTSParams {
  speakerConfig: any | null
}

export interface CustomModel {
  id: string
  repo: string
  filename: string
  quantization: string
  mmprojFilename?: string
  mmprojQuantization?: string
  addedAt: number
  localPath?: string
  mmprojLocalPath?: string
  visionEnabled?: boolean
  audioEnabled?: boolean
  vocoderFilename?: string
  vocoderLocalPath?: string
  vocoderEnabled?: boolean
}

export interface MCPServer {
  name: string
  type: 'streamable-http' | 'sse'
  url: string
  headers?: Record<string, string>
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServer>
}

// Storage keys
const CONTEXT_PARAMS_KEY = '@llama_context_params'
const COMPLETION_PARAMS_KEY = '@llama_completion_params'
const TTS_PARAMS_KEY = '@llama_tts_params'
const CUSTOM_MODELS_KEY = '@llama_custom_models'
const MCP_CONFIG_KEY = '@llama_mcp_config'

// Default parameter values
export const DEFAULT_CONTEXT_PARAMS: ContextParams = {
  n_ctx: 8192,
  n_gpu_layers: 99,
  use_mlock: true,
  use_mmap: true,
  n_batch: 512,
  n_ubatch: 512,
  n_parallel: 1,
  ctx_shift: false,
  flash_attn_type: 'auto',
  cache_type_k: 'f16',
  cache_type_v: 'f16',
  kv_unified: false,
  swa_full: false,
}

export const DEFAULT_COMPLETION_PARAMS: CompletionParams = {
  enable_thinking: true,
  n_predict: 1024,
  temperature: 0.7,
  top_p: 0.9,
  stop: [],
}

export const DEFAULT_TTS_PARAMS: TTSParams = {
  speakerConfig: null,
}

export const DEFAULT_MCP_CONFIG: MCPConfig = {
  mcpServers: {},
}

// Storage functions for context parameters
export const saveContextParams = async (
  params: ContextParams,
): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(params)
    await AsyncStorage.setItem(CONTEXT_PARAMS_KEY, jsonValue)
  } catch (error) {
    console.error('Error saving context params:', error)
    throw error
  }
}

export const loadContextParams = async (): Promise<ContextParams> => {
  try {
    const jsonValue = await AsyncStorage.getItem(CONTEXT_PARAMS_KEY)
    if (jsonValue != null) {
      const params = JSON.parse(jsonValue)
      // Merge with defaults to ensure all required fields exist
      return { ...DEFAULT_CONTEXT_PARAMS, ...params }
    }
    return DEFAULT_CONTEXT_PARAMS
  } catch (error) {
    console.error('Error loading context params:', error)
    return DEFAULT_CONTEXT_PARAMS
  }
}

// Storage functions for completion parameters
export const saveCompletionParams = async (
  params: CompletionParams,
): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(params)
    await AsyncStorage.setItem(COMPLETION_PARAMS_KEY, jsonValue)
  } catch (error) {
    console.error('Error saving completion params:', error)
    throw error
  }
}

export const loadCompletionParams = async (): Promise<CompletionParams> => {
  try {
    const jsonValue = await AsyncStorage.getItem(COMPLETION_PARAMS_KEY)
    if (jsonValue != null) {
      const params = JSON.parse(jsonValue)
      // Merge with defaults to ensure all required fields exist
      return { ...DEFAULT_COMPLETION_PARAMS, ...params }
    }
    return DEFAULT_COMPLETION_PARAMS
  } catch (error) {
    console.error('Error loading completion params:', error)
    return DEFAULT_COMPLETION_PARAMS
  }
}

// Reset functions
export const resetContextParams = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CONTEXT_PARAMS_KEY)
  } catch (error) {
    console.error('Error resetting context params:', error)
    throw error
  }
}

export const resetCompletionParams = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(COMPLETION_PARAMS_KEY)
  } catch (error) {
    console.error('Error resetting completion params:', error)
    throw error
  }
}

// Storage functions for TTS parameters
export const saveTTSParams = async (params: TTSParams): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(params)
    await AsyncStorage.setItem(TTS_PARAMS_KEY, jsonValue)
  } catch (error) {
    console.error('Error saving TTS params:', error)
    throw error
  }
}

export const loadTTSParams = async (): Promise<TTSParams> => {
  try {
    const jsonValue = await AsyncStorage.getItem(TTS_PARAMS_KEY)
    if (jsonValue != null) {
      const params = JSON.parse(jsonValue)
      // Merge with defaults to ensure all required fields exist
      return { ...DEFAULT_TTS_PARAMS, ...params }
    }
    return DEFAULT_TTS_PARAMS
  } catch (error) {
    console.error('Error loading TTS params:', error)
    return DEFAULT_TTS_PARAMS
  }
}

export const resetTTSParams = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(TTS_PARAMS_KEY)
  } catch (error) {
    console.error('Error resetting TTS params:', error)
    throw error
  }
}

const LLM_BASE = RNBlobUtil.fs.dirs.DocumentDir + '/LLMs'

const ensureLLMDirs = async () => {
  for (const dir of ['llm', 'mmproj', 'tts', 'wavtokenizer']) {
    const p = `${LLM_BASE}/${dir}`
    if (!(await RNBlobUtil.fs.exists(p))) {
      await RNBlobUtil.fs.mkdir(p)
    }
  }
}

export const loadCustomModels = async (): Promise<CustomModel[]> => {
  try {
    await ensureLLMDirs()
    const models: CustomModel[] = []
    const dirs = ['llm', 'mmproj', 'tts', 'wavtokenizer']
    for (const dir of dirs) {
      const dp = `${LLM_BASE}/${dir}`
      if (await RNBlobUtil.fs.exists(dp)) {
        const files = await RNBlobUtil.fs.ls(dp)
        for (const f of files.filter((x: string) => x.endsWith('.gguf'))) {
          models.push({
            id: f.replace(/\.gguf$/i, ''),
            repo: 'local',
            filename: f,
            quantization: 'Unknown',
            addedAt: 0,
            localPath: `file://${dp}/${f}`,
          })
        }
      }
    }
    const assocs = await loadVocoderAssociations()
    for (const model of models) {
      const a = assocs[model.id]
      if (a) {
        ;(model as any).vocoderFilename = a.vocoderFilename
        ;(model as any).vocoderLocalPath = a.vocoderLocalPath
        ;(model as any).mmprojFilename = a.mmprojFilename
        ;(model as any).mmprojLocalPath = a.mmprojLocalPath
        ;(model as any).visionEnabled = a.visionEnabled
        ;(model as any).audioEnabled = a.audioEnabled
      }
    }
    return models
  } catch (error) {
    console.error('Error loading custom models:', error)
    return []
  }
}

export const saveCustomModel = async (_model: CustomModel): Promise<void> => {}

export const deleteCustomModel = async (modelId: string): Promise<void> => {
  try {
    const models = await loadCustomModels()
    const model = models.find(m => m.id === modelId)
    if (model?.localPath) {
      const path = model.localPath.replace(/^file:\/\//, '')
      if (await RNBlobUtil.fs.exists(path)) {
        await RNBlobUtil.fs.unlink(path)
      }
    }
  } catch (error) {
    console.error('Error deleting model:', error)
    throw error
  }
}

export const updateCustomModel = async (modelId: string, changes: Partial<CustomModel>): Promise<void> => {
  try {
    const existing = await loadVocoderAssociations()
    existing[modelId] = { ...existing[modelId], ...changes }
    await AsyncStorage.setItem('@llm_vocoder_assoc', JSON.stringify(existing))
  } catch (error) {
    console.error('Error updating model:', error)
    throw error
  }
}

export const getCustomModel = async (
  modelId: string,
): Promise<CustomModel | null> => {
  try {
    const models = await loadCustomModels()
    return models.find((m) => m.id === modelId) || null
  } catch (error) {
    console.error('Error getting custom model:', error)
    return null
  }
}

export const loadVocoderAssociations = async (): Promise<Record<string, any>> => {
  try {
    const json = await AsyncStorage.getItem('@llm_vocoder_assoc')
    return json ? JSON.parse(json) : {}
  } catch { return {} }
}

// Storage functions for MCP configuration
export const saveMCPConfig = async (config: MCPConfig): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(config)
    await AsyncStorage.setItem(MCP_CONFIG_KEY, jsonValue)
  } catch (error) {
    console.error('Error saving MCP config:', error)
    throw error
  }
}

export const loadMCPConfig = async (): Promise<MCPConfig> => {
  try {
    const jsonValue = await AsyncStorage.getItem(MCP_CONFIG_KEY)
    if (jsonValue != null) {
      const config = JSON.parse(jsonValue)
      // Merge with defaults to ensure all required fields exist
      return { ...DEFAULT_MCP_CONFIG, ...config }
    }
    return DEFAULT_MCP_CONFIG
  } catch (error) {
    console.error('Error loading MCP config:', error)
    return DEFAULT_MCP_CONFIG
  }
}

export const resetMCPConfig = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(MCP_CONFIG_KEY)
  } catch (error) {
    console.error('Error resetting MCP config:', error)
    throw error
  }
}

// TTS settings
const TTS_ENGINE_KEY = '@llm_tts_engine'
const TTS_AUTO_SPEAK_KEY = '@llm_tts_auto_speak'
const TTS_SPEED_KEY = '@llm_tts_speed'

export type TtsEngine = 'off' | 'system' | 'model'

export const loadTtsEngine = async (): Promise<TtsEngine> => {
  try {
    const v = await AsyncStorage.getItem(TTS_ENGINE_KEY)
    if (v === 'system' || v === 'model') return v
    return 'off'
  } catch { return 'off' }
}

export const saveTtsEngine = async (v: TtsEngine): Promise<void> => {
  await AsyncStorage.setItem(TTS_ENGINE_KEY, v)
}

export const loadTtsAutoSpeak = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(TTS_AUTO_SPEAK_KEY)) === 'true'
  } catch { return false }
}

export const saveTtsAutoSpeak = async (v: boolean): Promise<void> => {
  await AsyncStorage.setItem(TTS_AUTO_SPEAK_KEY, String(v))
}

export const loadTtsSpeed = async (): Promise<number> => {
  try {
    return parseFloat((await AsyncStorage.getItem(TTS_SPEED_KEY)) || '1.0')
  } catch { return 1.0 }
}

export const saveTtsSpeed = async (v: number): Promise<void> => {
  await AsyncStorage.setItem(TTS_SPEED_KEY, String(v))
}

const TTS_VOICE_KEY = '@llm_tts_voice'

export const loadTtsVoice = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(TTS_VOICE_KEY)
  } catch { return null }
}

export const saveTtsVoice = async (v: string | null): Promise<void> => {
  if (v) await AsyncStorage.setItem(TTS_VOICE_KEY, v)
  else await AsyncStorage.removeItem(TTS_VOICE_KEY)
}
