import type { Dive } from "@/data/db"

import { dayNumber } from "../../records"
import type { Pattern, Row, Words } from "../catalogue"
import { recordWords } from "../wording"

// Records always qualify and are never in the top three, so they carry no
// score and keep the spec's order. The sentence says it all, so they have
// no groups to open.
const found = (id: string, words: Words): Pattern => ({
  id: `record:${id}`,
  type: "record",
  measure: "record",
  field: id,
  score: 0,
  words,
  groups: [],
})

// Only the records the Records and averages card doesn't show: the
// deepest, longest and coldest dive and the longest streak are there.
export function records(rows: readonly Row[]): Pattern[] {
  const list = rows.map((row) => row.dive)
  const patterns: Pattern[] = []

  // The earlier month on a tie; one dive in a month is no record.
  const months = new Map<string, number>()
  for (const dive of list) {
    const month = dive.startTime.slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + 1)
  }
  let busiest: [string, number] | null = null
  for (const entry of months)
    if (!busiest || entry[1] > busiest[1]) busiest = entry
  if (busiest && busiest[1] > 1)
    patterns.push(found("month", recordWords.month(...busiest)))

  // Between consecutive dives by local date; the earlier gap on a tie.
  let gap: { days: number; from: Dive; to: Dive } | null = null
  for (let i = 1; i < list.length; i++) {
    const [from, to] = [list[i - 1]!, list[i]!]
    const days =
      dayNumber(to.startTime.slice(0, 10)) -
      dayNumber(from.startTime.slice(0, 10))
    if (days > 0 && (!gap || days > gap.days)) gap = { days, from, to }
  }
  if (gap)
    patterns.push(
      found(
        "gap",
        recordWords.gap(
          gap.days,
          gap.from.startTime.slice(0, 10),
          gap.to.startTime.slice(0, 10)
        )
      )
    )
  return patterns
}
