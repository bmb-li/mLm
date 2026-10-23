/**
 * Default interval for transport-level keep-alive writes.
 *
 * Agent clients often apply a 10-30s read timeout. Local inference can spend
 * much longer than that in prompt processing (or model loading) before the
 * first token is produced, so we send a harmless keep-alive periodically.
 */
export const HEARTBEAT_INTERVAL_MS = 5000

/**
 * Start a periodic keep-alive writer. The returned function is idempotent, so
 * it is safe to call from both a success path and a `finally` block.
 */
export function startHeartbeat(
  write: () => void,
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
): () => void {
  let stopped = false
  const timer = setInterval(() => {
    if (stopped) return
    try {
      write()
    } catch {
      // The socket may have been closed between ticks; the next tick will
      // also be a no-op because the write helpers check `destroyed`.
    }
  }, intervalMs)

  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }
}
