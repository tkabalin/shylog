import { lrint } from "./round.ts"
import type { ChartPoint } from "./velocity.ts"

// How many chart points are in view on a time axis ending at `max`: every
// point before it and the first at or past it, as plotDive
// (profile-widget/profilescene.cpp) finds them.
export function pointsInView(points: readonly ChartPoint[], max: number) {
  const end = lrint(max)
  const past = points.findIndex((point) => point.time >= end)
  return past === -1 ? points.length : past + 1
}

export interface DepthLabel {
  time: number
  depth: number
  kind: "peak" | "valley"
}

const minDepth = 2000
const minProminence = 2000

// DiveProfileItem::replot's labelled depths, in its order. Past `interval`
// s each side of a peak, a point 2 m below the shallowest passed makes the
// deepest point beyond it the next peak, labelled with a valley 2 m deep.
// Subsurface leads with two surface entries to core's one, so one is added.
export function depthLabels(
  points: readonly ChartPoint[],
  inView: number,
  interval: number
): DepthLabel[] {
  const data = [points[0], ...points.slice(0, inView)]
  const labels: DepthLabel[] = []
  if (data.length < 3) return labels
  const deepest = (from: number, to: number) => {
    let found = from
    for (let i = from + 1; i < to; i++) {
      if (data[i].depth > data[found].depth) found = i
    }
    return found
  }
  const label = (i: number, kind: DepthLabel["kind"]) =>
    labels.push({ time: data[i].time, depth: data[i].depth, kind })

  const highest = deepest(0, data.length)
  if (data[highest].depth < minDepth) return labels
  const stack = [{ from: 0, to: data.length, peak: highest }]
  while (stack.length) {
    const { from, to, peak } = stack.pop()!
    label(peak, "peak")
    const at = data[peak].time

    let valley = peak
    let next = peak + 1
    for (; next + 3 < to; next++) {
      if (data[next].time > at + interval) break
      if (data[next].depth < data[valley].depth) valley = next
    }
    for (; next + 3 < to; next++) {
      if (data[next].depth >= data[valley].depth + minProminence) {
        const found = deepest(next, to)
        if (data[found].depth < minDepth) break
        stack.push({ from: next, to, peak: found })
        if (data[valley].depth >= minDepth) label(valley, "valley")
        break
      }
      if (data[next].depth < data[valley].depth) valley = next
    }

    valley = peak
    next = peak - 1
    for (; next >= from + 3; next--) {
      if (data[next].time + interval < at) break
      if (data[next].depth < data[valley].depth) valley = next
    }
    for (; next >= from + 3; next--) {
      if (data[next].depth >= data[valley].depth + minProminence) {
        const found = deepest(from, next)
        if (data[found].depth < minDepth) break
        stack.push({ from, to: next, peak: found })
        if (data[valley].depth >= minDepth) label(valley, "valley")
        break
      }
      if (data[next].depth < data[valley].depth) valley = next
    }
  }
  return labels
}
