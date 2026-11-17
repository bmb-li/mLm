import React, { useMemo } from 'react'
import { View } from 'react-native'

const WAVEFORM_BARS = 48

/**
 * Static waveform of an audio clip, drawn with plain Views (one bar per peak
 * bin) — no chart dependency needed. Ported from the llama.rn example so the
 * generated speech can be sanity-checked at a glance.
 */
export function Waveform({
  audio,
  color,
  height = 56,
}: {
  audio: Float32Array
  color: string
  height?: number
}) {
  const peaks = useMemo(() => {
    const bins: number[] = new Array(WAVEFORM_BARS).fill(0)
    if (audio.length === 0) return bins
    const step = Math.max(1, Math.floor(audio.length / WAVEFORM_BARS))
    const stride = Math.max(1, Math.floor(step / 64))
    let maxPeak = 0
    for (let i = 0; i < WAVEFORM_BARS; i += 1) {
      const start = i * step
      const end = Math.min(start + step, audio.length)
      let peak = 0
      for (let j = start; j < end; j += stride) {
        const v = Math.abs(audio[j] ?? 0)
        if (v > peak) peak = v
      }
      bins[i] = peak
      if (peak > maxPeak) maxPeak = peak
    }
    if (maxPeak > 0) {
      for (let i = 0; i < bins.length; i += 1) bins[i] = bins[i] / maxPeak
    }
    return bins
  }, [audio])

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height,
        gap: 1,
        marginVertical: 8,
      }}
    >
      {peaks.map((peak, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: Math.max(2, peak * height),
            borderRadius: 1,
            backgroundColor: color,
            opacity: 0.35 + peak * 0.65,
          }}
        />
      ))}
    </View>
  )
}

export default Waveform
