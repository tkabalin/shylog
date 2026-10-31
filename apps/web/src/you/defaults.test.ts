import { defaultSettings, settingsSchema } from "@shylog/core"
import { describe, expect, it } from "vitest"

import { defaultsValues, parseDefaults, parseMaxPo2 } from "./defaults"

const settings = settingsSchema.parse({
  maxPo2: 1.4,
  newDiveDefaults: {
    cylinderMaterial: "aluminium",
    cylinderVolume: 11_100,
    startPressure: 200,
    nitrox: true,
    oxygen: 320,
    weight: 6,
    diveType: "recreation",
  },
})

describe("the Defaults section", () => {
  it("shows the defaults in the form's units and saves them back", () => {
    const values = defaultsValues(settings)
    expect(values).toEqual({
      cylinderMaterial: "aluminium",
      cylinderVolume: "11.1",
      startPressure: "200",
      nitrox: true,
      oxygen: "32",
      weight: "6",
      diveType: "recreation",
    })
    expect(parseDefaults(values).request).toEqual({
      newDiveDefaults: settings.newDiveDefaults,
    })
  })

  it("takes a comma decimal and treats an empty field as no default", () => {
    const { request } = parseDefaults({
      ...defaultsValues(defaultSettings),
      cylinderVolume: "12,2",
    })
    expect(request).toEqual({
      newDiveDefaults: {
        cylinderVolume: 12_200,
        nitrox: false,
      },
    })
  })

  it("refuses what no dive could use, under each field", () => {
    const { errors, request } = parseDefaults({
      ...defaultsValues(defaultSettings),
      cylinderVolume: "25",
      startPressure: "-1",
      weight: "lots",
      nitrox: true,
      oxygen: "",
    })
    expect(request).toBeUndefined()
    expect(errors).toEqual({
      cylinderVolume: "Up to 20 L",
      startPressure: "Can't be negative",
      weight: "Not a number",
      oxygen: "Required for nitrox",
    })
  })
})

describe("the Preferences section", () => {
  it("takes a comma decimal and refuses what no dive could use", () => {
    expect(parseMaxPo2("1,6")).toEqual({ value: 1.6 })
    expect(parseMaxPo2("2.5").error).toBe(
      "From 1.0 to 2.0 bar, in steps of 0.1"
    )
    expect(parseMaxPo2("lots").error).toBe("Not a number")
    expect(parseMaxPo2(" ").error).toBe("Required")
  })
})
