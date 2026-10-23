import { startHeartbeat, HEARTBEAT_INTERVAL_MS } from '../services/tcp/heartbeat'

describe('startHeartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('writes at the configured interval', () => {
    const write = jest.fn()
    const stop = startHeartbeat(write, 1000)

    jest.advanceTimersByTime(999)
    expect(write).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1)
    expect(write).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(2000)
    expect(write).toHaveBeenCalledTimes(3)

    stop()
  })

  it('stops writing after stop() and is idempotent', () => {
    const write = jest.fn()
    const stop = startHeartbeat(write, 1000)

    jest.advanceTimersByTime(1000)
    stop()
    stop()
    jest.advanceTimersByTime(5000)

    expect(write).toHaveBeenCalledTimes(1)
  })

  it('uses a 5s default interval', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(5000)
  })

  it('keeps ticking when a write throws', () => {
    const write = jest.fn(() => {
      throw new Error('socket closed')
    })
    const stop = startHeartbeat(write, 1000)

    expect(() => jest.advanceTimersByTime(2000)).not.toThrow()
    expect(write).toHaveBeenCalledTimes(2)

    stop()
  })
})
