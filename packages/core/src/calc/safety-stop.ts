import { lrint } from "./round.ts"
import type { Sample } from "./samples.ts"

// The safety stop, found in the depth samples. Both Suunto computers log
// their stop, but Subsurface drops it and its UDDF has no element for it,
// so this is Shylog's own rule, built on the Suunto manuals'.

// Suunto counts a stop on any dive deeper than 10 m, and going back below
// 10 m starts the count again.
const deep = 10000
// The countdown runs from 3 to 6 m and pauses, not resets, outside them:
// the owner's D4i does, as Suunto's newer computers and Divesoft's do.
const shallowest = 3000
const deepest = 6000
// A minute in the band is a stop, and 3 minutes completes it, less 10 s
// for the interpolation at the D4i's 20 s sampling.
const shortest = 60
const complete = 170

export interface SafetyStop {
  // Seconds into the dive: first entry into the band, and the first exit
  // once complete, else the last exit.
  start: number
  end: number
  // Seconds counted in the band, and their time-weighted mean depth in mm.
  held: number
  depth: number
}

interface Point {
  time: number
  depth: number
}

// A dive's stop on its final ascent, or null if it held under a minute.
// Once complete it ends at the next exit from the band, so a dive that
// finishes in the shallows doesn't count its last half hour as a stop.
export function safetyStop(samples: readonly Sample[]): SafetyStop | null {
  // Whole millimetres, so the band's edges compare exactly.
  const points = samples.map((sample) => ({
    time: sample.time,
    depth: lrint(sample.depth * 1000),
  }))
  const last = points.findLastIndex((point) => point.depth > deep)
  if (last === -1 || last === points.length - 1) return null

  // The window opens where the final ascent crosses 10 m.
  const below = points[last]
  const above = points[last + 1]
  let from: Point = {
    time:
      below.time +
      ((above.time - below.time) * (below.depth - deep)) /
        (below.depth - above.depth),
    depth: deep,
  }

  let held = 0
  let depthTime = 0
  let start: number | null = null
  let end = 0
  for (const to of points.slice(last + 1)) {
    const span = to.time - from.time
    // A repeated time is no time at all.
    if (span === 0) continue
    const part = inBand(from, to)
    if (part) {
      const [enter, leave] = part
      const seconds = (leave - enter) * span
      held += seconds
      // Mean depth on a straight line is its middle.
      const rise = to.depth - from.depth
      depthTime += seconds * (from.depth + (rise * (enter + leave)) / 2)
      start ??= from.time + enter * span
      end = from.time + leave * span
    }
    // In whole seconds, as isFullStop judges it.
    if (lrint(held) >= complete && (!part || part[1] < 1)) break
    from = to
  }

  const seconds = lrint(held)
  if (start == null || seconds < shortest) return null
  return {
    start: lrint(start),
    end: lrint(end),
    held: seconds,
    depth: lrint(depthTime / held),
  }
}

// Whether a stop held the full countdown, rather than surfacing early.
export const isFullStop = (stop: Pick<SafetyStop, "held">) =>
  stop.held >= complete

// The share of the straight line between two points inside the band, as
// fractions of the way along it, or null if none of it is.
function inBand(from: Point, to: Point) {
  const rise = to.depth - from.depth
  if (rise === 0) {
    return from.depth >= shallowest && from.depth <= deepest
      ? ([0, 1] as const)
      : null
  }
  const a = (shallowest - from.depth) / rise
  const b = (deepest - from.depth) / rise
  const enter = Math.max(Math.min(a, b), 0)
  const leave = Math.min(Math.max(a, b), 1)
  return leave > enter ? ([enter, leave] as const) : null
}
