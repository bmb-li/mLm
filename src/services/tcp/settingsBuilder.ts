export type ReasoningFormat = 'none' | 'auto' | 'deepseek'

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
  tools?: object
  tool_choice?: string
  parallel_tool_calls?: object
  response_format?: { type: 'text' | 'json_object' | 'json_schema'; json_schema?: object; schema?: object }
  reasoning_format?: ReasoningFormat
  enable_thinking?: boolean
  chat_template_kwargs?: Record<string, unknown>
}

const REASONING_FORMATS: ReasoningFormat[] = ['none', 'auto', 'deepseek']

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
  if (payload.tools != null) settings.tools = payload.tools
  if (payload.tool_choice != null) settings.tool_choice = payload.tool_choice
  if (payload.parallel_tool_calls != null) settings.parallel_tool_calls = payload.parallel_tool_calls
  if (payload.response_format != null) settings.response_format = payload.response_format

  if (REASONING_FORMATS.includes(payload.reasoning_format)) {
    settings.reasoning_format = payload.reasoning_format
  }
  if (payload.enable_thinking != null) {
    settings.enable_thinking = payload.enable_thinking === true
  }
  if (payload.chat_template_kwargs != null && typeof payload.chat_template_kwargs === 'object') {
    settings.chat_template_kwargs = payload.chat_template_kwargs
  }

  return Object.keys(settings).length > 0 ? settings : undefined
}
