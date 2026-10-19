import { describe, expect, it } from "vitest"

import { fixtureDive } from "../../test/fixture.ts"
import { defaultSettings } from "../schemas/settings.ts"
import { diveOxygen } from "./gas.ts"
import { maxPo2, mod } from "./mod.ts"

const salt = { waterType: "salt" } as const
const fresh = { waterType: "fresh" } as const
const limit = defaultSettings.maxPo2

describe("fixture dives", () => {
  it("dive 63, EANx32 to 32.66 m: 1.38 bar, MOD 33.2 m", () => {
    const dive = fixtureDive(63)
    const oxygen = diveOxygen(dive)!
    expect(oxygen).toBe(320)
    expect(maxPo2(oxygen, dive.maxDepth, salt)).toBe(1.38)
    expect(maxPo2(oxygen, dive.maxDepth, salt).toFixed(2)).toBe("1.38")
    expect(mod(oxygen, limit, salt)).toBe(33.2)
  })

  it("dive 61, EANx33 to 31.47 m: 1.38 bar, MOD 31.9 m", () => {
    const dive = fixtureDive(61)
    const oxygen = diveOxygen(dive)!
    expect(oxygen).toBe(330)
    // 1384 mbar, shown to two decimals.
    expect(maxPo2(oxygen, dive.maxDepth, salt)).toBe(1.384)
    expect(maxPo2(oxygen, dive.maxDepth, salt).toFixed(2)).toBe("1.38")
    expect(mod(oxygen, limit, salt)).toBe(31.9)
  })

  it("dive 54, air to 42.28 m: 1.10 bar, MOD 56.2 m", () => {
    const dive = fixtureDive(54)
    const oxygen = diveOxygen(dive)!
    expect(oxygen).toBe(209)
    // 0.209 × 5285 mbar = 1104.6, so 1105 mbar, which Subsurface's
    // unrounded 1.1046 also shows as 1.10.
    expect(maxPo2(oxygen, dive.maxDepth, salt)).toBe(1.105)
    expect(maxPo2(oxygen, dive.maxDepth, salt).toFixed(2)).toBe("1.10")
    expect(mod(oxygen, limit, salt)).toBe(56.2)
  })
})

describe("mod", () => {
  it("reads the limit from settings, 1.4 bar by default", () => {
    expect(limit).toBe(1.4)
    expect(mod(320, 1.6, salt)).toBe(39.4)
    // 27.088 m
    expect(mod(320, 1.2, salt)).toBe(27)
  })

  it("rounds down to 0.1 m", () => {
    // 28.889 m
    expect(mod(356, 1.4, salt)).toBe(28.8)
    // 41.289 m
    expect(mod(270, 1.4, salt)).toBe(41.2)
  })

  it("rounds up a value within 0.01 m of the next step", () => {
    // 32.996 m
    expect(mod(322, 1.4, salt)).toBe(33)
    // 46.990 m: exactly 0.01 m short still rounds up
    expect(mod(243, 1.4, salt)).toBe(47)
  })

  it("is deeper in fresh water and shallower at altitude", () => {
    expect(mod(320, 1.4, fresh)).toBeGreaterThan(33.2)
    const altitude = { waterType: "fresh", surfacePressure: 800 } as const
    expect(mod(320, 1.4, altitude)).toBeGreaterThan(mod(320, 1.4, fresh))
  })

  it("divides the limit by the mix in integer mbar, as Subsurface does", () => {
    // 1 400 000 / 209 = 6698.56, truncated to 6698 mbar before the depth.
    expect(mod(209, 1.4, salt)).toBe(56.2)
  })
})

describe("maxPo2", () => {
  it("rounds to whole mbar", () => {
    // 0.32 × 4313 mbar = 1380.16
    expect(maxPo2(320, 32.66, salt)).toBe(1.38)
    // 0.209 × 1013 at the surface
    expect(maxPo2(209, 0, salt)).toBe(0.212)
  })

  it("goes over the limit past the MOD", () => {
    expect(maxPo2(320, 33.2, salt)).toBeLessThanOrEqual(1.4)
    expect(maxPo2(320, 33.4, salt)).toBeGreaterThan(1.4)
  })

  it("is lower in fresh water at the same depth", () => {
    expect(maxPo2(320, 32.66, fresh)).toBe(1.349)
  })
})
