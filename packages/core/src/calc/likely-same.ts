import { toMillimetres } from "./pressure.ts"
import { intDiv } from "./round.ts"
import { localSeconds } from "./time.ts"

export interface ComparableDive {
  startTime: string
  duration: number
  maxDepth: number
  averageDepth: number | null
}

// Subsurface's similar(): within `expected` or within 10 % of the larger.
// Two zeros match and a zero against a value doesn't.
function similar(a: number, b: number, expected: number) {
  if (!a && !b) return true
  if (!a || !b) return false
  const diff = Math.abs(a - b)
  return diff < expected || diff * 10 < Math.max(a, b)
}

// Subsurface's same-dive test (dive::likely_same in core/dive.cpp), on
// times already shifted by the day's clock offset: depths within 1 m or
// 10 %, durations within 5 min or 10 %, and starts no further apart than
// half the longer duration, but at least a minute.
export function likelySame(a: ComparableDive, b: ComparableDive): boolean {
  const averageA = a.averageDepth ? toMillimetres(a.averageDepth) : 0
  const averageB = b.averageDepth ? toMillimetres(b.averageDepth) : 0
  if (
    !similar(toMillimetres(a.maxDepth), toMillimetres(b.maxDepth), 1000) ||
    (averageA && averageB && !similar(averageA, averageB, 1000)) ||
    !a.duration ||
    !b.duration ||
    !similar(a.duration, b.duration, 5 * 60)
  )
    return false
  const fuzz = Math.max(intDiv(Math.max(a.duration, b.duration), 2), 60)
  return Math.abs(localSeconds(a.startTime) - localSeconds(b.startTime)) <= fuzz
}
