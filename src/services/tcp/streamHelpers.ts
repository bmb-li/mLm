/**
 * Advance a cumulative snapshot to the next one and return the text that has
 * not been streamed yet.
 *
 * llama.rn re-parses the whole generated text on every token, so `content`
 * and `reasoning_content` are snapshots rather than deltas. Snapshots normally
 * only grow; when the parser reclassifies its tail (e.g. an incomplete tag got
 * decoded) we must not re-emit already streamed text.
 */
export function advanceSnapshot(
  previous: string,
  next: string,
): { delta: string; snapshot: string } {
  if (!next || next === previous) {
    return { delta: '', snapshot: previous }
  }
  if (next.startsWith(previous)) {
    return { delta: next.slice(previous.length), snapshot: next }
  }
  // Parser rewound/reclassified a prefix. The already emitted text cannot be
  // retracted in a stream, so re-baseline on `next` (future diffs must follow
  // the parser state) and only forward the tail that is newer than what was
  // already streamed.
  if (next.length > previous.length) {
    return { delta: next.slice(previous.length), snapshot: next }
  }
  return { delta: '', snapshot: next }
}

/**
 * Split a complete raw output on `<tool_call>` blocks.
 * Used only as a fallback when the native chat parser produced no output.
 */
export function extractToolCallsFromRaw(
  raw: string,
  genId: () => string,
): { content: string; toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> } {
  const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = []
  let content = ''
  let pos = 0

  while (pos < raw.length) {
    const start = raw.indexOf('<tool_call>', pos)
    if (start < 0) {
      content += raw.slice(pos)
      break
    }
    content += raw.slice(pos, start)
    const end = raw.indexOf('</tool_call>', start)
    if (end < 0) {
      // Incomplete tool call: drop it rather than leaking partial JSON.
      break
    }
    const payload = raw.slice(start + '<tool_call>'.length, end).trim()
    try {
      const parsed = JSON.parse(payload)
      if (parsed?.name) {
        toolCalls.push({
          id: genId(),
          type: 'function',
          function: {
            name: parsed.name,
            arguments: JSON.stringify(parsed.arguments || {}),
          },
        })
      }
    } catch {}
    pos = end + '</tool_call>'.length
  }

  return { content, toolCalls }
}
