import type { Dive } from "@/data/db"

const window = 5

// Each dive's SAC rate in date order, with the average of the last five
// (fewer for the first four). Only dives with a rate come in, so a dive
// without one never drags the average.
export function sacTrend(rated: readonly { dive: Dive; sac: number }[]) {
  return rated.map(({ dive, sac }, i) => {
    const last = rated.slice(Math.max(0, i - window + 1), i + 1)
    return {
      dive,
      sac,
      average: last.reduce((sum, r) => sum + r.sac, 0) / last.length,
    }
  })
}

// How far the five-dive average moved from its first full window to the
// latest, or null until there is a sixth dive to move it.
export function trendChange(trend: ReturnType<typeof sacTrend>) {
  if (trend.length <= window) return null
  return {
    change: trend.at(-1)!.average - trend[window - 1]!.average,
    since: trend[0]!.dive.startTime,
  }
}
