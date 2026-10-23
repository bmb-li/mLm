export interface ToolCallEntry {
  id?: string
  type: 'function'
  function: { name: string; arguments: string }
}

/**
 * One streamed token as produced by llama.rn.
 *
 * `token` is the raw piece. Once the native chat parser succeeds,
 * `content` / `reasoning_content` hold cumulative snapshots of the parsed
 * output (i.e. the whole text so far, not the delta).
 */
export interface CompletionTokenData {
  token: string
  content?: string
  reasoning_content?: string
  accumulated_text?: string
}

export type OnCompletionToken = (data: CompletionTokenData) => boolean

/**
 * Performance data reported by llama.rn when a completion finishes.
 * `prompt_*` covers prompt processing (input), `predicted_*` covers
 * token generation (output).
 */
export interface CompletionTimings {
  cache_n: number
  prompt_n: number
  prompt_ms: number
  prompt_per_token_ms: number
  prompt_per_second: number
  predicted_n: number
  predicted_ms: number
  predicted_per_token_ms: number
  predicted_per_second: number
}

export interface CompletionResult {
  content: string
  text: string
  reasoning_content: string
  tool_calls?: ToolCallEntry[]
  timings?: CompletionTimings
}

/** Latest model throughput shown in the server status UI. */
export interface ModelSpeed {
  promptPerSecond: number
  predictedPerSecond: number
  promptTokens: number
  predictedTokens: number
  /** True while tokens are still streaming (output speed is an estimate). */
  live: boolean
}
