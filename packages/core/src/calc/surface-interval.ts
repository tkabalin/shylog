import { localSeconds } from "./time.ts"

export interface TimedDive {
  startTime: string
  // Seconds from the start to the dive's end (see diveEnd).
  end: number
}

// Shylog's own cap: Subsurface has none, but after two days the interval
// stops mattering and is shown as no previous dive.
const cap = 48 * 60 * 60

// Seconds from the end of the dive that started last before this one, 0 if
// it was still going, or "none" (get_surface_interval); a hand override wins.
// Pass every undeleted dive, ignored ones too, as written: of a tie, the later.
export function surfaceInterval(
  startTime: string,
  dives: readonly TimedDive[],
  override?: number | "none" | null
): number | "none" {
  if (override != null) return override
  const when = localSeconds(startTime)
  let previous: { start: number; end: number } | undefined
  for (const dive of dives) {
    const start = localSeconds(dive.startTime)
    if (start < when && (!previous || start >= previous.start)) {
      previous = { start, end: start + dive.end }
    }
  }
  if (!previous) return "none"
  const interval = Math.max(when - previous.end, 0)
  return interval > cap ? "none" : interval
}
