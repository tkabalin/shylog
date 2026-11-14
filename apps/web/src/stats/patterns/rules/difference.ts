import { percent } from "../../charts/parts"
import {
  average,
  measures,
  type Field,
  type MeasureKey,
  type Named,
  type Pattern,
  type Row,
} from "../catalogue"
import { score } from "../score"
import {
  differenceWords,
  figure,
  groupRow,
  shareWords,
  axisUnit,
  inUnits,
  type Averaged,
} from "../wording"

type Key = string | string[]

// The ways a field splits its dives in two, each with a test for the first
// side and the names of both sides.
function splits(field: Field, keys: Key[]) {
  const present = [...new Set(keys.flat())]
  const order = field.order(present)
  if (field.kind === "ordered")
    // The upper levels first, as the sentence names them: "moderate or
    // stronger".
    return order.slice(1).map((_, i) => {
      const upper = new Set(order.slice(i + 1))
      const [below, above] = field.names(
        order.slice(0, i + 1),
        order.slice(i + 1)
      )
      return {
        test: (key: Key) => upper.has(key as string),
        names: [above, below] as [Named, Named],
      }
    })
  return order.map((one) => ({
    test: (key: Key) => (Array.isArray(key) ? key.includes(one) : key === one),
    names: field.names(one),
  }))
}

// The measure's biggest qualifying difference between two groups of the
// field, each of at least five dives, or null.
export function difference(
  rows: readonly Row[],
  key: MeasureKey,
  field: Field
): Pattern | null {
  const measure = measures[key]
  const points = rows.flatMap((row) => {
    const value = field.value(row)
    return value == null || measure.value(row) == null
      ? []
      : [{ row, key: value }]
  })
  let best: {
    effect: number
    sides: [Row[], Row[]]
    means: [number, number]
    names: [Named, Named]
  } | null = null
  for (const { test, names } of splits(
    field,
    points.map((p) => p.key)
  )) {
    const sides: [Row[], Row[]] = [[], []]
    for (const point of points) sides[test(point.key) ? 0 : 1].push(point.row)
    if (sides[0].length < 5 || sides[1].length < 5) continue
    const means = sides.map((side) => average(measure, side)!) as [
      number,
      number,
    ]
    const effect = Math.abs(means[0] - means[1])
    if (effect < measure.minimum - 1e-9) continue
    if (
      "relative" in measure &&
      effect < measure.relative * Math.min(...means) - 1e-9
    )
      continue
    // The first in the field's order on a tie.
    if (!best || effect > best.effect) best = { effect, sides, means, names }
  }
  if (!best) return null
  const { effect, sides, means, names } = best
  // A share's dives with the outcome, as a share's value is 0 or 1.
  const shares = sides.map((side) => ({
    count: side.filter((row) => measure.value(row) === 1).length,
    total: side.length,
  })) as [{ count: number; total: number }, { count: number; total: number }]
  return {
    id: `difference:${key}:${field.key}`,
    type: "difference",
    measure: measure.group,
    field: field.key,
    score: score(
      effect,
      measure.minimum,
      Math.min(...shares.map((s) => s.total))
    ),
    words:
      "share" in measure
        ? shareWords(key, shares, names)
        : differenceWords(key as Averaged, means, names[0]),
    // Each group's dives along the measure, so a difference six steady
    // dives make reads apart from one a single bad dive makes.
    chart:
      "share" in measure
        ? undefined
        : {
            kind: "lanes",
            unit: axisUnit(key as Averaged),
            lanes: sides.map((side, i) => ({
              values: side.map((row) => inUnits(key, measure.value(row)!)),
              average: inUnits(key, means[i]!),
            })),
          },
    groups: shares.map(({ count, total }, i) => {
      if ("share" in measure)
        return groupRow(names[i]!.label, total, percent(count, total))
      const { value, unit } = figure(key, means[i]!)
      return groupRow(names[i]!.label, total, value, unit)
    }),
  }
}
