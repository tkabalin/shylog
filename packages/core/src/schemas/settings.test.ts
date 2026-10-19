import { describe, expect, it } from "vitest"

import { defaultSettings, settingsSchema } from "./settings.ts"

describe("settingsSchema", () => {
  it("defaults to an empty name, 1.4 bar and visibility in metres", () => {
    expect(defaultSettings).toEqual({
      diverName: "",
      maxPo2: 1.4,
      newDiveDefaults: { visibilityMode: "metres" },
    })
  })

  it("takes the maximum PO₂ in 0.1 bar steps from 1 to 2 bar", () => {
    for (const maxPo2 of [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2]) {
      expect(settingsSchema.safeParse({ maxPo2 }).success).toBe(true)
    }
    for (const maxPo2 of [0.9, 1.45, 1.4049, 2.1]) {
      expect(settingsSchema.safeParse({ maxPo2 }).success).toBe(false)
    }
  })

  it("takes new-dive defaults in dive field shapes", () => {
    const settings = settingsSchema.parse({
      newDiveDefaults: {
        cylinderMaterial: "aluminium",
        cylinderVolume: 11100,
        startPressure: 200,
        nitrox: true,
        oxygen: 320,
        weight: 4,
        diveType: "recreation",
        visibilityMode: "rating",
      },
    })
    expect(settings.newDiveDefaults).toMatchObject({
      cylinderVolume: 11100,
      oxygen: 320,
    })
    expect(
      settingsSchema.safeParse({
        newDiveDefaults: { visibilityMode: "metres", cylinderVolume: 11.1 },
      }).success
    ).toBe(false)
  })

  it("saves a default oxygen only with nitrox", () => {
    const settings = settingsSchema.parse({
      newDiveDefaults: { visibilityMode: "metres", oxygen: 320 },
    })
    expect(settings.newDiveDefaults).not.toHaveProperty("oxygen")
  })

  it("needs a default oxygen with nitrox", () => {
    expect(
      settingsSchema.safeParse({
        newDiveDefaults: { visibilityMode: "metres", nitrox: true },
      }).success
    ).toBe(false)
  })

  it("rejects dive types the spec doesn't list", () => {
    expect(
      settingsSchema.safeParse({
        newDiveDefaults: { visibilityMode: "metres", diveType: "technical" },
      }).success
    ).toBe(false)
  })
})
