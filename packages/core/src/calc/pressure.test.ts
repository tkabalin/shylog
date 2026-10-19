import { describe, expect, it } from "vitest"

import {
  depthToMbar,
  isAtSurface,
  specificWeight,
  surfacePressure,
  toMillimetres,
} from "./pressure.ts"

const salt = { waterType: "salt" } as const
const fresh = { waterType: "fresh" } as const

describe("depth to pressure", () => {
  it("adds the water column to 1013 mbar in salt water", () => {
    expect(depthToMbar(32660, salt)).toBe(4313)
    expect(depthToMbar(10000, salt)).toBe(2023)
  })

  it("uses fresh water's lower density", () => {
    expect(depthToMbar(10000, fresh)).toBe(1994)
    expect(depthToMbar(32660, fresh)).toBe(4217)
  })

  it("is the surface pressure at 0 m", () => {
    expect(depthToMbar(0, salt)).toBe(1013)
    expect(depthToMbar(0, { waterType: "salt", surfacePressure: 850 })).toBe(
      850
    )
  })

  it("starts from the dive's surface pressure when it has one", () => {
    const altitude = { waterType: "fresh", surfacePressure: 800 } as const
    expect(depthToMbar(10000, altitude)).toBe(1781)
  })

  it("falls back to 1013 mbar for a missing or zero surface pressure", () => {
    expect(surfacePressure(salt)).toBe(1013)
    expect(surfacePressure({ waterType: "salt", surfacePressure: 0 })).toBe(
      1013
    )
  })

  it("is 0.101043 bar per metre in salt water and 0.0981 in fresh", () => {
    expect(specificWeight(salt) * 1000).toBeCloseTo(101.043, 9)
    expect(specificWeight(fresh) * 1000).toBeCloseTo(98.1, 9)
  })

  it("rounds to whole mbar", () => {
    expect(Number.isInteger(depthToMbar(12345, salt))).toBe(true)
    // 1013 + 4949 mm × 0.101043 = 1513.06
    expect(depthToMbar(4949, salt)).toBe(1513)
  })
})

describe("surface threshold", () => {
  it("counts anything shallower than 0.75 m as the surface", () => {
    expect(isAtSurface(toMillimetres(0.74))).toBe(true)
    expect(isAtSurface(toMillimetres(0.749))).toBe(true)
    expect(isAtSurface(toMillimetres(0.75))).toBe(false)
    expect(isAtSurface(0)).toBe(true)
  })
})

describe("toMillimetres", () => {
  it("rounds metres to whole mm, hiding binary float error", () => {
    expect(toMillimetres(32.66)).toBe(32660)
    expect(toMillimetres(9.699999999999999)).toBe(9700)
    expect(toMillimetres(0.0005)).toBe(0)
  })
})
