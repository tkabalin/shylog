import { diveEnd, type Sample } from "@shylog/core"

import type { Db } from "./db/open.ts"
import { prepared } from "./db/prepared.ts"
import type { ProfileEvent } from "./uddf/sample-reader.ts"

const points = 24

// A dive's samples in time order, as stored.
export const selectSamples = (db: Db) =>
  prepared<[string], Sample>(
    db,
    "SELECT time, depth, temperature, pressure FROM samples WHERE dive_id = ? ORDER BY time"
  )

// Depth at a time between two samples, on the straight line between them.
function depthAt(samples: readonly Sample[], time: number) {
  const next = samples.findIndex((sample) => sample.time >= time)
  if (next === -1) return samples[samples.length - 1].depth
  if (next === 0) return samples[0].depth
  const a = samples[next - 1]
  const b = samples[next]
  return a.depth + ((b.depth - a.depth) * (time - a.time)) / (b.time - a.time)
}

// The Log's sparkline (D2): the deepest sample in each of 24 equal slices of
// the dive, so the line always reaches the bottom. A slice with no sample in
// it takes the depth at its middle. Centimetres are plenty at that size.
export function sparkline(samples: readonly Sample[], duration: number) {
  const underway = samples.filter((sample) => sample.time >= 0)
  if (!underway.length) return null
  const end = diveEnd(duration, underway)
  return Array.from({ length: points }, (_, i) => {
    const from = (end * i) / points
    const to = (end * (i + 1)) / points
    const inSlice = underway.filter(
      (sample) =>
        sample.time >= from &&
        (sample.time < to || (i === points - 1 && sample.time <= to))
    )
    const depth = inSlice.length
      ? Math.max(...inSlice.map((sample) => sample.depth))
      : depthAt(underway, (from + to) / 2)
    return Math.round(depth * 100) / 100
  })
}

// Writes a dive's samples and events, and the sparkline and ascent-alarm
// count kept on the dive so the Log never needs the samples.
export function storeProfile(
  db: Db,
  diveId: string,
  duration: number,
  samples: readonly Sample[],
  events: readonly ProfileEvent[]
) {
  const sample = prepared(
    db,
    "INSERT INTO samples (dive_id, time, depth, temperature, pressure) VALUES (?, ?, ?, ?, ?)"
  )
  for (const { time, depth, temperature, pressure } of samples) {
    sample.run(diveId, time, depth, temperature, pressure)
  }
  const event = prepared(
    db,
    "INSERT INTO events (dive_id, type, start_seconds, end_seconds) VALUES (?, ?, ?, ?)"
  )
  for (const { type, start, end } of events) event.run(diveId, type, start, end)
  const line = sparkline(samples, duration)
  prepared(
    db,
    "UPDATE dives SET sparkline = ?, ascent_alarm_count = ? WHERE id = ?"
  ).run(
    line && JSON.stringify(line),
    events.filter((e) => e.type === "ascent").length,
    diveId
  )
}
