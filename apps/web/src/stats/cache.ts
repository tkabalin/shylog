import type { LogView } from "@/data/log"

import { statistics, type Statistics } from "./figures"

// Worked out on first visit and kept until the log changes. The key is the
// in-memory log itself rather than its version string, since a draft saved
// offline changes the log without changing the server's version.
const cache = new WeakMap<LogView, Map<string, Statistics>>()

export function cachedStatistics(
  log: LogView,
  year: string | undefined,
  today: string
) {
  let byYear = cache.get(log)
  if (!byYear) cache.set(log, (byYear = new Map()))
  // The day is in the key, as running streaks and the anniversary move with it.
  const key = `${year ?? "all"} ${today}`
  let stats = byYear.get(key)
  if (!stats) byYear.set(key, (stats = statistics(log, year, today)))
  return stats
}
