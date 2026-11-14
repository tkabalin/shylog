import { year as yearOf } from "@/format/dates"

import { percent } from "../../charts/parts"
import {
  average,
  measures,
  type MeasureKey,
  type Pattern,
  type Row,
} from "../catalogue"
import { score } from "../score"
import { changeWords, figure, groupRow, type Periods } from "../wording"

export interface Period {
  label: string
  rows: Row[]
}

// Dives in two halves by start time, the later half taking the middle dive
// of an odd count. Rows come oldest first.
export function halves(rows: Row[]): [Period, Period] {
  const middle = Math.floor(rows.length / 2)
  return [
    { label: "Earlier dives", rows: rows.slice(0, middle) },
    { label: "Later dives", rows: rows.slice(middle) },
  ]
}

// A year's average or share against the year before's, or for all time
// the later half of the log's against the earlier half's, with at least
// eight dives with the measure in each.
export function change(
  rows: readonly Row[],
  everyRow: readonly Row[],
  year: string | undefined,
  key: MeasureKey
): Pattern | null {
  const measure = measures[key]
  const withMeasure = (list: readonly Row[]) =>
    list.filter((row) => measure.value(row) != null)
  let earlier: Period
  let later: Period
  let periods: Periods
  if (year) {
    const before = String(Number(year) - 1)
    earlier = {
      label: before,
      rows: withMeasure(
        everyRow.filter((row) => yearOf(row.dive.startTime) === before)
      ),
    }
    later = { label: year, rows: withMeasure(rows) }
    periods = { year, before }
  } else {
    ;[earlier, later] = halves(withMeasure(rows))
    periods = { later: later.rows.length, earlier: earlier.rows.length }
  }
  if (earlier.rows.length < 8 || later.rows.length < 8) return null
  const then = average(measure, earlier.rows)!
  const now = average(measure, later.rows)!
  const effect = Math.abs(now - then)
  if (effect < measure.minimum - 1e-9) return null
  if (
    "relative" in measure &&
    effect < measure.relative * Math.min(now, then) - 1e-9
  )
    return null
  const share = (period: Period) => ({
    count: period.rows.filter((row) => measure.value(row) === 1).length,
    total: period.rows.length,
  })
  return {
    id: `change:${key}`,
    type: "change",
    measure: measure.group,
    field: "year",
    score: score(
      effect,
      measure.minimum,
      Math.min(earlier.rows.length, later.rows.length)
    ),
    words: changeWords(
      key,
      now,
      then,
      periods,
      "share" in measure ? [share(later), share(earlier)] : undefined
    ),
    groups: [later, earlier].map((period) => {
      if ("share" in measure) {
        const { count, total } = share(period)
        return groupRow(period.label, total, percent(count, total))
      }
      const { value, unit } = figure(key, average(measure, period.rows)!)
      return groupRow(period.label, period.rows.length, value, unit)
    }),
  }
}
