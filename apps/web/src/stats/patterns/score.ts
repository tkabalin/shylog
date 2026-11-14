import type { Pattern } from "./catalogue"

// How far past its minimum a finding is, weighted by how many dives back
// it: the smaller group's count, square-rooted, so a big effect on five
// dives doesn't beat a solid one on fifty.
export const score = (effect: number, minimum: number, smallest: number) =>
  (effect / minimum) * Math.sqrt(smallest)

// Highest score first, then by rule id, so the order only changes when
// the data does.
export const byScore = (a: Pattern, b: Pattern) =>
  b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// The three Statistics shows, one per measure and field: never a record or
// habit, which other cards repeat, nor SAC rate over time, where a second
// figure beside Air consumption's own average read as a contradiction.
const leads = (pattern: Pattern) =>
  pattern.type !== "record" &&
  pattern.type !== "habit" &&
  !(
    pattern.measure === "sac" &&
    (pattern.type === "trend" || pattern.type === "change")
  )

export function topThree(patterns: readonly Pattern[]) {
  const measures = new Set<string>()
  const fields = new Set<string>()
  const top: Pattern[] = []
  for (const pattern of [...patterns].sort(byScore)) {
    if (top.length === 3) break
    if (!leads(pattern)) continue
    if (measures.has(pattern.measure) || fields.has(pattern.field)) continue
    measures.add(pattern.measure)
    fields.add(pattern.field)
    top.push(pattern)
  }
  return top
}

// All patterns, grouped by measure, each group led by its best pattern
// and ordered by it, with habits and records last as groups of their own.
// Records keep the order they were found in, which is the spec's.
export function byMeasure(patterns: readonly Pattern[]) {
  const groups = new Map<string, Pattern[]>()
  const sorted = [
    ...patterns.filter((p) => p.type !== "record").sort(byScore),
    ...patterns.filter((p) => p.type === "record"),
  ]
  for (const pattern of sorted) {
    const key =
      pattern.type === "habit"
        ? "habits"
        : pattern.type === "record"
          ? "records"
          : pattern.measure
    const list = groups.get(key)
    if (list) list.push(pattern)
    else groups.set(key, [pattern])
  }
  const last = (key: string) =>
    key === "habits" ? 1 : key === "records" ? 2 : 0
  return [...groups]
    .map(([measure, list]) => ({ measure, patterns: list }))
    .sort((a, b) => last(a.measure) - last(b.measure))
}
