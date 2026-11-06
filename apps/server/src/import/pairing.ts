import {
  likelySame,
  localSeconds,
  type ComparableDive,
  type DiveId,
} from "@shylog/core"

export interface HandDive extends ComparableDive {
  id: DiveId
}

// A computer dive with its start already shifted to site time.
export interface ShiftedDive extends ComparableDive {
  ref: string
}

const gap = (a: ComparableDive, b: ComparableDive) =>
  Math.abs(localSeconds(a.startTime) - localSeconds(b.startTime))

// One day's pairs, by closest start among those that pass Subsurface's
// same-dive test, each dive in one pair at most. Ties go to the earlier
// hand dive, then the earlier computer dive, so a proposal never depends
// on the order the rows came in. Keyed by the computer dive's ref.
export function pairDay(
  hands: readonly HandDive[],
  computers: readonly ShiftedDive[]
): Map<string, DiveId> {
  const candidates = hands
    .flatMap((hand) =>
      computers
        .filter((computer) => likelySame(hand, computer))
        .map((computer) => ({ hand, computer, gap: gap(hand, computer) }))
    )
    .sort(
      (a, b) =>
        a.gap - b.gap ||
        a.hand.startTime.localeCompare(b.hand.startTime) ||
        a.computer.startTime.localeCompare(b.computer.startTime)
    )
  const pairs = new Map<string, DiveId>()
  const taken = new Set<DiveId>()
  for (const { hand, computer } of candidates) {
    if (pairs.has(computer.ref) || taken.has(hand.id)) continue
    pairs.set(computer.ref, hand.id)
    taken.add(hand.id)
  }
  return pairs
}

// How far, in seconds, the nearest of the day's computer dives starts from
// a hand dive no computer dive was paired with; null on a day with none.
export function nearestStartGap(
  hand: HandDive,
  computers: readonly ShiftedDive[]
): number | null {
  return computers.length
    ? Math.min(...computers.map((computer) => gap(hand, computer)))
    : null
}
