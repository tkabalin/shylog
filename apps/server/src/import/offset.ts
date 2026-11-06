import { likelySame, localSeconds } from "@shylog/core"

import { pairDay, type HandDive, type ShiftedDive } from "./pairing.ts"

// Wide enough for any two time zones a trip spans from home.
const widest = 14 * 60

// Moves a wall-clock time by whole minutes. Date only does the arithmetic:
// the time has no zone, and none is applied.
export const shift = (startTime: string, minutes: number) =>
  new Date((localSeconds(startTime) + minutes * 60) * 1000)
    .toISOString()
    .slice(0, 19)

export const dateOf = (startTime: string) => startTime.slice(0, 10)

// Halves round away from zero, so a clock ahead and one behind by the same
// amount get the same size of offset.
const toFifteen = (minutes: number) =>
  Math.sign(minutes) * Math.round(Math.abs(minutes) / 15) * 15 + 0
const dayNumber = (date: string) => localSeconds(`${date}T00:00:00`) / 86400

const shifted = (dive: ShiftedDive, minutes: number) => ({
  ...dive,
  startTime: shift(dive.startTime, minutes),
})

export interface Estimates {
  offsets: Map<string, number>
  // The day whose hand dives each computer dive paired with in the estimate.
  claimed: Map<string, string>
}

// The clock offset, in minutes, for each hand-logged day: of the offsets a
// similar hand and computer dive suggest, the one pairing most of the day's
// hand dives, the smallest on a tie. A day where none pairs is left out.
export function estimateOffsets(
  hands: readonly HandDive[],
  computers: readonly ShiftedDive[]
): Estimates {
  const byDate = new Map<string, HandDive[]>()
  for (const hand of hands) {
    const date = dateOf(hand.startTime)
    byDate.set(date, [...(byDate.get(date) ?? []), hand])
  }
  const offsets = new Map<string, number>()
  const claimed = new Map<string, string>()
  for (const [date, dayHands] of [...byDate].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    // A dive an earlier day paired with stays there, so it can't decide
    // this day's offset either. Only dives within the widest shift (plus a
    // rounding step) of the day can land on it.
    const from = dayNumber(date) * 86400 - (widest + 15) * 60
    const to = from + 86400 + 2 * (widest + 15) * 60
    const free = computers.filter((computer) => {
      const start = localSeconds(computer.startTime)
      return !claimed.has(computer.ref) && start >= from && start < to
    })
    const suggested = new Set<number>()
    for (const hand of dayHands) {
      for (const computer of free) {
        const offset = toFifteen(
          (localSeconds(hand.startTime) - localSeconds(computer.startTime)) / 60
        )
        if (
          Math.abs(offset) <= widest &&
          likelySame(hand, { ...computer, startTime: hand.startTime })
        )
          suggested.add(offset)
      }
    }
    let best = { offset: 0, pairs: new Map() as ReturnType<typeof pairDay> }
    for (const offset of [...suggested].sort(
      (a, b) => Math.abs(a) - Math.abs(b) || a - b
    )) {
      const onDay = free
        .map((computer) => shifted(computer, offset))
        .filter((computer) => dateOf(computer.startTime) === date)
      const pairs = pairDay(dayHands, onDay)
      if (pairs.size > best.pairs.size) best = { offset, pairs }
    }
    if (!best.pairs.size) continue
    offsets.set(date, best.offset)
    for (const ref of best.pairs.keys()) claimed.set(ref, date)
  }
  return { offsets, claimed }
}

// The offset of the estimated day nearest a date, the earlier on a tie, or
// none when no day could be estimated.
function nearest(estimates: ReadonlyMap<string, number>, date: string) {
  let best: { distance: number; date: string } | null = null
  for (const estimated of estimates.keys()) {
    const distance = Math.abs(dayNumber(estimated) - dayNumber(date))
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && estimated < best.date)
    )
      best = { distance, date: estimated }
  }
  return best ? estimates.get(best.date)! : 0
}

// Puts each computer dive on a day, in order, and gives each day its offset.
// A dive goes to the day whose hand dives it paired with, else to an
// estimated day it lands on with that day's offset, else to the day the
// estimate nearest its own date puts it on, which then takes that offset.
// Only clocks that disagree by hours on neighbouring days can still leave a
// dive starting off its day, for the review's clock sheet to put right.
export function planDays(
  computers: readonly { ref: string; startTime: string }[],
  { offsets, claimed }: Estimates
) {
  const ordered = [...offsets.keys()].sort()
  const dayOffsets = new Map(offsets)
  const dayOf = new Map<string, string>()
  const inOrder = computers.toSorted(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) || a.ref.localeCompare(b.ref)
  )
  for (const computer of inOrder) {
    const landsOn = (date: string) =>
      dateOf(shift(computer.startTime, dayOffsets.get(date)!)) === date
    let day = claimed.get(computer.ref) ?? ordered.find(landsOn)
    if (!day) {
      const offset = nearest(offsets, dateOf(computer.startTime))
      day = dateOf(shift(computer.startTime, offset))
      if (!dayOffsets.has(day)) dayOffsets.set(day, offset)
    }
    dayOf.set(computer.ref, day)
  }
  const days = [...new Set(dayOf.values())]
    .sort()
    .map((date) => ({ date, offset: dayOffsets.get(date)! }))
  return { dayOf, days }
}
