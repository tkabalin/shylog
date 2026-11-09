import { lrint } from "./round.ts"
import type { Sample } from "./samples.ts"

// The safety stop, found in the depth samples. Subsurface doesn't detect
// one and the D4i logs only mandatory stops, never the recommended one, so
// this is Shylog's own rule, built on the Suunto manuals'.

// Suunto counts a stop on any dive deeper than 10 m, and going back below
// 10 m starts the count again.
const deep = 10000
// The manuals say 3 to 6 m. 6.4 m keeps every real stop full, as the owner
// remembers them. The D4i's raw log can't refine it: its mandatory stop
// markers end about 30 s into the band, whatever the edge.
const shallowest = 3000
const deepest = 6400
// A drift out of the band shorter than this pauses the stop; a longer one
// ends it, so 16 minutes at 8 m between two visits isn't one stop.
// Fitted to the owner's dives like the band.
const excursion = 120
// A minute in the band is a stop, and 3 minutes completes it, less 10 s
// for the interpolation at the D4i's 20 s sampling.
const shortest = 60
const complete = 170

export interface SafetyStop {
  // Seconds into the dive: first entry into the band and last exit from
  // it, pauses included.
  start: number
  end: number
  // Seconds in the band, and their time-weighted mean depth in mm.
  held: number
  depth: number
}

interface Point {
  time: number
  depth: number
}

interface Stretch {
  start: number
  end: number
  held: number
  depthTime: number
}

// A dive's stop on its final ascent, or null if it held under a minute.
// The ascent can visit the band more than once, so the stop is its last
// complete stretch, or failing that its longest.
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

  const stretches: Stretch[] = []
  for (const to of points.slice(last + 1)) {
    const span = to.time - from.time
    // A repeated time is no time at all.
    if (span === 0) continue
    const part = inBand(from, to)
    if (part) {
      const [enter, leave] = part
      const seconds = (leave - enter) * span
      // Mean depth on a straight line is its middle.
      const rise = to.depth - from.depth
      const depthTime = seconds * (from.depth + (rise * (enter + leave)) / 2)
      const start = from.time + enter * span
      const end = from.time + leave * span
      const open = stretches.at(-1)
      if (open && start - open.end <= excursion) {
        open.end = end
        open.held += seconds
        open.depthTime += depthTime
      } else {
        stretches.push({ start, end, held: seconds, depthTime })
      }
    }
    from = to
  }

  // In whole seconds, as isFullStop judges it.
  const stop =
    stretches.findLast((each) => lrint(each.held) >= complete) ??
    stretches.reduce<Stretch | null>(
      (longest, each) =>
        longest && longest.held >= each.held ? longest : each,
      null
    )
  if (!stop || lrint(stop.held) < shortest) return null
  return {
    start: lrint(stop.start),
    end: lrint(stop.end),
    held: lrint(stop.held),
    depth: lrint(stop.depthTime / stop.held),
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
