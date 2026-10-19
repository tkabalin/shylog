import { describe, expect, it } from "vitest"

import { airOxygen, compressibility, diveOxygen, gasVolume } from "./gas.ts"

describe("diveOxygen", () => {
  it("is 20.9 % for air, as in Subsurface", () => {
    expect(airOxygen).toBe(209)
    expect(diveOxygen({ nitrox: false })).toBe(209)
    // A leftover oxygen value on an air dive is ignored.
    expect(diveOxygen({ nitrox: false, oxygen: 320 })).toBe(209)
  })

  it("is the dive's mix for nitrox, and unknown without one", () => {
    expect(diveOxygen({ nitrox: true, oxygen: 324 })).toBe(324)
    expect(diveOxygen({ nitrox: true })).toBeNull()
    expect(diveOxygen({ nitrox: true, oxygen: null })).toBeNull()
  })
})

// Expected values from Subsurface's gas_compressibility_factor run in C.
describe("compressibility", () => {
  it("is 1 at 0 bar", () => {
    expect(compressibility(209, 0)).toBe(1)
  })

  it("matches Subsurface's fit for air and nitrox", () => {
    expect(compressibility(209, 200)).toBeCloseTo(1.03586510732116, 12)
    expect(compressibility(320, 200)).toBeCloseTo(1.02481201322995, 12)
    expect(compressibility(209, 232)).toBeCloseTo(1.05689948886063, 12)
  })

  it("dips below 1 at low pressure, where air is more compressible", () => {
    expect(compressibility(209, 20)).toBeLessThan(1)
  })

  it("clamps the pressure to the fit's 0 to 500 bar range", () => {
    expect(compressibility(209, 600)).toBe(compressibility(209, 500))
    expect(compressibility(209, 500)).toBeCloseTo(1.32006930489757, 12)
    expect(compressibility(209, -5)).toBe(1)
  })

  it("weights each gas's fit by its fraction", () => {
    const oxygen = compressibility(1000, 200)
    const nitrogen = compressibility(0, 200)
    expect(compressibility(500, 200)).toBeCloseTo((oxygen + nitrogen) / 2, 12)
  })
})

describe("gasVolume", () => {
  it("gives litres at 1 atm in whole ml, as Subsurface does", () => {
    expect(gasVolume(12000, 200000, 209)).toBe(2287171)
    expect(gasVolume(12000, 60000, 209)).toBe(717486)
    expect(gasVolume(11100, 232000, 320)).toBe(2434565)
  })

  it("holds less than an ideal gas would when full", () => {
    const ideal = Math.round((12000 * 200000) / 1013)
    expect(gasVolume(12000, 200000, 209)).toBeLessThan(ideal)
  })

  it("is empty at 0 bar", () => {
    expect(gasVolume(12000, 0, 209)).toBe(0)
  })
})
