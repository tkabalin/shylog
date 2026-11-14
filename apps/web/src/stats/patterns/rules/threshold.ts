import { temperature } from "@/format/figures"

import { measures, type Pattern, type Row } from "../catalogue"
import { score } from "../score"
import { groupRow, thresholdWords } from "../wording"

const minimum = measures.cold.minimum

// Whether a ranking beats another, comparing from its first entry.
function ahead(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return false
}

// Feeling cold against the water temperature: dives below a lower whole
// degree on one side, above an upper one on the other, and those between
// left out. Each side needs four dives, 80% of them matching: cold below,
// not cold above.
export function threshold(rows: readonly Row[]): Pattern | null {
  const points = rows.flatMap((row) => {
    const cold = measures.cold.value(row)
    return cold == null || row.temperature == null
      ? []
      : [{ tenths: row.temperature, cold }]
  })
  if (points.length < 8) return null
  const tenths = points.map((p) => p.tenths)
  const from = Math.floor(Math.min(...tenths) / 10)
  const to = Math.ceil(Math.max(...tenths) / 10)
  let best: {
    low: number
    high: number
    below: { count: number; total: number }
    above: { count: number; total: number }
    rank: number[]
  } | null = null
  for (let low = from; low <= to; low++)
    for (let high = low; high <= to; high++) {
      const below = { count: 0, total: 0 }
      const above = { count: 0, total: 0 }
      for (const point of points) {
        const side =
          point.tenths < low * 10
            ? below
            : point.tenths > high * 10
              ? above
              : null
        if (!side) continue
        side.total++
        side.count += point.cold
      }
      if (below.total < 4 || above.total < 4) continue
      const shares = [
        below.count / below.total,
        (above.total - above.count) / above.total,
      ]
      if (Math.min(...shares) < 0.8) continue
      // The cleanest: the weaker side matching most, then the other side,
      // then the narrowest gap, then the most dives; the lowest cut-offs on
      // a tie, as they come first.
      const rank = [
        Math.min(...shares),
        Math.max(...shares),
        low - high,
        below.total + above.total,
      ]
      if (!best || ahead(rank, best.rank))
        best = { low, high, below, above, rank }
    }
  if (!best) return null
  const { low, high, below, above } = best
  // At least 0.6, as each side matches 80%, so always past the 20-point
  // minimum for shares.
  const effect = below.count / below.total - above.count / above.total
  const between = points.filter(
    (point) => point.tenths >= low * 10 && point.tenths <= high * 10
  ).length
  return {
    id: "threshold:cold:waterTemperature",
    type: "threshold",
    measure: measures.cold.group,
    // The field the duration rule bands, so the top three keeps them apart.
    field: "waterTemperatureBand",
    score: score(effect, minimum, Math.min(below.total, above.total)),
    words: thresholdWords(below, above, low, high),
    strip: {
      dives: points.map((point) => ({
        tenths: point.tenths,
        hit: point.cold === 1,
      })),
      cuts: [low, high],
    },
    // How many felt cold rather than a bare share, and the dives between
    // the cut-offs as left out, so the rows add up to the dives counted.
    groups: [
      groupRow(
        `Below ${temperature(low)} °C`,
        below.total,
        below.count ? `${below.count} cold` : "none cold"
      ),
      ...(between
        ? [
            {
              ...groupRow(
                low === high
                  ? `${temperature(low)} °C`
                  : `${temperature(low)} to ${temperature(high)} °C`,
                between,
                "left out"
              ),
              quiet: true as const,
            },
          ]
        : []),
      groupRow(
        `Above ${temperature(high)} °C`,
        above.total,
        above.count ? `${above.count} cold` : "none cold"
      ),
    ],
  }
}
