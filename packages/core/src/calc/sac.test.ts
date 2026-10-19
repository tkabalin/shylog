import { describe, expect, it } from "vitest"

import { fixtureDive } from "../../test/fixture.ts"
import { sacDurationAndDepth, sacRate, type SacInputs } from "./sac.ts"
import type { Sample } from "./samples.ts"

const salt = { waterType: "salt" } as const
const fresh = { waterType: "fresh" } as const

// 12 L steel, 200 → 60 bar, 45 min, average 19.8 m, air. Subsurface's
// calculate_sac, run in C on the same inputs, gives 11 724 ml/min: gas
// volumes of 2 287 171 and 717 486 ml, and 3014 mbar at 19.8 m.
const handWorked: SacInputs = {
  startPressure: 200,
  endPressure: 60,
  cylinderVolume: 12000,
  oxygen: 209,
  duration: 45 * 60,
  averageDepth: 19.8,
}

describe("sacRate", () => {
  it("agrees with Subsurface to the millilitre", () => {
    expect(sacRate(handWorked, salt)).toBe(11.724)
    expect(sacRate(handWorked, fresh)).toBe(11.958)
    expect(
      sacRate(
        {
          startPressure: 232,
          endPressure: 50,
          cylinderVolume: 11100,
          oxygen: 320,
          duration: 3000,
          averageDepth: 15,
        },
        salt
      )
    ).toBe(15.061)
  })

  it("rounds in calculate_sac's order, litres first", () => {
    // Exactly 22 435.5 ml/min on paper; Subsurface's C, which divides by 1000
    // before rounding, lands just below the half and gives 22 435.
    const inputs = { ...handWorked, cylinderVolume: 10000, duration: 1200 }
    expect(
      sacRate(
        { ...inputs, startPressure: 50, endPressure: 5, averageDepth: 0.001 },
        salt
      )
    ).toBe(22.435)
  })

  it("reads a few per cent below the ideal-gas figure", () => {
    // The same arithmetic in C with Z = 1 gives 12 387 ml/min.
    const ideal = 12.387
    const real = sacRate(handWorked, salt)!
    expect(1 - real / ideal).toBeGreaterThan(0.03)
    expect(1 - real / ideal).toBeLessThan(0.07)
  })

  it("is affected by nitrox only through Z", () => {
    const nitrox = sacRate({ ...handWorked, oxygen: 320 }, salt)!
    expect(nitrox).not.toBe(11.724)
    expect(Math.abs(nitrox - 11.724)).toBeLessThan(0.3)
  })

  it("needs the start pressure above the end pressure", () => {
    expect(sacRate({ ...handWorked, endPressure: 200 }, salt)).toBeNull()
    expect(sacRate({ ...handWorked, endPressure: 210 }, salt)).toBeNull()
    expect(sacRate({ ...handWorked, endPressure: 199 }, salt)).toBe(0.076)
  })

  it("is null when the drop leaves the whole-ml volumes unchanged", () => {
    // 1 ml at 200 and 199.999 bar both hold 191 ml.
    expect(
      sacRate(
        {
          ...handWorked,
          cylinderVolume: 1,
          startPressure: 200,
          endPressure: 199.999,
        },
        salt
      )
    ).toBeNull()
  })

  it("needs every input", () => {
    for (const key of Object.keys(handWorked) as (keyof SacInputs)[]) {
      expect(sacRate({ ...handWorked, [key]: null }, salt), key).toBeNull()
    }
  })

  it("needs a duration and an average depth above zero", () => {
    expect(sacRate({ ...handWorked, duration: 0 }, salt)).toBeNull()
    expect(sacRate({ ...handWorked, averageDepth: 0 }, salt)).toBeNull()
  })

  it("accepts an empty cylinder at the end", () => {
    expect(sacRate({ ...handWorked, endPressure: 0 }, salt)).toBeGreaterThan(
      11.724
    )
  })

  it("is lower for the same gas used deeper or for longer", () => {
    const deeper = sacRate({ ...handWorked, averageDepth: 30 }, salt)!
    const longer = sacRate({ ...handWorked, duration: 3600 }, salt)!
    expect(deeper).toBeLessThan(11.724)
    expect(longer).toBeLessThan(11.724)
  })
})

describe("sacDurationAndDepth", () => {
  const samples: Sample[] = [
    { time: 0, depth: 0, temperature: 20, pressure: null },
    { time: 60, depth: 10, temperature: null, pressure: null },
    { time: 600, depth: 10, temperature: null, pressure: null },
    { time: 660, depth: 0, temperature: null, pressure: null },
    { time: 900, depth: 0, temperature: null, pressure: null },
  ]
  const stored = { duration: 700, averageDepth: 8 }

  it("takes both from the samples when neither was typed", () => {
    expect(
      sacDurationAndDepth(
        stored,
        { duration: false, averageDepth: false },
        samples
      )
    ).toEqual({ duration: 660, averageDepth: 9.091 })
  })

  it("lets a hand duration beat the sample duration", () => {
    expect(
      sacDurationAndDepth(
        stored,
        { duration: true, averageDepth: false },
        samples
      )
    ).toEqual({ duration: 700, averageDepth: 9.091 })
  })

  it("lets a hand average depth beat the samples'", () => {
    expect(
      sacDurationAndDepth(
        stored,
        { duration: false, averageDepth: true },
        samples
      )
    ).toEqual({ duration: 660, averageDepth: 8 })
  })

  it("uses the stored values for a dive without samples", () => {
    expect(
      sacDurationAndDepth(stored, { duration: false, averageDepth: false }, [])
    ).toEqual(stored)
    expect(
      sacDurationAndDepth(
        { duration: 700, averageDepth: null },
        { duration: false, averageDepth: false },
        []
      )
    ).toEqual({ duration: 700, averageDepth: null })
  })

  it("uses the samples over the computer's averagedepth on fixture dive 63", () => {
    const dive = fixtureDive(63)
    const values = sacDurationAndDepth(
      dive,
      { duration: false, averageDepth: false },
      dive.samples
    )
    expect(values).toEqual({ duration: 2502, averageDepth: 20.989 })
    expect(dive.averageDepth).toBe(21.005)
  })
})
