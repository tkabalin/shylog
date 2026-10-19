import { describe, expect, it } from "vitest"

import { sparkline } from "./profile.ts"

const sample = (time: number, depth: number) => ({
  time,
  depth,
  temperature: null,
  pressure: null,
})

describe("sparkline", () => {
  it("keeps the deepest sample in each of 24 slices", () => {
    const samples = Array.from({ length: 49 }, (_, i) =>
      sample(i * 5, i % 2 ? 10 + i / 10 : 1)
    )
    const line = sparkline(samples, 240)!
    expect(line).toHaveLength(24)
    // Slice 0 is 0 to 10 s, with samples at 0 and 5 s.
    expect(line[0]).toBe(10.1)
    expect(line[23]).toBe(14.7)
  })

  it("takes the depth at a slice's middle when no sample falls in it", () => {
    // Slices of 5 s between samples 60 s apart.
    const line = sparkline([sample(0, 0), sample(60, 12), sample(120, 0)], 120)!
    expect(line[0]).toBe(0)
    expect(line[1]).toBe(1.5)
    expect(Math.max(...line)).toBe(12)
  })

  it("holds the last sample's depth past the last sample", () => {
    // The duration runs on 120 s after the last sample.
    const line = sparkline([sample(0, 2), sample(60, 12), sample(120, 3)], 240)!
    expect(line[23]).toBe(3)
  })

  it("is null without samples", () => {
    expect(sparkline([], 2700)).toBeNull()
  })
})
