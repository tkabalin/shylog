import type { LogView } from "@/data/log"
import { temperature } from "@/format/figures"

import { fullMonths } from "../../charts/parts"
import { measures, type Pattern, type Row } from "../catalogue"
import { score } from "../score"
import { groupRow, seasonWords } from "../wording"

const minimum = measures.waterTemperature.minimum

// Each region's warmest month against its coldest, months taken across
// years, from at least five dives with a water temperature in each.
export function seasons(rows: readonly Row[], log: LogView): Pattern[] {
  const byRegion = new Map<string, Map<number, number[]>>()
  for (const row of rows) {
    if (!row.regionId || row.temperature == null) continue
    const months = byRegion.get(row.regionId) ?? new Map<number, number[]>()
    byRegion.set(row.regionId, months)
    const month = Number(row.dive.startTime.slice(5, 7))
    const temps = months.get(month)
    if (temps) temps.push(row.temperature)
    else months.set(month, [row.temperature])
  }
  return [...byRegion].flatMap(([regionId, months]) => {
    // January first, each month's average in degrees from its tenths.
    const year = Array.from({ length: 12 }, (_, i) => {
      const temps = months.get(i + 1) ?? []
      return {
        month: i + 1,
        count: temps.length,
        mean: temps.length
          ? temps.reduce((a, b) => a + b, 0) / temps.length / 10
          : null,
      }
    })
    const means = year.flatMap((m) =>
      m.count >= 5 ? [{ ...m, mean: m.mean! }] : []
    )
    if (means.length < 2) return []
    // The earlier month on a tie.
    const warm = means.reduce((a, b) => (b.mean > a.mean ? b : a))
    const cold = means.reduce((a, b) => (b.mean < a.mean ? b : a))
    const effect = warm.mean - cold.mean
    if (effect < minimum - 1e-9) return []
    const region = log.regions.get(regionId)?.name ?? ""
    const [hot, chill] = [warm, cold].map((m) => fullMonths[m.month - 1]!)
    return [
      {
        id: `season:waterTemperature:${regionId}`,
        type: "season",
        measure: measures.waterTemperature.group,
        field: "month",
        score: score(effect, minimum, Math.min(warm.count, cold.count)),
        words: seasonWords(region, [warm.mean, cold.mean], hot!, chill!),
        // Every month the region has a reading in, so the two compared sit
        // in its year; months under five dives are drawn but can't count.
        chart: {
          kind: "months",
          months: year.map((m) => ({
            average: m.mean,
            count: m.count,
            marked: m.month === warm.month || m.month === cold.month,
          })),
        },
        groups: [
          groupRow(hot!, warm.count, temperature(warm.mean), "°C"),
          groupRow(chill!, cold.count, temperature(cold.mean), "°C"),
        ],
      },
    ]
  })
}
