import type { ReadDive } from "../uddf/reader.ts"

export type LeftOut = "freedive" | "short"

// Subsurface's UDDF carries no dive mode, so a freedive is known by three
// signs together: no tank data, no gas, and no gap between samples over 2 s.
// A gauge dive has no gas either but is sampled every 10 or 20 s. With
// under two samples there is no gap to judge, so the dive is no freedive.
function isFreedive(dive: ReadDive) {
  return (
    !dive.hasTankData &&
    !dive.hasGas &&
    dive.samples.length > 1 &&
    dive.samples.every(
      (sample, i) => i === 0 || sample.time - dive.samples[i - 1].time <= 2
    )
  )
}

// Freedives, and the computer waking in shallow water for under a minute,
// are left out unless included in the review, and fingerprinted either way
// so a later import doesn't offer them again. The rules hold whatever the
// computer.
export function leftOut(dive: ReadDive): LeftOut | null {
  if (isFreedive(dive)) return "freedive"
  if (dive.duration < 60) return "short"
  return null
}
