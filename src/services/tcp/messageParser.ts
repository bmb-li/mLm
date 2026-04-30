export interface ParsedMessage {
  role: string
  content: string
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

    let content = ''
    if (typeof msg.content === 'string') {
      content = msg.content
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join('')
    } else {
      return { messages: [], error: 'invalid_message_content' }
    }

    messages.push({ role: msg.role, content })
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
