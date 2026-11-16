import { lrint } from "./round.ts"
import { localSeconds } from "./time.ts"

// The figures that depend on earlier dives: the surface interval
// (get_surface_interval) and CNS with carry-over (calculate_cns), both in
// Subsurface's core/divelist.cpp.

export interface LoggedDive {
  startTime: string
  // Seconds from the start to the dive's end (see diveEnd).
  end: number
  tripId: string | null
  // From diveCns; null without samples.
  cns: number | null
}

export interface PreviousDiveFigures {
  // Seconds from the end of the dive that started last before this one, 0
  // if it was still going, or "none".
  surfaceInterval: number | "none"
  // CNS % at the end of the dive; null without samples.
  cns: number | null
}

interface Started extends Omit<LoggedDive, "startTime"> {
  start: number
  index: number
}

// Shylog's own cap: Subsurface has none, but after two days the interval
// stops mattering and is shown as no previous dive.
const cap = 48 * 60 * 60
const twelveHours = 12 * 60 * 60

// Departure: capped, as only wrong data gets near it (100 % oxygen typed on
// a deep dive passes 10^20 %), where Subsurface's int overflows.
export const maxCns = 999

// Both figures for every dive, in the order given. Pass every dive that
// isn't deleted, ignored ones included, in the order written: of dives
// starting together, the later-written counts as the later.
export function previousDiveFigures(
  dives: readonly LoggedDive[]
): PreviousDiveFigures[] {
  // Each start parsed and sorted once, rather than per dive, so a write at a
  // thousand dives isn't seconds of date parsing. The sort is stable, and
  // only the fields used are copied, as the server passes whole rows.
  const log = dives
    .map(({ startTime, end, tripId, cns }, index): Started => ({
      start: localSeconds(startTime),
      end,
      tripId,
      cns,
      index,
    }))
    .sort((a, b) => a.start - b.start)
  const figures = new Array<PreviousDiveFigures>(dives.length)
  let first = 0
  log.forEach((dive, i) => {
    // Dives starting together are neither earlier nor later than each other.
    if (dive.start !== log[first].start) first = i
    const previous = log[first - 1]
    figures[dive.index] = {
      surfaceInterval: previous ? interval(previous, dive.start) : "none",
      cns: null,
    }
  })
  // A trip dive's CNS counts only its own trip's dives, so it is worked out
  // again from those.
  const trips = new Map<string, Started[]>()
  for (const dive of log) {
    if (!dive.tripId) continue
    const trip = trips.get(dive.tripId)
    if (trip) trip.push(dive)
    else trips.set(dive.tripId, [dive])
  }
  carryOver(log, figures)
  for (const trip of trips.values()) carryOver(trip, figures)
  return figures
}

function interval(previous: Started, start: number) {
  const seconds = Math.max(start - (previous.start + previous.end), 0)
  return seconds > cap ? "none" : seconds
}

// Sets the CNS % of each dive in `list`, which is in start order. Subsurface
// walks back from every dive while each ended within 12 hours of the next
// start, then forward; here that chain is one running total, so it is O(n).
function carryOver(list: readonly Started[], figures: PreviousDiveFigures[]) {
  let cns = 0
  let lastEnd: number | null = null
  // Halved for every 90 min at the surface since the last dive ended.
  const decayed = (start: number) =>
    lastEnd == null ? cns : cns / 2 ** ((start - lastEnd) / (90 * 60))
  let first = 0
  list.forEach((dive, i) => {
    if (dive.start !== list[first].start) {
      // The walk back from this start checks the dive written last at the
      // previous start first, then goes as far as that start's own walk.
      const last = list[i - 1]
      if (last.start + last.end + twelveHours < dive.start) {
        cns = 0
        lastEnd = null
      } else {
        for (const other of list.slice(first, i)) {
          cns = decayed(other.start) + (other.cns ?? 0)
          lastEnd = other.start + other.end
        }
      }
      first = i
    }
    figures[dive.index].cns =
      dive.cns == null
        ? null
        : Math.min(lrint(decayed(dive.start) + dive.cns), maxCns)
  })
}
