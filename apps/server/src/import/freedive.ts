import type { ReadDive } from "../uddf/reader.ts"

export type LeftOut = "freedive" | "short"

// What the rules look at.
export type Signs = Pick<
  ReadDive,
  "hasTankData" | "hasGas" | "samples" | "duration"
>

// Subsurface's UDDF carries no dive mode, so a freedive is known by three
// signs together: no tank data, no gas, and no gap between samples over 2 s.
// A gauge dive has no gas either but is sampled every 10 or 20 s. With
// under two samples there is no gap to judge, so the dive is no freedive.
function isFreedive(dive: Signs) {
  return (
    !dive.hasTankData &&
    !dive.hasGas &&
    dive.samples.length > 1 &&
    dive.samples.every(
      (sample, i) => i === 0 || sample.time - dive.samples[i - 1].time <= 2
    )
  )
}

// Under five minutes is a blip, such as a weight check or the swim back:
// the owner's shortest real dive is 15 minutes, the longest blip 3.
export const isShort = (duration: number) => duration < 5 * 60

// Freedives and blips are left out unless included in the review (a blip a
// logged dive matches pairs instead), and fingerprinted either way, so a
// later import doesn't offer them again. The rules hold whatever computer.
export function leftOut(dive: Signs): LeftOut | null {
  if (isFreedive(dive)) return "freedive"
  if (isShort(dive.duration)) return "short"
  return null
}
