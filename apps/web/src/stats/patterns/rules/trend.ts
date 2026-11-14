import { measures, type MeasureKey, type Pattern, type Row } from "../catalogue"
import { score } from "../score"
import { figure, shortDay, trendWords, type Averaged } from "../wording"

// A least-squares line through the dives in order, as the SAC chart's Dive
// no. axis spaces them (against dates, a gap of years read as a climb), its
// effect the change from first to last, over the sixteen dives a change needs.
export function trend(
  rows: readonly Row[],
  year: string | undefined,
  key: MeasureKey
): Pattern | null {
  const measure = measures[key]
  const rated = rows.filter((row) => measure.value(row) != null)
  const n = rated.length
  if (n < 16) return null
  const ys = rated.map((row) => measure.value(row)!)
  const mx = (n - 1) / 2
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (i - mx) * (ys[i]! - my)
    sxx += (i - mx) ** 2
  }
  const slope = sxy / sxx
  // The line's ends, never below nothing as none of these measures can be;
  // the bar is judged on the change between them, which the sentence says.
  const [from, to] = [my - slope * mx, my + slope * mx].map((value) =>
    Math.max(0, value)
  ) as [number, number]
  const effect = Math.abs(to - from)
  if (effect < measure.minimum - 1e-9) return null
  // Against the lower end, as a difference is against the lower group.
  if (
    "relative" in measure &&
    effect < measure.relative * Math.min(from, to) - 1e-9
  )
    return null
  const [first, last] = [rated[0]!, rated[n - 1]!].map((row) =>
    row.dive.startTime.slice(0, 10)
  )
  const end = (label: string, date: string, value: number) => ({
    label,
    detail: shortDay(date),
    ...figure(key, value),
  })
  return {
    id: `trend:${key}`,
    type: "trend",
    measure: measure.group,
    field: "time",
    score: score(effect, measure.minimum, Math.floor(n / 2)),
    words: trendWords(key as Averaged, from, to, first!, year),
    rising: to > from,
    // The line's two ends, which the sentence compares, latest first as a
    // change lists its periods: the line's values, not those dives' own.
    groups: [
      end("Trend now", last!, to),
      end("Trend at the start", first!, from),
    ],
  }
}
