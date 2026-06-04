export interface ParsedMessage {
  role: string
  content: string | Array<{
    type: 'text' | 'image_url' | 'input_audio'
    text?: string
    image_url?: { url: string }
    input_audio?: { format: string; data?: string; url?: string }
  }> | null
  tool_calls?: Array<{
    id?: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

function parseContentPart(part: any): any {
  if (part.type === 'image_url') {
    return { type: 'image_url', image_url: { url: part.image_url?.url || '' } }
  }
  if (part.type === 'input_audio') {
    return {
      type: 'input_audio',
      input_audio: {
        format: part.input_audio?.format || 'wav',
        data: part.input_audio?.data,
        url: part.input_audio?.url,
      },
    }
  }
  return { type: 'text', text: part.text || '' }
}

export function parseMessagesFromPayload(payload: any): {
  messages: ParsedMessage[]
  error?: string
} {
  if (!payload.messages || !Array.isArray(payload.messages)) {
    return { messages: [], error: 'messages_required' }
  }

  const messages: ParsedMessage[] = []
  for (const msg of payload.messages) {
    if (!msg.role || typeof msg.role !== 'string') {
      return { messages: [], error: 'invalid_message_role' }
    }

    const parsed: ParsedMessage = { role: msg.role, content: null }

    if (msg.content !== undefined && msg.content !== null) {
      if (typeof msg.content === 'string') {
        parsed.content = msg.content
      } else if (Array.isArray(msg.content)) {
        parsed.content = msg.content.map(parseContentPart)
      }
    }

    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      parsed.tool_calls = msg.tool_calls.map((tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '',
        },
      }))
    }

    if (msg.role === 'tool' && typeof msg.tool_call_id === 'string') {
      parsed.tool_call_id = msg.tool_call_id
    }

    messages.push(parsed)
  }

  return { messages }
}

export function parseMessagesOrPromptFromPayload(payload: any): {
  messages?: ParsedMessage[]
  prompt?: string
  error?: string
} {
  if (payload.messages) {
    const result = parseMessagesFromPayload(payload)
    return result
  }

  if (typeof payload.prompt === 'string') {
    return { prompt: payload.prompt }
  }

  if (typeof payload.content === 'string') {
    return { prompt: payload.content }
  }

  return { error: 'messages_or_prompt_required' }
}
