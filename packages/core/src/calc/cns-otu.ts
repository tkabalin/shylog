import { depthToMbar, toMillimetres, type Water } from "./pressure.ts"
import { intDiv, lrint } from "./round.ts"
import type { Sample } from "./samples.ts"
import { localSeconds } from "./time.ts"

// Oxygen toxicity from the samples, following Subsurface's
// calculate_cns_dive, calculate_otu and calculate_cns (core/divelist.cpp),
// integer truncation included. PO₂ is in whole mbar, time in seconds.

const po2 = (oxygen: number, depth: number, water: Water) =>
  lrint(oxygen * (depthToMbar(toMillimetres(depth), water) / 1000))

// CNS % from one segment, from Subsurface's two-line fit to the log of the
// NOAA table, counted only when the mean PO₂ is above 500 mbar.
export function cnsSegment(start: number, end: number, seconds: number) {
  const mean = intDiv(start + end, 2)
  if (mean <= 500) return 0
  const rate =
    mean <= 1500
      ? Math.exp(-11.7853 + 0.00193873 * mean)
      : Math.exp(-23.6349 + 0.00980829 * mean)
  return seconds * rate * 100
}

// OTU from one segment by Baker's equation 2 for changing PO₂. Only the
// part above 500 mbar counts, with that end taken as 501 mbar.
export function otuSegment(start: number, end: number, seconds: number) {
  if (start <= 500 && end <= 500) return 0
  let t = seconds
  if (start <= 500) {
    t = intDiv(t * (end - 500), end - start)
    start = 501
  } else if (end <= 500) {
    t = intDiv(t * (start - 500), start - end)
    end = 501
  }
  const p = (end + start) / 1000 - 1
  return (
    (t / 60) *
    p ** (5 / 6) *
    (1 - (5 * (end - start) * (end - start)) / 216000000 / (p * p))
  )
}

function segments(
  samples: readonly Sample[],
  oxygen: number,
  water: Water,
  add: (start: number, end: number, seconds: number) => number
) {
  let total = 0
  for (let i = 1; i < samples.length; i++) {
    const from = samples[i - 1]
    const to = samples[i]
    total += add(
      po2(oxygen, from.depth, water),
      po2(oxygen, to.depth, water),
      to.time - from.time
    )
  }
  return total
}

// The dive's own CNS %, unrounded, for the carry-over to build on. A dive
// without samples has neither figure.
export function diveCns(
  samples: readonly Sample[],
  oxygen: number,
  water: Water
) {
  return samples.length ? segments(samples, oxygen, water, cnsSegment) : null
}

// OTU per dive, with no carry-over.
export function diveOtu(
  samples: readonly Sample[],
  oxygen: number,
  water: Water
) {
  return samples.length
    ? lrint(segments(samples, oxygen, water, otuSegment))
    : null
}

export interface CnsDive {
  startTime: string
  // Seconds from the start to the dive's end (see diveEnd).
  end: number
  tripId: string | null
  // From diveCns; null without samples.
  cns: number | null
}

const twelveHours = 12 * 60 * 60

// CNS % at the end of `dive` with what is left from earlier dives: back while
// each ended within 12 hours of the next start (a trip dive skips other
// trips'), then forward halving every 90 min at the surface. Pass every dive
// that isn't deleted, ignored ones included, in the order written for ties.
export function cnsWithCarryOver(dive: CnsDive, dives: readonly CnsDive[]) {
  if (dive.cns == null) return null
  const when = localSeconds(dive.startTime)
  // Each start parsed once, as the server reruns this for every later dive.
  const earlier = dives
    .map((other) => ({ ...other, start: localSeconds(other.startTime) }))
    .filter((other) => other.start < when)
    .sort((a, b) => a.start - b.start)
  const counts = (other: CnsDive) =>
    !dive.tripId || other.tripId === dive.tripId

  let i = earlier.length
  let lastStart = when
  while (i--) {
    const other = earlier[i]
    if (!counts(other)) continue
    if (other.start + other.end + twelveHours < lastStart) break
    lastStart = other.start
  }

  let cns = 0
  let lastEnd: number | null = null
  const decay = (start: number) => {
    if (lastEnd != null) cns /= 2 ** ((start - lastEnd) / (90 * 60))
  }
  while (++i < earlier.length) {
    const other = earlier[i]
    if (!counts(other)) continue
    decay(other.start)
    cns += other.cns ?? 0
    lastEnd = other.start + other.end
  }
  decay(when)
  return lrint(cns + dive.cns)
}
