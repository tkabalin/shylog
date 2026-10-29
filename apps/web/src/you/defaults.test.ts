import { defaultSettings, settingsSchema } from "@shylog/core"
import { describe, expect, it } from "vitest"

import { divingValues, parseDiving } from "./defaults"

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
    visibilityMode: "metres",
  },
})

describe("the Diving section", () => {
  it("shows the defaults in the form's units and saves them back", () => {
    const values = divingValues(settings)
    expect(values).toEqual({
      maxPo2: "1.4",
      cylinderMaterial: "aluminium",
      cylinderVolume: "11.1",
      startPressure: "200",
      nitrox: true,
      oxygen: "32",
      weight: "6",
      diveType: "recreation",
      visibilityMode: "metres",
    })
    expect(parseDiving(values).request).toEqual({
      maxPo2: 1.4,
      newDiveDefaults: settings.newDiveDefaults,
    })
  })

  it("takes a comma decimal and treats an empty field as no default", () => {
    const { request } = parseDiving({
      ...divingValues(defaultSettings),
      maxPo2: "1,6",
      cylinderVolume: "12,2",
    })
    expect(request).toEqual({
      maxPo2: 1.6,
      newDiveDefaults: {
        cylinderVolume: 12_200,
        nitrox: false,
        visibilityMode: "metres",
      },
    })
  })

  it("refuses what no dive could use, under each field", () => {
    const { errors, request } = parseDiving({
      ...divingValues(defaultSettings),
      maxPo2: "2.5",
      cylinderVolume: "25",
      startPressure: "-1",
      weight: "lots",
      nitrox: true,
      oxygen: "",
    })
    expect(request).toBeUndefined()
    expect(errors).toEqual({
      maxPo2: "From 1.0 to 2.0 bar, in steps of 0.1",
      cylinderVolume: "Up to 20 L",
      startPressure: "Can't be negative",
      weight: "Not a number",
      oxygen: "Required for nitrox",
    })
  })
})
