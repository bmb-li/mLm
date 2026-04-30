export function parseJsonBody(body: string): {
  payload?: any
  error?: string
} {
  if (!body || body.trim().length === 0) {
    return { error: 'empty_body' }
  }

  try {
    const parsed = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null) {
      return { error: 'invalid_json_body' }
    }
    return { payload: parsed }
  } catch {
    return { error: 'invalid_json' }
  }
}
