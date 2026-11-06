import { describe, expect, it } from "vitest"

import { convertPadi, type Extras } from "./convert.ts"
import {
  april,
  december,
  extras,
  january,
  padiDive,
  padiExport,
} from "./fixture.ts"

const convert = (
  dives: unknown[] = [december, january, april],
  extra: Extras = extras
) => convertPadi(padiExport(dives), extra)

describe("convertPadi", () => {
  it("maps PADI's values to Shylog's", () => {
    const [dive] = convert().dives
    expect(dive).toMatchObject({
      padiId: 101,
      date: "2025-12-07",
      startTime: null,
      duration: 3600,
      maxDepth: 6.4,
      centre: "Reef Club",
      fields: {
        diveType: "recreation",
        entry: "beachShore",
        current: "mild",
        surge: "moderate",
        surface: "moving",
        weather: "cloudless",
        visibility: 6,
        weight: 7.5,
        cylinderMaterial: "steel",
        cylinderVolume: 12000,
        startPressure: 220,
        endPressure: 50,
        gearDetails: "5 mm full suit, hood, gloves, boots",
        notes: "Saw a seal\nFelt good.",
      },
      computerFields: { minTemperature: 15, maxTemperature: 17, nitrox: false },
    })
    expect(dive!.fields).not.toHaveProperty("visibilityRating")
  })

  it("keeps the visibility rating when no distance was logged", () => {
    const [, dive] = convert().dives
    expect(dive!.fields).toMatchObject({
      visibilityRating: "low",
      weather: "cloudy",
    })
    expect(dive!.fields).not.toHaveProperty("visibility")
    // The feeling alone, when there are no notes.
    expect(dive!.fields.notes).toBe("Felt amazing.")
  })

  it("splits the buddies, leaves out a null and moves professionals", () => {
    const [first, second] = convert().dives
    expect(first).toMatchObject({
      buddies: ["Alex Example", "Sam van Example"],
      professionals: [],
    })
    expect(second).toMatchObject({
      buddies: ["Alex Example"],
      professionals: ["Pat Guide"],
    })
  })

  it("takes the buddies from the extras in place of PADI's", () => {
    const [, second] = convert([december, january], {
      ...extras,
      dives: {
        "102": { professionals: ["Pat Guide"], buddies: ["Jo", "Pat Guide"] },
      },
    }).dives
    expect(second).toMatchObject({
      buddies: ["Jo"],
      professionals: ["Pat Guide"],
    })
  })

  it("groups sites by the extras' names, with PADI's water", () => {
    const { sites } = convert()
    expect([...sites.values()]).toEqual([
      {
        name: "Kelp Point",
        countryCode: "ZA",
        region: "False Bay",
        bodyOfWater: "oceanSea",
        waterType: "salt",
      },
      {
        name: "Seal Rock",
        countryCode: "ZA",
        region: null,
        bodyOfWater: "oceanSea",
        waterType: "salt",
      },
    ])
  })

  it("takes a start time and one water temperature for a dive only PADI has", () => {
    const dive = convert().dives.at(-1)!
    expect(dive).toMatchObject({
      startTime: "2026-04-05T09:30:00",
      computerFields: { minTemperature: 21, maxTemperature: 21 },
    })
  })

  it("moves a dive to the date the extras give", () => {
    const [dive] = convert([december], {
      ...extras,
      dives: { "101": { date: "2025-12-06" } },
    }).dives
    expect(dive!.date).toBe("2025-12-06")
  })

  it("refuses what it can't read, naming every dive", () => {
    const odd = padiDive({
      id: 104,
      date: "2026-05-01",
      location: "Nowhere",
      conditions: { current: "RippingCurrent" },
      experiences: { buddies: "Stranger" },
    })
    expect(() => convert([odd])).toThrow(
      [
        'PADI dive 104 (2026-05-01, Nowhere): the extras file has no site for "Nowhere"',
        'PADI dive 104 (2026-05-01, Nowhere): the extras file has no person for "Stranger"',
        "PADI dive 104 (2026-05-01, Nowhere): unknown current RippingCurrent",
      ].join("\n")
    )
  })

  it("refuses a dive saved twice until one is skipped", () => {
    const twice = { ...december, id: 105 }
    expect(() => convert([december, twice])).toThrow(
      /PADI dive 105 .* repeats PADI dive 101: skip one/
    )
    const { dives, skipped } = convert([december, twice], {
      ...extras,
      dives: { "105": { skip: true } },
    })
    expect([dives.map((dive) => dive.padiId), skipped]).toEqual([[101], 1])
  })

  it("refuses a dive the exporter lost and extras for a dive not exported", () => {
    expect(() => convert([december, null], { ...extras, dives: {} })).toThrow(
      "1 dives came without their details: export again"
    )
    expect(() => convert([december])).toThrow(
      "The extras file names PADI dive 102, which isn't in the export"
    )
  })

  it("refuses a value past what the dive form takes", () => {
    const heavy = padiDive({
      id: 106,
      date: "2026-05-02",
      equipment: { weight: 75 },
    })
    expect(() => convert([heavy], { ...extras, dives: {} })).toThrow(
      /PADI dive 106 .*: weight: Up to 40 kg/
    )
  })
})
