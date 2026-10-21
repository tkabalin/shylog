import { surfaceThreshold, toMillimetres } from "./pressure.ts"
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

// The end of the dive on the chart, as calculate_max_limits_new
// (core/profile.cpp) finds it: the sample after the last one under water, the
// last event if later, and always at least the first sample past that event.
export function chartEnd(
  samples: readonly Sample[],
  eventTimes: readonly number[]
): number {
  let end = Math.max(0, ...eventTimes)
  let pastEvents = false
  let lastDepth = 0
  for (const sample of samples) {
    const depth = toMillimetres(sample.depth)
    const diving = depth > surfaceThreshold || lastDepth > surfaceThreshold
    if ((diving || !pastEvents) && sample.time > end) {
      pastEvents = true
      end = sample.time
    }
    lastDepth = depth
  }
  return end
}

// Chart points from merged samples, as populate_plot_entries (core/profile.cpp)
// builds them: one every 10 s in longer gaps and one at each event, ending one
// sample past chartEnd so a short dive's line doesn't trail along the surface.
// The line starts and ends at the surface; later events sit there.
export function chartPoints(
  samples: readonly Sample[],
  eventTimes: readonly number[]
): ChartPoint[] {
  const end = chartEnd(samples, eventTimes)
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
      if (lastTime + offset > end) break
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
    if (time > end) break
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
