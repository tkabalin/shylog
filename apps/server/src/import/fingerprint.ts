import { toMillimetres } from "@shylog/core"

import type { ReadDive } from "../uddf/reader.ts"

// How a later import recognises a computer dive it has seen: the start on
// the computer's own clock, before any day's offset, so a changed offset
// can't hide it, then duration and max depth. Depth goes in whole mm, so a
// re-export writing 32.660 for 32.66 still matches.
export const fingerprint = (
  dive: Pick<ReadDive, "startTime" | "duration" | "maxDepth">
) => `${dive.startTime} ${dive.duration} ${toMillimetres(dive.maxDepth)}`
