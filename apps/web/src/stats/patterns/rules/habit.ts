import { isUnknown } from "@/data/entities"
import type { LogView } from "@/data/log"

import { percent } from "../../charts/parts"
import type { Pattern, Row } from "../catalogue"
import { score } from "../score"
import { groupRow, habitWords } from "../wording"

interface Habit {
  field: string
  // The dive's values, none when it has none.
  values: (row: Row) => string[]
  name: (key: string) => string
  rest: (key: string) => string
}

// Time of day, entry and gas are left out: the Habits answers already say
// them ("Mostly mornings", "Air on every dive").
function habits(log: LogView): Habit[] {
  const person = (id: string) => log.people.get(id)?.name ?? ""
  const centre = (id: string) => log.diveCentres.get(id)?.name ?? ""
  return [
    {
      field: "site",
      // The Unknown site is where an import leaves dives, not a place.
      values: (row) =>
        isUnknown(log, row.dive.siteId) ? [] : [row.dive.siteId],
      name: (id) => log.sites.get(id)?.name ?? "",
      rest: () => "Other sites",
    },
    {
      field: "region",
      // Over every dive, as a site with no region is still one of "your
      // dives"; it just has no region to be the habit.
      values: (row) => (row.regionId ? [row.regionId] : []),
      name: (id) => log.regions.get(id)?.name ?? "",
      rest: () => "Other regions",
    },
    {
      field: "diveCentre",
      values: (row) => (row.dive.diveCentreId ? [row.dive.diveCentreId] : []),
      name: centre,
      rest: (id) => `Without ${centre(id)}`,
    },
    {
      field: "buddy",
      values: (row) => row.links.buddies,
      name: person,
      rest: (id) => `Without ${person(id)}`,
    },
  ]
}

// A value on at least 60% of at least ten dives, out of every dive, as
// none of these fields has a "not logged".
export function habitsOf(rows: readonly Row[], log: LogView): Pattern[] {
  return habits(log).flatMap((habit) => {
    const counts = new Map<string, number>()
    const total = rows.length
    for (const row of rows)
      for (const value of habit.values(row))
        counts.set(value, (counts.get(value) ?? 0) + 1)
    if (total < 10) return []
    // The most dives, the first found on a tie, as rows come oldest first.
    let top: [string, number] | null = null
    for (const entry of counts) if (!top || entry[1] > top[1]) top = entry
    if (!top || top[1] / total < 0.6) return []
    const [key, count] = top
    const share = { count, total }
    return [
      {
        id: `habit:${habit.field}`,
        type: "habit",
        measure: "habit",
        field: habit.field,
        score: score(count / total, 0.6, count),
        words: habitWords(habit.field, habit.name(key), share),
        // The rest only when there are any: "Other regions, 0 dives"
        // compares against nothing.
        groups: [
          groupRow(habit.name(key), count, percent(count, total)),
          ...(count < total
            ? [
                groupRow(
                  habit.rest(key),
                  total - count,
                  percent(total - count, total)
                ),
              ]
            : []),
        ],
      },
    ]
  })
}
