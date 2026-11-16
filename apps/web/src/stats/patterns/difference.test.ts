// @vitest-environment node
import {
  currents,
  cylinderMaterials,
  entries,
  surfaces,
  surges,
  thermalComforts,
  visibilityRatings,
  weathers,
  workloads,
} from "@shylog/core"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Dive, DiveCentre, Person, Region, Site, Trip } from "@/data/db"
import type { LogView } from "@/data/log"
import { year as yearOf } from "@/format/dates"

import { fuzzOptions } from "../../../../../packages/core/test/reference/fuzz"
import { percent } from "../charts/parts"
import { countedDives } from "../figures"
import { seededLog } from "../seeded-log"
import { dive, syntheticLog } from "../synthetic"
import {
  average,
  differences,
  fieldsOf,
  measures,
  rowsOf,
  type Field,
  type MeasureKey,
  type Named,
  type Pattern,
  type Row,
} from "./catalogue"
import { difference } from "./rules/difference"
import { score } from "./score"
import {
  axisUnit,
  differenceWords,
  figure,
  groupRow,
  inUnits,
  shareWords,
  type Averaged,
} from "./wording"

// The rule as first written, walking every dive for every split: slow at
// a thousand dives, but plainly right, so the fast one must match it to
// the last bit.
function walked(
  rows: readonly Row[],
  key: MeasureKey,
  field: Field
): Pattern | null {
  type Key = string | string[]
  const measure = measures[key]
  const points = rows.flatMap((row) => {
    const value = field.value(row)
    return value == null || measure.value(row) == null
      ? []
      : [{ row, key: value }]
  })
  const order = field.order([...new Set(points.flatMap((p) => p.key))])
  const splits =
    field.kind === "ordered"
      ? order.slice(1).map((_, i) => {
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
      : order.map((one) => ({
          test: (key: Key) =>
            Array.isArray(key) ? key.includes(one) : key === one,
          names: field.names(one),
        }))
  let best: {
    effect: number
    sides: [Row[], Row[]]
    means: [number, number]
    names: [Named, Named]
  } | null = null
  for (const { test, names } of splits) {
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
    if (!best || effect > best.effect) best = { effect, sides, means, names }
  }
  if (!best) return null
  const { effect, sides, means, names } = best
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

// Every difference the catalogue asks of these rows, both ways.
function bothWays(rows: readonly Row[], log: LogView) {
  const fields = fieldsOf(log)
  const fast: (Pattern | null)[] = []
  const slow: (Pattern | null)[] = []
  for (const [measure, list] of differences)
    for (const field of list) {
      fast.push(difference(rows, measure, fields[field]))
      slow.push(walked(rows, measure, fields[field]))
    }
  return { fast, slow }
}

describe("difference against a walk of every split", () => {
  it("matches on the seeded fixture, all time and each year", async () => {
    const log = await seededLog()
    const counted = countedDives(log)
    const years = [...new Set(counted.map((d) => yearOf(d.startTime)))]
    let found = 0
    for (const year of [undefined, ...years]) {
      const rows = rowsOf(
        counted.filter((d) => !year || yearOf(d.startTime) === year),
        log
      )
      const { fast, slow } = bothWays(rows, log)
      expect(fast).toEqual(slow)
      found += fast.filter(Boolean).length
    }
    // So the comparison isn't of nothing against nothing.
    expect(found).toBeGreaterThan(0)
  })

  // Few values each, so splits tie and land on the cut-offs, with decimals
  // whose sums round differently by order; names repeat and number, so the
  // field orders' own ties and numeric sorts come into it too.
  const pick = <T>(values: readonly T[]) => fc.constantFrom(...values)
  const keys = (options: object) => [...Object.keys(options), null]
  const ids = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${prefix}-${i}`)
  const sites = ids("site", 6).map(
    (id, i) =>
      ({
        id,
        name: ["Reef 2", "Reef 10", "Reef 2", "Ark", "Bay", "Cove"][i],
        countryCode: "ZA",
        regionId: [null, "region-0", "region-1", "region-2"][i % 4],
      }) as Site
  )
  const named = <T>(prefix: string, n: number) =>
    ids(prefix, n).map((id, i) => ({ id, name: `Name ${i % 3}` }) as T)
  const people = named<Person>("person", 5)
  const extras = {
    regions: named<Region>("region", 3),
    diveCentres: named<DiveCentre>("centre", 3),
    trips: named<Trip>("trip", 3),
  }
  const someOf = (values: string[]) => fc.shuffledSubarray(values)
  const loggedDive = fc.record({
    fields: fc.record({
      startTime: fc
        .tuple(
          fc.integer({ min: 2024, max: 2026 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 3 }),
          pick([7, 9, 13, 16, 20])
        )
        .map(
          ([y, m, d, h]) =>
            `${y}-${String(m).padStart(2, "0")}-0${d}T${String(h).padStart(2, "0")}:00:00`
        ),
      siteId: pick(sites.map((s) => s.id)),
      duration: fc.oneof(
        pick([1800, 2400, 3000]),
        fc.integer({ min: 600, max: 4800 })
      ),
      maxDepth: fc.oneof(
        pick([9.1, 12.3, 18.3, 25.7, 40.05]),
        fc.double({ min: 3, max: 60, noNaN: true })
      ),
      nitrox: fc.boolean(),
      current: pick(keys(currents)),
      surge: pick(keys(surges)),
      workload: pick(keys(workloads)),
      weather: pick(keys(weathers)),
      surface: pick(keys(surfaces)),
      thermalComfort: pick(keys(thermalComforts)),
      entry: pick(keys(entries)),
      cylinderMaterial: pick(keys(cylinderMaterials)),
      cylinderVolume: pick([null, 10_000, 12_000, 15_000]),
      minTemperature: pick([null, 11.5, 14, 16, 18.3, 20, 22.7]),
      visibilityRating: pick(keys(visibilityRatings)),
      sparkline: pick([null, [0]]),
      ascentAlarmCount: pick([0, 1, 2]),
      tripId: pick([null, ...extras.trips.map((t) => t.id)]),
      diveCentreId: pick([null, ...extras.diveCentres.map((c) => c.id)]),
    }),
    sac: pick([null, 11.3, 12.7, 14.1, 15.2, 19.9]),
    buddies: someOf(people.map((p) => p.id)),
    professionals: someOf(people.map((p) => p.id)),
    tags: someOf(["drySuit", "night", "drift", "photoVideo"]),
  })

  it("matches on random logs", () => {
    let found = 0
    fc.assert(
      fc.property(
        fc.array(loggedDive, { minLength: 10, maxLength: 60 }),
        (generated) => {
          const list = generated.map((g) => dive(g.fields as Partial<Dive>))
          const sac = new Map(list.map((d, i) => [d.id, generated[i]!.sac]))
          const log = {
            ...syntheticLog(list, {
              sites,
              regions: extras.regions,
              people,
              links: Object.fromEntries(
                list.map((d, i) => {
                  const { buddies, professionals, tags } = generated[i]!
                  return [d.id, { buddies, professionals, tags }]
                })
              ),
            }),
            diveCentres: new Map(extras.diveCentres.map((c) => [c.id, c])),
            trips: new Map(extras.trips.map((t) => [t.id, t])),
          }
          const rows = rowsOf(countedDives(log), log).map((row) => ({
            ...row,
            sac: sac.get(row.dive.id)!,
          }))
          const { fast, slow } = bothWays(rows, log)
          expect(fast).toEqual(slow)
          found += fast.filter(Boolean).length
        }
      ),
      fuzzOptions(131, 200)
    )
    expect(found).toBeGreaterThan(0)
  })
})
