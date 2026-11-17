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

// Each field's keys and each measure's values, worked out once per rows
// array and kept as long as it is. Only calls with the same rows array and
// Field object share them, as findPatterns' pairs do; others work them out.
const known = new WeakMap<readonly Row[], Map<Field | MeasureKey, unknown>>()

function once<T>(rows: readonly Row[], by: Field | MeasureKey, work: () => T) {
  let kept = known.get(rows)
  if (!kept) known.set(rows, (kept = new Map()))
  if (!kept.has(by)) kept.set(by, work())
  return kept.get(by) as T
}

// Each row's key for the field, a dive's several (buddies) without repeats,
// or null.
const keysOf = (rows: readonly Row[], field: Field) =>
  once(rows, field, () => {
    const keys: (Key | null)[] = []
    for (let i = 0; i < rows.length; i++) {
      const key = field.value(rows[i]!)
      // A copy only where a key repeats.
      keys.push(
        Array.isArray(key) &&
          key.length > 1 &&
          key.some((one, j) => key.indexOf(one) !== j)
          ? key.filter((one, j) => key.indexOf(one) === j)
          : key
      )
    }
    return keys
  })

// Each row's value for the measure times its weight, null where it has no
// value, and the weight.
const valuesOf = (rows: readonly Row[], key: MeasureKey) =>
  once(rows, key, () => {
    const measure = measures[key]
    const weigh = "weight" in measure ? measure.weight : () => 1
    const products: (number | null)[] = []
    const weights: number[] = []
    for (let i = 0; i < rows.length; i++) {
      const value = measure.value(rows[i]!)
      const weight = value == null ? 0 : weigh(rows[i]!)
      products.push(value == null ? null : value * weight)
      weights.push(weight)
    }
    return { products, weights }
  })

// A side's dives summed: value times weight, the weights, and the count.
interface Totals {
  sum: number
  weight: number
  count: number
}

const none: Totals = { sum: 0, weight: 0, count: 0 }

const plus = (a: Totals, b: Totals): Totals => ({
  sum: a.sum + b.sum,
  weight: a.weight + b.weight,
  count: a.count + b.count,
})

// The ways a field splits its dives in two, each with its first side's
// totals, a test for that side and the names of both sides. The totals are
// built from each key's, so no split walks the dives.
function splits(field: Field, byKey: Map<string, Totals>) {
  const order = field.order([...byKey.keys()])
  if (field.kind === "ordered") {
    // The upper levels first, as the sentence names them: "moderate or
    // stronger". A level the order leaves out counts as below.
    const rank = new Map(order.map((key, i) => [key, i]))
    const upper: Totals[] = []
    let total = none
    for (let i = order.length - 1; i > 0; i--)
      upper[i - 1] = total = plus(total, byKey.get(order[i]!) ?? none)
    return upper.map((first, i) => ({
      first,
      test: (key: Key) => (rank.get(key as string) ?? -1) > i,
      names: () => {
        const [below, above] = field.names(
          order.slice(0, i + 1),
          order.slice(i + 1)
        )
        return [above, below] as [Named, Named]
      },
    }))
  }
  return order.map((one) => ({
    first: byKey.get(one) ?? none,
    test: (key: Key) => (Array.isArray(key) ? key.includes(one) : key === one),
    names: () => field.names(one),
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
  const keys = keysOf(rows, field)
  const { products, weights } = valuesOf(rows, key)
  // One pass for every key's totals. A dive with several keys (buddies)
  // counts towards each, as each one's split puts it on that key's side.
  const all: Totals = { ...none }
  const byKey = new Map<string, Totals>()
  const add = (one: string, product: number, weight: number) => {
    let totals = byKey.get(one)
    if (!totals) byKey.set(one, (totals = { ...none }))
    totals.sum += product
    totals.weight += weight
    totals.count++
  }
  // The rows with both a key and a value, by their place in rows: plain
  // loops without a throwaway object per dive, as this runs once per log,
  // mostly before the JIT has optimised it.
  const points: number[] = []
  // Every dive's value times weight, unsigned, which bounds rounding below.
  let scale = 0
  for (let i = 0; i < rows.length; i++) {
    const keyed = keys[i]
    const product = products[i]
    if (keyed == null || product == null) continue
    const weight = weights[i]!
    points.push(i)
    all.sum += product
    all.weight += weight
    all.count++
    scale += Math.abs(product)
    if (typeof keyed === "string") add(keyed, product, weight)
    else for (let k = 0; k < keyed.length; k++) add(keyed[k]!, product, weight)
  }
  // Summed in another order than a walk of each side, these means can be off
  // in their last bits, enough to flip a cut-off or a tie, so they only rule
  // splits out; the rest are walked again. A sum's error is under n·ε of its
  // unsigned total; this bound is far wider, which only walks a few more.
  const tolerance = 64 * (points.length + 1) * Number.EPSILON
  const cutOff = (means: number[]) =>
    "relative" in measure
      ? Math.max(
          measure.minimum - 1e-9,
          measure.relative * Math.min(...means) - 1e-9
        )
      : measure.minimum - 1e-9
  const found = splits(field, byKey).flatMap((split) => {
    const { first } = split
    const sides = [
      first,
      {
        sum: all.sum - first.sum,
        weight: all.weight - first.weight,
        count: all.count - first.count,
      },
    ]
    if (sides[0]!.count < 5 || sides[1]!.count < 5) return []
    const means = sides.map((side) => side.sum / side.weight)
    const effect = Math.abs(means[0]! - means[1]!)
    // How far the walk's effect, and its cut-off, can be from this one.
    const bound = sides.reduce(
      (sum, side, i) =>
        sum +
        (tolerance * (scale + Math.abs(means[i]!) * all.weight)) / side.weight,
      0
    )
    const least = cutOff(means)
    return effect + 2 * bound < least
      ? []
      : [{ split, effect, bound, passes: effect - 2 * bound >= least }]
  })
  // The least the best qualifying difference can be: a split further below
  // it can't be the best, even on a tie.
  const floor = Math.max(
    ...found.filter((f) => f.passes).map((f) => f.effect - f.bound)
  )
  let best: {
    effect: number
    sides: [Row[], Row[]]
    means: [number, number]
    names: [Named, Named]
  } | null = null
  for (const { split, effect: estimate, bound } of found) {
    if (estimate + bound < floor) continue
    const sides: [Row[], Row[]] = [[], []]
    for (const i of points) sides[split.test(keys[i]!) ? 0 : 1].push(rows[i]!)
    const means = sides.map((side) => average(measure, side)!) as [
      number,
      number,
    ]
    const effect = Math.abs(means[0] - means[1])
    if (effect < cutOff(means)) continue
    // The first in the field's order on a tie.
    if (!best || effect > best.effect)
      best = { effect, sides, means, names: split.names() }
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
