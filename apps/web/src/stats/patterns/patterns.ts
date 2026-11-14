import type { LogView } from "@/data/log"
import { year as yearOf } from "@/format/dates"

import { countedDives } from "../figures"
import {
  changes,
  differences,
  fieldsOf,
  rowsOf,
  trends,
  type Pattern,
} from "./catalogue"
import { change } from "./rules/change"
import { difference } from "./rules/difference"
import { habitsOf } from "./rules/habit"
import { records } from "./rules/record"
import { seasons } from "./rules/season"
import { threshold } from "./rules/threshold"
import { trend } from "./rules/trend"
import { byMeasure, topThree } from "./score"

// Every pattern the catalogue finds for a year (undefined for all time),
// the three Statistics shows, and the rest grouped for All patterns. A
// change looks at the year before, so it gets that year's rows too; no
// other year is worked out.
export function findPatterns(log: LogView, year: string | undefined) {
  const before = year && String(Number(year) - 1)
  const every = rowsOf(
    countedDives(log).filter(
      (dive) => !year || [year, before].includes(yearOf(dive.startTime))
    ),
    log
  )
  const rows = year
    ? every.filter((row) => yearOf(row.dive.startTime) === year)
    : every
  const fields = fieldsOf(log)
  const all = [
    ...differences.flatMap(([measure, list]) =>
      list.map((field) => difference(rows, measure, fields[field]))
    ),
    threshold(rows),
    ...changes.map((measure) => change(rows, every, year, measure)),
    ...habitsOf(rows, log),
    ...seasons(rows, log),
    ...records(rows),
  ].filter((pattern): pattern is Pattern => !!pattern)
  // One finding over time per measure: a trend only where no change was
  // found, as both say which way it went.
  for (const measure of trends) {
    if (all.some((p) => p.id === `change:${measure}`)) continue
    const found = trend(rows, year, measure)
    if (found) all.push(found)
  }
  return { all, top: topThree(all), groups: byMeasure(all) }
}

export type Patterns = ReturnType<typeof findPatterns>
