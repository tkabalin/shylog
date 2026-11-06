import { describe, expect, it } from "vitest"

import type { ReadDive } from "../uddf/reader.ts"
import { leftOut } from "./freedive.ts"

const dive = (over: Partial<ReadDive> & { every?: number }): ReadDive => {
  const { every = 2, ...rest } = over
  return {
    ref: "id1",
    startTime: "2025-12-28T10:00:00",
    duration: 20,
    maxDepth: 5,
    averageDepth: 3,
    minTemperature: null,
    oxygen: null,
    unsupportedGas: false,
    cylinderVolume: null,
    startPressure: null,
    endPressure: null,
    hasTankData: false,
    hasGas: false,
    weight: null,
    notes: null,
    computerModel: "Suunto D4i",
    samples: Array.from({ length: 10 }, (_, i) => ({
      time: i * every,
      depth: 3,
      temperature: null,
      pressure: null,
    })),
    events: [],
    ...rest,
  }
}

describe("leftOut", () => {
  it("leaves out a freedive by its three signs, even under a minute", () => {
    expect(leftOut(dive({}))).toBe("freedive")
  })

  it("keeps a gauge dive: no gas, but sampled every 20 s", () => {
    expect(leftOut(dive({ every: 20, duration: 1800 }))).toBeNull()
  })

  it("needs all three signs for a freedive", () => {
    expect(leftOut(dive({ every: 3, duration: 600 }))).toBeNull()
    expect(leftOut(dive({ hasTankData: true, duration: 600 }))).toBeNull()
    expect(leftOut(dive({ hasGas: true, duration: 600 }))).toBeNull()
  })

  it("keeps a dive with no samples, which has no gaps to judge", () => {
    expect(leftOut(dive({ samples: [], duration: 1800 }))).toBeNull()
  })

  it("leaves out any other dive under five minutes as short", () => {
    const scuba = { hasTankData: true, hasGas: true, every: 10 }
    expect(leftOut(dive({ ...scuba, duration: 299 }))).toBe("short")
    expect(leftOut(dive({ ...scuba, duration: 300 }))).toBeNull()
  })
})
