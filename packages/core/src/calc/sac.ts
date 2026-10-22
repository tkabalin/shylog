import { gasVolume } from "./gas.ts"
import {
  depthToMbar,
  standardPressure,
  toMillimetres,
  type Water,
} from "./pressure.ts"
import { lrint } from "./round.ts"

// Database units: bar, ml, tenths of a per cent, seconds and metres.
export interface SacInputs {
  startPressure: number | null
  endPressure: number | null
  cylinderVolume: number | null
  oxygen: number | null
  duration: number | null
  averageDepth: number | null
}

// Litres per minute at the surface, to the ml, following Subsurface's
// calculate_sac (core/divelist.cpp) with real-gas volumes; null when an
// input is missing or no gas was used.
export function sacRate(inputs: SacInputs, water: Water): number | null {
  const { startPressure, endPressure, cylinderVolume, oxygen } = inputs
  const { duration, averageDepth } = inputs
  if (
    startPressure == null ||
    endPressure == null ||
    cylinderVolume == null ||
    oxygen == null ||
    !duration ||
    !averageDepth
  )
    return null
  const start = lrint(startPressure * 1000)
  const end = lrint(endPressure * 1000)
  if (start <= end) return null
  const used =
    (gasVolume(cylinderVolume, start, oxygen) -
      gasVolume(cylinderVolume, end, oxygen)) /
    1000
  // A drop too small to change the whole-ml volumes, as calculate_airuse.
  if (!used) return null
  const atm = depthToMbar(toMillimetres(averageDepth), water) / standardPressure
  return lrint((((used / atm) * 60) / duration) * 1000) / 1000
}

// A hand-entered duration or average depth wins. Otherwise Subsurface's
// figures from the samples (`underwater`, which the server stores on the
// dive) are used, which can differ from the computer's own, and only a dive
// without samples falls back to the stored value.
export function sacDurationAndDepth(
  dive: { duration: number; averageDepth: number | null },
  hand: { duration: boolean; averageDepth: boolean },
  fromSamples: { duration: number; averageDepth: number } | null
) {
  return {
    duration:
      hand.duration || !fromSamples ? dive.duration : fromSamples.duration,
    averageDepth:
      hand.averageDepth || !fromSamples
        ? dive.averageDepth
        : fromSamples.averageDepth,
  }
}
