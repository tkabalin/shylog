import { toMillimetres } from "./pressure.ts"
import { intDiv, lrint } from "./round.ts"
import type { Sample } from "./samples.ts"

// A point on the profile chart: seconds, depth in mm, and the temperature
// carried forward from the last sample that had one.
export interface ChartPoint {
  time: number
  depth: number
  temperature: number | null
}

const interpolate = (a: number, b: number, part: number, whole: number) =>
  lrint((a * (whole - part) + b * part) / whole)

// Chart points from merged samples, as populate_plot_entries (core/profile.cpp)
// builds them: one every 10 s in longer gaps and one at each event. The line
// starts and ends at the surface, and events after the last sample sit there.
export function chartPoints(
  samples: readonly Sample[],
  eventTimes: readonly number[]
): ChartPoint[] {
  const points: ChartPoint[] = [{ time: 0, depth: 0, temperature: null }]
  const events = eventTimes.filter((time) => time > 0).sort((a, b) => a - b)
  let next = 0
  let lastTime = 0
  let lastDepth = 0
  const insert = (time: number, depth: number) =>
    points.push({ time, depth, temperature: points.at(-1)!.temperature })

  for (const sample of samples) {
    const depth = toMillimetres(sample.depth)
    const time = Math.max(sample.time, lastTime)
    const delta = time - lastTime || 1
    const at = (when: number) =>
      interpolate(lastDepth, depth, when - lastTime, delta)
    for (let offset = 10; offset < delta; offset += 10) {
      while (next < events.length && events[next] < lastTime + offset) {
        insert(events[next], at(events[next]))
        next++
      }
      insert(lastTime + offset, at(lastTime + offset))
      while (next < events.length && events[next] === lastTime + offset) next++
    }
    while (next < events.length && events[next] < time) {
      insert(events[next], at(events[next]))
      next++
    }
    points.push({
      time,
      depth,
      temperature: sample.temperature ?? points.at(-1)!.temperature,
    })
    while (next < events.length && events[next] === time) next++
    lastTime = time
    lastDepth = depth
  }
  for (; next < events.length; next++) {
    if (events[next] > lastTime) {
      insert(events[next], 0)
      lastTime = events[next]
    }
  }
  // Subsurface's two closing points, fresh entries with no temperature.
  for (const offset of [1, 2]) {
    points.push({ time: lastTime + offset, depth: 0, temperature: null })
  }
  return points
}

export const speedBands = [
  "stable",
  "slow",
  "moderate",
  "fast",
  "crazy",
] as const
export type SpeedBand = (typeof speedBands)[number]

// Subsurface's velocity(): mm/s, negative when ascending. Ascents use
// tighter bands, and the strict comparisons put an ascent exactly on a
// boundary in the slower band and a descent in the faster one.
const ascentBounds = [25, 76, 152, 304]
const descentBounds = [25, 152, 304, 507]
export function speedBand(speed: number): SpeedBand {
  const band =
    speed < 0
      ? ascentBounds.filter((bound) => -speed > bound).length
      : descentBounds.filter((bound) => speed >= bound).length
  return speedBands[band]
}

// Each point's speed from the one before, truncated to mm/s, and its line's
// band (analyze_plot_info in core/profile.cpp). Below Fast, a step under 15 s
// is banded from the nearest point 15 s and two points back, or the first.
export function verticalSpeeds(points: readonly ChartPoint[]) {
  return points.map((point, i) => {
    const previous = points[i - 1]
    if (!previous || point.time === previous.time) {
      return { speed: 0, band: "stable" as SpeedBand }
    }
    const step = point.time - previous.time
    const speed = intDiv(point.depth - previous.depth, step)
    let band = speedBand(speed)
    if (step < 15 && speedBands.indexOf(band) < speedBands.indexOf("fast")) {
      // Subsurface starts two surface points before the first sample, so
      // reaching past this list's first point lands on the same values.
      let j = Math.max(i - 2, 0)
      while (j > 0 && point.time - points[j].time < 15) j--
      const from = points[j]
      band = speedBand(intDiv(point.depth - from.depth, point.time - from.time))
    }
    return { speed, band }
  })
}
