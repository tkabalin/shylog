import { isAtSurface, toMillimetres } from "./pressure.ts"

// One profile sample in database units: seconds into the dive, metres, °C
// and bar. The D4i records temperature only when it changes.
export interface Sample {
  time: number
  depth: number
  temperature: number | null
  pressure: number | null
}

// The D4i export repeats some times, each copy carrying a different alarm.
// Keeps the first sample at each time, filling its gaps from the repeats.
export function mergeDuplicateSamples(samples: readonly Sample[]): Sample[] {
  const merged: Sample[] = []
  for (const sample of samples) {
    const last = merged.at(-1)
    if (last?.time === sample.time) {
      last.temperature ??= sample.temperature
      last.pressure ??= sample.pressure
    } else {
      merged.push({ ...sample })
    }
  }
  return merged
}

// The last sample at or below 0.75 m, as Subsurface's dc_totaltime finds it.
export function lastUnderwaterSample(samples: readonly Sample[]) {
  return samples.findLast((sample) => !isAtSurface(toMillimetres(sample.depth)))
}

// Seconds from the start to the end of the dive: the later of its duration
// and its last sample below the surface, since the computer can stop the
// clock while the diver is still down. Like dc_totaltime, a dive that never
// goes below falls back to its first sample's time.
export const diveEnd = (duration: number, samples: readonly Sample[]) =>
  Math.max(duration, (lastUnderwaterSample(samples) ?? samples[0])?.time ?? 0)
