import type { LogView } from "@/data/log"

import { statistics, type Statistics } from "./figures"
import { findPatterns, type Patterns } from "./patterns/patterns"

// Worked out on first visit and kept until the log changes. The key is the
// in-memory log itself rather than its version string, since a draft saved
// offline changes the log without changing the server's version.
const cache = new WeakMap<LogView, Map<string, Statistics>>()
const patternCache = new WeakMap<LogView, Map<string, Patterns>>()

function cached<T>(
  store: WeakMap<LogView, Map<string, T>>,
  log: LogView,
  key: string,
  work: () => T
) {
  let byKey = store.get(log)
  if (!byKey) store.set(log, (byKey = new Map()))
  let value = byKey.get(key)
  if (!value) byKey.set(key, (value = work()))
  return value
}

// The day is in the key, as running streaks and the anniversary move with it.
export const cachedStatistics = (
  log: LogView,
  year: string | undefined,
  today: string
) =>
  cached(cache, log, `${year ?? "all"} ${today}`, () =>
    statistics(log, year, today)
  )

// Kept apart from the figures, so the screen's first frame doesn't wait on
// the catalogue: the Patterns section renders a painted frame later. None
// moves with the day, so the year alone keys them.
export const cachedPatterns = (log: LogView, year: string | undefined) =>
  cached(patternCache, log, year ?? "all", () => findPatterns(log, year))
