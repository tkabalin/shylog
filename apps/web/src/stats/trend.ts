import type { Dive } from "@/data/db"
import { months } from "@/format/dates"

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

// Round ticks from low to high: the widest step that gives two, else 1.
export function roundTicks(low: number, high: number, steps: number[]) {
  const ticksOf = (step: number) =>
    Array.from(
      {
        length: Math.max(
          0,
          Math.floor(high / step) - Math.ceil(low / step) + 1
        ),
      },
      (_, i) => (Math.ceil(low / step) + i) * step
    )
  return steps.map(ticksOf).find((ticks) => ticks.length >= 2) ?? ticksOf(1)
}

// Linear between the two nearest sorted rates, so the median agrees with the
// figure above the chart.
function quantiles(rates: readonly number[]) {
  const sorted = [...rates].sort((a, b) => a - b)
  const quantile = (p: number) => {
    const at = (sorted.length - 1) * p
    const below = sorted[Math.floor(at)]!
    return below + (sorted[Math.ceil(at)]! - below) * (at - Math.floor(at))
  }
  return { sorted, quantile }
}

// The rate axis, its top above the averages but not a far-off rate, which is
// pinned to it: Tukey's "far out" (three interquartile ranges over the upper
// quartile), never under twice the median, as equal rates have no spread.
export function rateScale(
  rates: readonly number[],
  averages: readonly number[] = []
) {
  const { sorted, quantile } = quantiles(rates)
  const q3 = quantile(0.75)
  const fence = Math.max(q3 + 3 * (q3 - quantile(0.25)), 2 * quantile(0.5))
  const shown = sorted.filter((rate) => rate <= fence)
  // Never below 0, which a rate under 1 L/min would otherwise take it to.
  const low = Math.max(0, Math.floor(shown[0]!) - 1)
  const high = Math.ceil(Math.max(shown.at(-1)!, ...averages)) + 1
  return { low, high, ticks: roundTicks(low, high, [20, 10, 5, 2]) }
}

// Tukey's box plot: the quartiles, whiskers to the furthest rates within one
// and a half interquartile ranges of the box, and the rates past them.
export function boxPlot(rates: readonly number[]) {
  const { sorted, quantile } = quantiles(rates)
  const q1 = quantile(0.25)
  const q3 = quantile(0.75)
  const reach = 1.5 * (q3 - q1)
  const inside = (rate: number) => rate >= q1 - reach && rate <= q3 + reach
  const whiskers = sorted.filter(inside)
  return {
    q1,
    median: quantile(0.5),
    q3,
    low: whiskers[0]!,
    high: whiskers.at(-1)!,
    outliers: sorted.filter((rate) => !inside(rate)),
  }
}

// The time axis, from the first rated dive's month to the end of the last's,
// so months without a rate aren't empty space. At most four labels on round
// months, the year on the first and on each January unless one year is shown.
export function timeAxis(first: string, last: string, oneYear = false) {
  const monthOf = (date: string) =>
    Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
  const start = monthOf(first)
  const end = monthOf(last) + 1
  const day = (month: number) =>
    Date.UTC(Math.floor(month / 12), month % 12, 1) / 86_400_000
  const step =
    [1, 3, 6, 12, 24, 60, 120].find((s) => (end - start) / s <= 4) ?? 240
  const marks: number[] = []
  // Inside the ends only, where a label is cut off by the plot's edge.
  for (let m = Math.ceil((start + 1) / step) * step; m < end; m += step)
    marks.push(m)
  const label = (m: number, i: number) => {
    const year = String(Math.floor(m / 12))
    if (step >= 12) return year
    const month = months[m % 12]!
    return !oneYear && (i === 0 || m % 12 === 0) ? `${month} ${year}` : month
  }
  return {
    domain: [day(start), day(end)] as const,
    // A single month has no round month inside it: its name in the middle.
    ticks: marks.length
      ? marks.map((m, i) => ({ value: day(m), label: label(m, i) }))
      : [{ value: (day(start) + day(end)) / 2, label: label(start, 0) }],
  }
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
