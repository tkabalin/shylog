import { lrint } from "./round.ts"
import type { ChartPoint } from "./velocity.ts"

// The water temperature lane's smoothed line. Both computers record
// whole degrees, only on a change, and the sensor lags the water by
// minutes, so the recorded line starts warm and flickers by a degree.

// A reading counts once the diver has held a depth, within 1.5 m, for a
// minute, below 1 m and a minute into the dive: by then the sensor has
// mostly caught up.
const settleTime = 60
const settleDepth = 1500
const shallowest = 1000

// The water column is read in 3 m bands, each from at least a minute of
// settled readings so one short stop can't make one; bands 2 °C apart are
// a thermocline, as 1 °C is just whole-degree rounding.
const bandDepth = 3000
const bandTime = 60
const thermocline = 2000

// A change, the first value included, must hold for 2 minutes to show.
const holdTime = 120

// Compared in whole millidegrees, never as floats.
const milli = (celsius: number) => lrint(celsius * 1000)

// Each point's temperature as the water was: the water column at the
// diver's depth on a dive with a thermocline, otherwise the settled
// readings, debounced. With nothing settled, the recorded line stands.
export function smoothTemperatures(
  points: readonly ChartPoint[]
): (number | null)[] {
  const settled = points.map((_, i) => isSettled(points, i))
  const column = waterColumn(points, settled)
  const values = column.map((band) => milli(band.temperature))
  if (
    column.length > 1 &&
    Math.max(...values) - Math.min(...values) >= thermocline
  ) {
    return points.map((point) =>
      point.temperature == null ? null : columnAt(column, point.depth)
    )
  }
  return debounced(points, settled)
}

function isSettled(points: readonly ChartPoint[], i: number) {
  const { time, depth, temperature } = points[i]
  if (temperature == null || depth < shallowest || time < settleTime)
    return false
  for (let j = i; j >= 0 && points[j].time >= time - settleTime; j--) {
    if (Math.abs(points[j].depth - depth) > settleDepth) return false
  }
  return true
}

// Whether the reading at a point is unchanged for the next 2 minutes. A
// change in a dive's last 2 minutes never shows: surfacing ends the
// readings before it could prove itself more than flicker.
function holds(points: readonly ChartPoint[], i: number) {
  const { time, temperature } = points[i]
  let j = i
  for (; j < points.length && points[j].time < time + holdTime; j++) {
    const next = points[j].temperature
    if (next == null || milli(next) !== milli(temperature!)) return false
  }
  return j < points.length
}

interface Band {
  // Where its readings were taken, mm, and what they were.
  depth: number
  temperature: number
}

// The lower of the middle two, not their mean, so a band's value is one
// the computer recorded, at a depth the diver was at.
const middle = (values: number[]) =>
  values.sort((a, b) => a - b)[(values.length - 1) >> 1]

// Each band's settled readings, shallowest first.
function waterColumn(
  points: readonly ChartPoint[],
  settled: readonly boolean[]
): Band[] {
  const bands = new Map<
    number,
    { depths: number[]; readings: number[]; from: number; to: number }
  >()
  points.forEach((point, i) => {
    if (!settled[i]) return
    const band = Math.floor(point.depth / bandDepth)
    const found = bands.get(band) ?? {
      depths: [],
      readings: [],
      from: point.time,
      to: point.time,
    }
    found.depths.push(point.depth)
    found.readings.push(point.temperature!)
    found.to = point.time
    bands.set(band, found)
  })
  return [...bands]
    .filter(([, { from, to }]) => to - from >= bandTime)
    .sort(([a], [b]) => a - b)
    .map(([, { depths, readings }]) => ({
      depth: middle(depths),
      temperature: middle(readings),
    }))
}

// A band's own value at its depth and beyond the end bands; between two, a
// straight line to whole degrees, since an estimate is no finer than the
// readings. Worked in millidegrees and mm, so a half is exact for lrint.
function columnAt(column: readonly Band[], depth: number) {
  const first = column[0]
  const last = column.at(-1)!
  if (depth <= first.depth) return first.temperature
  if (depth >= last.depth) return last.temperature
  const i = column.findIndex((band) => band.depth >= depth)
  const below = column[i]
  if (below.depth === depth) return below.temperature
  const above = column[i - 1]
  const span = below.depth - above.depth
  const scaled =
    milli(above.temperature) * span +
    (depth - above.depth) *
      (milli(below.temperature) - milli(above.temperature))
  // Never past either band: between 24.6 and 22.3 °C, 24.59 is not 25.
  const low = Math.min(above.temperature, below.temperature)
  const high = Math.max(above.temperature, below.temperature)
  return Math.min(Math.max(lrint(scaled / (span * 1000)), low), high)
}

function debounced(
  points: readonly ChartPoint[],
  settled: readonly boolean[]
): (number | null)[] {
  const any = settled.indexOf(true)
  if (any === -1) return points.map((point) => point.temperature)
  const held = settled.findIndex((yes, i) => yes && holds(points, i))
  const start = held === -1 ? any : held
  let shown = points[start].temperature!
  return points.map((point, i) => {
    const reading = point.temperature
    if (reading == null) return null
    if (
      i > start &&
      settled[i] &&
      milli(reading) !== milli(shown) &&
      holds(points, i)
    ) {
      shown = reading
    }
    return shown
  })
}
