import { surfaceThreshold, toMillimetres } from "./pressure.ts"
import { intDiv } from "./round.ts"
import type { Sample } from "./samples.ts"

// Time under water and its time-weighted mean depth, leaving out segments
// with both ends at the surface (fixup_dc_duration in core/divecomputer.cpp).
// Unlike the dive end, a sample of exactly 0.75 m counts as at the surface.
export function underwater(samples: readonly Sample[]) {
  let duration = 0
  let depthTime = 0
  let lastTime = 0
  let lastDepth = 0
  for (const sample of samples) {
    const depth = toMillimetres(sample.depth)
    // Subsurface reads a negative depth as none and skips the sample.
    if (depth < 0) continue
    if (depth > surfaceThreshold || lastDepth > surfaceThreshold) {
      duration += sample.time - lastTime
      depthTime += intDiv((sample.time - lastTime) * (depth + lastDepth), 2)
    }
    lastTime = sample.time
    lastDepth = depth
  }
  if (!duration) return null
  // Seconds, and metres to the whole mm.
  return {
    duration,
    averageDepth: intDiv(depthTime + intDiv(duration, 2), duration) / 1000,
  }
}
