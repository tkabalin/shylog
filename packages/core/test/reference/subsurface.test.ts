import fc from "fast-check"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { underwater } from "../../src/calc/average-depth.ts"
import {
  cnsWithCarryOver,
  diveCns,
  diveOtu,
  type CnsDive,
} from "../../src/calc/cns-otu.ts"
import { gasVolume } from "../../src/calc/gas.ts"
import { likelySame } from "../../src/calc/likely-same.ts"
import { mod } from "../../src/calc/mod.ts"
import type { Water } from "../../src/calc/pressure.ts"
import { lrint } from "../../src/calc/round.ts"
import { sacRate } from "../../src/calc/sac.ts"
import { diveEnd, type Sample } from "../../src/calc/samples.ts"
import { surfaceInterval } from "../../src/calc/surface-interval.ts"
import {
  chartPoints,
  speedBands,
  verticalSpeeds,
} from "../../src/calc/velocity.ts"
import { startSubsurface } from "./subsurface.ts"

// Core against Subsurface's own code (subsurface.cpp) on random dives, so
// "follows Subsurface" holds for every input, not just the fixture's. Where
// Shylog departs on purpose, the departure is applied to Subsurface's answer.

const runs = 1000
let subsurface: ReturnType<typeof startSubsurface>
beforeAll(() => {
  subsurface = startSubsurface()
}, 60_000)
afterAll(() => subsurface?.stop())

const ask = async (...words: (string | number)[]) =>
  (await subsurface.ask(words.join(" "))).split(" ").map(Number)

const check = <T>(
  arbitrary: fc.Arbitrary<T>,
  test: (value: T) => Promise<void>
) => fc.assert(fc.asyncProperty(arbitrary, test), { numRuns: runs })

// Unrounded figures agree to about the last bit: V8's exp and pow can be one
// unit off glibc's. Every figure Shylog shows is rounded and compared exactly.
const expectClose = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    Math.abs(expected) * 1e-12
  )

// Subsurface's salinity in g per 10 litres, and 0 mbar for no surface
// pressure, which it reads as 1 atm as core does.
const salinity = { salt: 10300, fresh: 10000 }
const water = fc.record({
  waterType: fc.constantFrom("salt", "fresh"),
  surfacePressure: fc.option(fc.integer({ min: 900, max: 1100 }), {
    nil: undefined,
  }),
})
const waterWords = (w: Water) => [salinity[w.waterType], w.surfacePressure ?? 0]

// Air, every nitrox mix the schemas allow, and the common ones.
const oxygen = fc.oneof(
  fc.constant(209),
  fc.integer({ min: 211, max: 1000 }),
  fc.constantFrom(320, 360, 400, 500, 1000)
)

// Whole mm, weighted towards the 0.75 m surface threshold. Subsurface skips
// a negative depth in places, so a few are included.
const depth = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 60_000 }) },
  { weight: 2, arbitrary: fc.integer({ min: 740, max: 760 }) },
  { weight: 1, arbitrary: fc.constant(0) },
  { weight: 1, arbitrary: fc.integer({ min: -500, max: -1 }) }
)

// Merged samples, so times only rise: the D4i's 10 and 20 s, short steps
// that trigger the speed lookback, and long gaps. Temperatures are tenths
// of a degree, often missing as the D4i records only changes.
interface GeneratedSample {
  time: number
  depth: number
  tenths: number | null
}
const samples = fc
  .tuple(
    fc.nat(20),
    fc.array(
      fc.record({
        step: fc.oneof(
          fc.constantFrom(10, 20),
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 31, max: 600 })
        ),
        depth,
        tenths: fc.option(fc.integer({ min: -20, max: 350 })),
      }),
      { maxLength: 80 }
    )
  )
  .map(([first, rows]) => {
    let time = first
    return rows.map((row, i): GeneratedSample => {
      if (i) time += row.step
      return { time, depth: row.depth, tenths: row.tenths }
    })
  })

const celsius = (s: GeneratedSample) =>
  s.tenths == null ? null : s.tenths / 10
const coreSamples = (generated: GeneratedSample[]): Sample[] =>
  generated.map((s) => ({
    time: s.time,
    depth: s.depth / 1000,
    temperature: celsius(s),
    pressure: null,
  }))

// Subsurface keeps temperatures in mK, with 0 for none.
const millikelvin = (degrees: number | null) =>
  degrees == null ? 0 : lrint(degrees * 1000 + 273_150)

const sampleWords = (generated: GeneratedSample[]) => [
  generated.length,
  ...generated.flatMap((s) => [s.time, s.depth, millikelvin(celsius(s))]),
]

// Start times as wall-clock strings; UTC here is only arithmetic.
const base = Date.UTC(2026, 0, 1) / 1000
const startTime = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, 19)

// A log in start order: gaps from none (a tie) to two days, so dives
// overlap and fall either side of the 12-hour CNS window and the 48-hour
// cap, some exactly on those edges or a second off, counted from the end.
const fromEnd = (hours: number) =>
  fc.integer({ min: -1, max: 1 }).map((s) => ({ fromEnd: hours * 3600 + s }))
const log = fc
  .array(
    fc.record({
      gap: fc.oneof(
        fc.constant(0),
        fc.integer({ min: 1, max: 4 * 60 * 60 }),
        fc.integer({ min: 4 * 60 * 60, max: 2 * 24 * 60 * 60 + 600 }),
        { weight: 3, arbitrary: fromEnd(12) },
        fromEnd(48)
      ),
      end: fc.integer({ min: 0, max: 3 * 60 * 60 }),
      trip: fc.integer({ min: 0, max: 2 }),
      // Well past 100 %, so a dive 12 hours back, cut to 1/256, still moves
      // the rounded figure.
      cns: fc.option(fc.double({ min: 0, max: 1000, noNaN: true })),
    }),
    { minLength: 1, maxLength: 12 }
  )
  .map((rows) => {
    let when = base
    let end = 0
    return rows.map((row) => {
      when += typeof row.gap === "number" ? row.gap : end + row.gap.fromEnd
      end = row.end
      return { when, end, trip: row.trip, cns: row.cns }
    })
  })
type Listed = { when: number; end: number; trip: number; cns: number | null }

const tableWords = (table: Listed[]) => [
  table.length,
  ...table.flatMap((d) => [d.when, d.trip, d.when + d.end, d.cns ?? 0]),
]

describe("Subsurface's code on random inputs", () => {
  it("gives the same gas volume (cylinder_t::gas_volume)", () =>
    check(
      fc.record({
        size: fc.integer({ min: 1000, max: 30_000 }),
        oxygen,
        // Past 500 bar the compressibility fit is clamped.
        pressure: fc.integer({ min: 0, max: 600_000 }),
      }),
      async ({ size, oxygen, pressure }) => {
        const [expected] = await ask("volume", size, oxygen, pressure)
        expect(gasVolume(size, pressure, oxygen)).toBe(expected)
      }
    ))

  // Subsurface reads an end pressure of 0 as no reading; Shylog has null for
  // that, so 0 bar is a real reading there and isn't compared.
  it("gives the same SAC rate (calculate_sac)", () =>
    check(
      fc.record({
        water,
        size: fc.integer({ min: 1000, max: 30_000 }),
        oxygen,
        start: fc.integer({ min: 0, max: 300_000 }),
        end: fc.integer({ min: 1, max: 300_000 }),
        duration: fc.integer({ min: 0, max: 7200 }),
        averageDepth: fc.integer({ min: 0, max: 50_000 }),
      }),
      async (input) => {
        const [expected] = await ask(
          "sac",
          ...waterWords(input.water),
          input.size,
          input.oxygen,
          input.start,
          input.end,
          input.duration,
          input.averageDepth
        )
        const sac = sacRate(
          {
            startPressure: input.start / 1000,
            endPressure: input.end / 1000,
            cylinderVolume: input.size,
            oxygen: input.oxygen,
            duration: input.duration,
            averageDepth: input.averageDepth / 1000,
          },
          input.water
        )
        expect(sac == null ? 0 : lrint(sac * 1000)).toBe(expected)
      }
    ))

  // Shylog's 0.1 m steps are gas_mod's own rounding argument at 100 mm.
  it("gives the same MOD (gas_mod)", () =>
    check(
      fc.record({
        water,
        oxygen,
        // Limits below the surface PO₂ too, where the MOD is negative.
        limit: fc.integer({ min: 100, max: 2000 }),
      }),
      async ({ water, oxygen, limit }) => {
        const [expected] = await ask("mod", ...waterWords(water), oxygen, limit)
        expect(lrint(mod(oxygen, limit / 1000, water) * 1000)).toBe(expected)
      }
    ))

  it("gives the same CNS, OTU, time under water and dive end", () =>
    check(
      fc.record({
        water,
        oxygen,
        duration: fc.integer({ min: 1, max: 7200 }),
        samples,
      }),
      async ({ water, oxygen, duration, samples }) => {
        const [cns, otu, fixedDuration, meanDepth, end] = await ask(
          "dive",
          ...waterWords(water),
          oxygen,
          duration,
          ...sampleWords(samples)
        )
        const merged = coreSamples(samples)
        // A dive without samples has no figures in Shylog, 0 in Subsurface.
        const ownCns = diveCns(merged, oxygen, water)
        expect(ownCns == null).toBe(!samples.length)
        expectClose(ownCns ?? 0, cns)
        expect(diveOtu(merged, oxygen, water) ?? 0).toBe(otu)

        const under = underwater(merged)
        expect(under?.duration ?? duration).toBe(fixedDuration)
        expect(under ? lrint(under.averageDepth * 1000) : 0).toBe(meanDepth)
        // Subsurface's duration after import is its time under water.
        expect(diveEnd(under?.duration ?? duration, merged)).toBe(end)
      }
    ))

  it("carries CNS over from earlier dives the same way (calculate_cns)", () =>
    check(
      log.chain((table) =>
        fc.tuple(fc.constant(table), fc.nat(table.length - 1))
      ),
      async ([table, index]) => {
        const [expected] = await ask("cns", index, ...tableWords(table))
        const dives: CnsDive[] = table.map((d) => ({
          startTime: startTime(d.when),
          end: d.end,
          tripId: d.trip ? `trip-${d.trip}` : null,
          cns: d.cns,
        }))
        const cns = cnsWithCarryOver(dives[index], dives)
        // Without its own samples a dive has no CNS in Shylog.
        if (table[index].cns == null) expect(cns).toBeNull()
        else expect(cns).toBe(expected)
      }
    ))

  // Shylog's 48-hour cap shows a longer interval as no previous dive.
  it("gives the same surface interval (get_surface_interval)", () =>
    check(
      log.chain((table) =>
        fc.tuple(
          fc.constant(table),
          fc.oneof(
            fc.constantFrom(...table.map((d) => d.when)),
            fc.integer({
              min: base - 600,
              max: table.at(-1)!.when + 3 * 24 * 60 * 60,
            })
          )
        )
      ),
      async ([table, when]) => {
        const [interval] = await ask("interval", when, ...tableWords(table))
        const dives = table.map((d) => ({
          startTime: startTime(d.when),
          end: d.end,
        }))
        expect(surfaceInterval(startTime(when), dives)).toBe(
          interval < 0 || interval > 48 * 60 * 60 ? "none" : interval
        )
      }
    ))

  // Leaving out the manual-dive and same-computer checks (see subsurface.cpp).
  // Pairs close together, some exactly on a bound or a unit either side,
  // or 10 % apart.
  it("finds the same likely matches (dive::likely_same)", () => {
    const near = (min: number, max: number, spread: number, bound: number) =>
      fc
        .tuple(
          fc.integer({ min, max }),
          fc.oneof(
            fc.integer({ min: -spread, max: spread }),
            fc.constantFrom(-bound - 1, -bound, -bound + 1),
            fc.constantFrom(bound - 1, bound, bound + 1)
          )
        )
        .map(([a, delta]) => [a, Math.max(min, a + delta)])
    const tenthApart = (max: number) =>
      fc
        .tuple(
          fc.integer({ min: 1, max: Math.floor(max / 10) }),
          fc.integer({ min: -1, max: 1 })
        )
        .map(([tenth, off]) => [tenth * 10, tenth * 9 + off])
    return check(
      fc
        .record({
          maxDepth: fc.oneof(near(1, 60_000, 3000, 1000), tenthApart(60_000)),
          averageDepth: fc.oneof(
            near(0, 40_000, 3000, 1000),
            tenthApart(40_000),
            fc.constant([0, 0])
          ),
          duration: fc.oneof(near(0, 7200, 900, 300), tenthApart(7200)),
        })
        .chain((dives) => {
          // Starts within the fuzz of half the longer dive, at least 60 s.
          const fuzz = Math.max(Math.trunc(Math.max(...dives.duration) / 2), 60)
          return near(base, base + 7200, 4000, fuzz).map((when) => ({
            ...dives,
            when,
          }))
        }),
      async ({ maxDepth, averageDepth, duration, when }) => {
        const dive = (i: number) => ({
          startTime: startTime(when[i]),
          duration: duration[i],
          maxDepth: maxDepth[i] / 1000,
          averageDepth: averageDepth[i] ? averageDepth[i] / 1000 : null,
        })
        const [expected] = await ask(
          "same",
          ...[0, 1].flatMap((i) => [
            maxDepth[i],
            averageDepth[i],
            duration[i],
            when[i],
          ])
        )
        expect(likelySame(dive(0), dive(1))).toBe(expected === 1)
      }
    )
  })

  it("draws the same chart points and speeds (populate_plot_entries)", () =>
    check(
      samples.chain((generated) => {
        const last = generated.at(-1)?.time ?? 0
        // Events between samples, on them, on the 10 s points and after.
        const time = fc.oneof(
          fc.integer({ min: 0, max: last + 60 }),
          fc.constantFrom(0, ...generated.map((s) => s.time)),
          fc
            .integer({ min: 0, max: Math.floor(last / 10) + 6 })
            .map((n) => n * 10)
        )
        return fc.tuple(
          fc.constant(generated),
          fc.array(time, { maxLength: 6 })
        )
      }),
      async ([generated, events]) => {
        const [count, ...entries] = await ask(
          "plot",
          ...sampleWords(generated),
          events.length,
          ...events
        )
        const points = chartPoints(coreSamples(generated), events)
        const speeds = verticalSpeeds(points)
        const got = points.flatMap((point, i) => [
          point.time,
          point.depth,
          millikelvin(point.temperature),
          speeds[i].speed,
          speedBands.indexOf(speeds[i].band),
        ])
        expect(points.length).toBe(count)
        expect(got).toEqual(entries)
      }
    ))
})
