export interface CompletionSettings {
  n_predict?: number
  temperature?: number
  top_p?: number
  top_k?: number
  repeat_penalty?: number
  presence_penalty?: number
  frequency_penalty?: number
  seed?: number
  stop?: string[]
  cache_prompt?: boolean
  ignore_eos?: boolean
}

export function buildCustomSettings(payload: any): CompletionSettings | undefined {
  const settings: CompletionSettings = {}

  if (payload.temperature != null) settings.temperature = payload.temperature
  if (payload.top_p != null) settings.top_p = payload.top_p
  if (payload.top_k != null) settings.top_k = payload.top_k
  if (payload.max_tokens != null) settings.n_predict = payload.max_tokens
  if (payload.frequency_penalty != null) settings.frequency_penalty = payload.frequency_penalty
  if (payload.presence_penalty != null) settings.presence_penalty = payload.presence_penalty
  if (payload.seed != null) settings.seed = payload.seed
  if (payload.stop != null) {
    settings.stop = Array.isArray(payload.stop) ? payload.stop : [payload.stop]
  }
  if (payload.cache_prompt != null) settings.cache_prompt = payload.cache_prompt
  if (payload.ignore_eos != null) settings.ignore_eos = payload.ignore_eos

  return Object.keys(settings).length > 0 ? settings : undefined
}
