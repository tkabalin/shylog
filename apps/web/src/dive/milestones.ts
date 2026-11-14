// The dive numbers a save celebrates with the full burst of bubbles, each
// with a line saying what it means: the doors on the way to Divemaster and
// instructor, then recognition levels. No agency is named, as the lines
// are for fun rather than a standard to check against.
const milestones = [
  { number: 40, line: "Can start Divemaster training" },
  { number: 50, line: "Master Diver" },
  { number: 60, line: "Can qualify as a Divemaster" },
  { number: 100, line: "Century diver (can qualify as an instructor)" },
  { number: 250, line: "Elite diver" },
  { number: 500, line: "Gold diver" },
  { number: 750, line: "Platinum diver" },
  { number: 1000, line: "Diamond diver" },
] as const

export const milestoneFor = (number: number | null | undefined) =>
  milestones.find((milestone) => milestone.number === number) ?? null

interface Numbered {
  id: string
  number: number | null
  provisional?: number | null
  startTime: string
}

// Where the log stands: the milestones its numbered dives have passed, each
// with the dive that reached it, and the next with how far off it is, as a
// share of the way from the last one passed (or the first dive).
export function milestoneProgress(dives: readonly Numbered[]) {
  const byNumber = new Map<number, Numbered>()
  let highest = 0
  for (const dive of dives) {
    // A queued draft counts by the number it will get, as the Log shows it.
    const number = dive.number ?? dive.provisional
    if (number == null) continue
    byNumber.set(number, dive)
    highest = Math.max(highest, number)
  }
  const passed = milestones.flatMap((milestone) => {
    const dive = byNumber.get(milestone.number)
    return dive ? [{ ...milestone, dive }] : []
  })
  const next = milestones.find((milestone) => milestone.number > highest)
  if (!next) return { passed, next: null }
  const from = milestones.findLast((m) => m.number <= highest)?.number ?? 0
  return {
    passed,
    next: {
      ...next,
      toGo: next.number - highest,
      fraction: (highest - from) / (next.number - from),
    },
  }
}
