import { describe, expect, it } from "vitest"

import { axisTicks, niceStep } from "./ticks.ts"

const minutes = (step: number) => niceStep(step, 2, true)
const metres = (step: number) => niceStep(step, 0, false)

describe("niceStep", () => {
  it("rounds time steps up to 5, 10, 12, 15, 20, 30 or 60 minutes", () => {
    expect([4.3, 6, 11, 13, 16, 21, 40].map(minutes)).toEqual([
      5, 10, 12, 15, 20, 30, 60,
    ])
    expect(minutes(10)).toBe(10)
  })

  it("uses the same steps in seconds at a minute or less", () => {
    expect([0.05, 0.15, 0.25, 0.3, 0.45, 0.9, 1].map(minutes)).toEqual([
      1 / 12,
      1 / 6,
      1 / 4,
      1 / 3,
      1 / 2,
      1,
      1,
    ])
  })

  it("takes decimal steps from an hour up", () => {
    expect(minutes(70)).toBe(100)
  })

  it("rounds other steps to 1, 2, 4, 5 or 10 times a power of ten", () => {
    expect([1, 1.2, 2.6, 4.1, 5.5, 41, 0.3].map(metres)).toEqual([
      1, 2, 4, 5, 10, 50, 1,
    ])
    expect(niceStep(0.03, 2, false)).toBe(0.04)
  })
})

describe("axisTicks", () => {
  const time = { min: 0, scale: 1 / 60, decimals: 2, time: true }
  const depth = { min: 0, scale: 0.001, decimals: 0, time: false }

  it("gives a 52 min dive with room for 12 labels 5 min ticks inside its bounds", () => {
    const ticks = axisTicks({ ...time, max: 3120, size: 360, space: 30 })!
    expect(ticks.min).toBe(0)
    expect(ticks.max).toBe(3120)
    expect(ticks.values.map((value) => Math.round(value))).toEqual(
      Array.from({ length: 11 }, (_, i) => i * 300)
    )
  })

  it("rounds a depth axis's end up to the next tick", () => {
    const ticks = axisTicks({ ...depth, max: 41_000, size: 200, space: 20 })!
    expect(Math.round(ticks.max)).toBe(45_000)
    expect(ticks.values.map((value) => Math.round(value))).toEqual(
      Array.from({ length: 10 }, (_, i) => i * 5000)
    )
  })

  it("keeps between 2 and 50 ticks", () => {
    const few = axisTicks({ ...depth, max: 30_000, size: 10, space: 100 })!
    expect(few.values).toHaveLength(3)
    const many = axisTicks({ ...depth, max: 100_000, size: 10_000, space: 1 })!
    expect(many.values).toHaveLength(51)
  })

  it("is null for an axis with no range or no tick inside it", () => {
    expect(axisTicks({ ...depth, max: 0, size: 100, space: 10 })).toBeNull()
    expect(
      axisTicks({ ...time, min: 1, max: 2, size: 100, space: 10 })
    ).toBeNull()
  })

  it("puts a single tick on an axis whose ends round to the same step", () => {
    expect(
      axisTicks({ ...depth, min: 1000, max: 1000.005, size: 10, space: 5 })
    ).toEqual({ min: 1000, max: 1000, values: [1000] })
  })
})
