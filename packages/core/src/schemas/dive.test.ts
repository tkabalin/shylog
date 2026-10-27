import { describe, expect, it } from "vitest"

import { diveFieldsPatch, diveFieldsSchema } from "./dive.ts"

// Fixture dive 63: EANx32 to 32.66 m on 22 July 2026.
const dive = {
  startTime: "2026-07-22T08:41:20",
  siteId: "site-sodwana-two-mile",
  duration: 2520,
  maxDepth: 32.66,
}

const parse = (fields: object) => diveFieldsSchema.safeParse(fields)

describe("diveFieldsSchema", () => {
  it("accepts the required fields and writes the defaults", () => {
    expect(diveFieldsSchema.parse(dive)).toEqual({
      ...dive,
      diveType: "recreation",
      nitrox: false,
      ignored: false,
    })
  })

  it("takes an ignored dive", () => {
    expect(diveFieldsSchema.parse({ ...dive, ignored: true })).toMatchObject({
      ignored: true,
    })
  })

  it.each(["startTime", "siteId", "duration", "maxDepth"])(
    "rejects a dive without %s",
    (field) => {
      expect(parse({ ...dive, [field]: undefined }).success).toBe(false)
    }
  )

  it.each([
    ["no time", "2026-07-22"],
    ["no date", "08:41:20"],
    ["no seconds", "2026-07-22T08:41"],
    ["a UTC marker", "2026-07-22T08:41:20Z"],
    ["an offset", "2026-07-22T08:41:20+07:00"],
    ["a date that doesn't exist", "2026-02-30T08:41:20"],
  ])("rejects a start time with %s", (_, startTime) => {
    expect(parse({ ...dive, startTime }).success).toBe(false)
  })

  it("rejects calculated or unknown fields", () => {
    expect(parse({ ...dive, sac: 14.2 }).success).toBe(false)
    expect(parse({ ...dive, number: 37 }).success).toBe(false)
  })

  it("takes oxygen in whole tenths of a per cent, only with nitrox", () => {
    expect(
      diveFieldsSchema.parse({ ...dive, nitrox: true, oxygen: 324 })
    ).toMatchObject({
      oxygen: 324,
    })
    expect(parse({ ...dive, nitrox: true, oxygen: 32.4 }).success).toBe(false)
    expect(parse({ ...dive, nitrox: true, oxygen: 1001 }).success).toBe(false)
    expect(parse({ ...dive, nitrox: true, oxygen: 210 }).success).toBe(false)
    expect(parse({ ...dive, nitrox: true, oxygen: 211 }).success).toBe(true)
    expect(parse({ ...dive, nitrox: true }).success).toBe(false)
    expect(diveFieldsSchema.parse({ ...dive, oxygen: 324 })).not.toHaveProperty(
      "oxygen"
    )
  })

  it("keeps a training agency and course only on a Training dive", () => {
    const training = { trainingAgency: "PADI", trainingCourse: "Deep" }
    expect(
      diveFieldsSchema.parse({ ...dive, diveType: "training", ...training })
    ).toMatchObject(training)
    const recreation = diveFieldsSchema.parse({ ...dive, ...training })
    expect(recreation).not.toHaveProperty("trainingAgency")
    expect(recreation).not.toHaveProperty("trainingCourse")
  })

  it("adds no keys for fields that were not sent", () => {
    const fields = diveFieldsSchema.parse({
      ...dive,
      diveType: "training",
      oxygen: 320,
    })
    expect(Object.keys(fields)).not.toContain("trainingAgency")
    expect(Object.keys(fields)).not.toContain("oxygen")
  })

  it("takes a surface interval override in seconds or as no previous dive", () => {
    expect(parse({ ...dive, surfaceInterval: 3600 }).success).toBe(true)
    expect(parse({ ...dive, surfaceInterval: "none" }).success).toBe(true)
    expect(parse({ ...dive, surfaceInterval: -1 }).success).toBe(false)
    expect(parse({ ...dive, surfaceInterval: "never" }).success).toBe(false)
  })

  it("treats emptied text as no value", () => {
    expect(diveFieldsSchema.parse({ ...dive, notes: "  " })).toMatchObject({
      notes: null,
    })
    expect(
      diveFieldsSchema.parse({ ...dive, notes: " Turtle " })
    ).toMatchObject({ notes: "Turtle" })
  })

  it("takes visibility in metres or as a rating, not both", () => {
    expect(parse({ ...dive, visibility: 12 }).success).toBe(true)
    expect(parse({ ...dive, visibilityRating: "high" }).success).toBe(true)
    expect(
      parse({ ...dive, visibility: 12, visibilityRating: "high" }).success
    ).toBe(false)
  })

  it("checks people and tags", () => {
    expect(
      parse({ ...dive, buddies: ["person-sam"], tags: ["night"] }).success
    ).toBe(true)
    expect(parse({ ...dive, buddies: ["site-sam"] }).success).toBe(false)
    expect(
      parse({ ...dive, buddies: ["person-sam", "person-sam"] }).success
    ).toBe(false)
    expect(
      parse({
        ...dive,
        buddies: ["person-sam"],
        diveProfessionals: ["person-sam"],
      }).success
    ).toBe(false)
    expect(parse({ ...dive, tags: ["sunny"] }).success).toBe(false)
  })

  it("rejects a minimum temperature above the maximum", () => {
    expect(
      parse({ ...dive, minTemperature: 22, maxTemperature: 21 }).success
    ).toBe(false)
    expect(
      parse({ ...dive, minTemperature: -1.5, maxTemperature: 2 }).success
    ).toBe(true)
  })

  it("rejects an average depth deeper than the maximum", () => {
    expect(parse({ ...dive, averageDepth: 21 }).success).toBe(true)
    expect(parse({ ...dive, averageDepth: 33 }).success).toBe(false)
  })

  // Each limit is the edge of what any dive can reach: the edge passes,
  // one step past it fails with the message the form shows.
  it.each([
    ["maxDepth", 350, 350.1, "Up to 350 m"],
    ["averageDepth", 350, 350.1, "Up to 350 m"],
    ["duration", 86_400, 86_401, "Up to 24 h"],
    ["surfaceInterval", 172_800, 172_801, "Up to 48 h, or No previous dive"],
    ["startPressure", 300, 300.5, "Up to 300 bar"],
    ["endPressure", 0, 300.5, "Up to 300 bar"],
    ["cylinderVolume", 20_000, 20_001, "Up to 20 L"],
    ["weight", 40, 40.5, "Up to 40 kg"],
    ["minTemperature", -3, -3.1, "From −3 °C"],
    ["maxTemperature", 40, 40.1, "Up to 40 °C"],
    ["visibility", 150, 151, "Up to 150 m"],
  ])("limits %s to %s", (field, edge, past, message) => {
    // Deep enough that an average depth at its edge isn't below the max.
    const deep = { ...dive, maxDepth: 350 }
    expect(parse({ ...deep, [field]: edge }).success).toBe(true)
    const result = parse({ ...deep, [field]: past })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ path: [field], message })
  })

  it("rejects an end pressure above the start", () => {
    expect(
      parse({ ...dive, startPressure: 200, endPressure: 60 }).success
    ).toBe(true)
    expect(
      parse({ ...dive, startPressure: 60, endPressure: 200 }).error?.issues
    ).toMatchObject([
      { path: ["endPressure"], message: "Above the start pressure" },
    ])
  })
})

describe("diveFieldsPatch", () => {
  it("takes only the changed fields", () => {
    expect(diveFieldsPatch.parse({ notes: "Turtle at the drop-off" })).toEqual({
      notes: "Turtle at the drop-off",
    })
  })

  it("clears optional fields with null but never required ones", () => {
    expect(diveFieldsPatch.parse({ weight: null })).toEqual({ weight: null })
    expect(diveFieldsPatch.safeParse({ maxDepth: null }).success).toBe(false)
    expect(diveFieldsPatch.safeParse({ diveType: null }).success).toBe(false)
    expect(diveFieldsPatch.safeParse({ ignored: null }).success).toBe(false)
    expect(diveFieldsPatch.parse({ ignored: true })).toEqual({ ignored: true })
  })

  it("clears an emptied text field", () => {
    expect(diveFieldsPatch.parse({ notes: "" })).toEqual({ notes: null })
  })

  it("clears a surface interval override or sets it to no previous dive", () => {
    expect(diveFieldsPatch.parse({ surfaceInterval: null })).toEqual({
      surfaceInterval: null,
    })
    expect(diveFieldsPatch.parse({ surfaceInterval: "none" })).toEqual({
      surfaceInterval: "none",
    })
  })

  it("drops training details sent with a type other than Training", () => {
    expect(diveFieldsPatch.parse({ diveType: "recreation" })).toEqual({
      diveType: "recreation",
    })
    expect(
      diveFieldsPatch.parse({ diveType: "recreation", trainingAgency: "SSI" })
    ).toEqual({ diveType: "recreation" })
    expect(
      diveFieldsPatch.parse({ diveType: "training", trainingAgency: "SSI" })
    ).toEqual({ diveType: "training", trainingAgency: "SSI" })
  })

  it("needs oxygen when nitrox is turned on, unless it is already stored", () => {
    expect(
      diveFieldsPatch.safeParse({ nitrox: true, oxygen: null }).success
    ).toBe(false)
    expect(diveFieldsPatch.safeParse({ nitrox: true }).success).toBe(true)
  })

  it("drops oxygen sent with nitrox turned off", () => {
    expect(diveFieldsPatch.parse({ nitrox: false, oxygen: 320 })).toEqual({
      nitrox: false,
    })
  })

  it("checks temperature order and average depth when both are sent", () => {
    expect(
      diveFieldsPatch.safeParse({ minTemperature: 30, maxTemperature: 10 })
        .success
    ).toBe(false)
    expect(
      diveFieldsPatch.safeParse({ averageDepth: 30, maxDepth: 10 }).success
    ).toBe(false)
    expect(diveFieldsPatch.safeParse({ averageDepth: 30 }).success).toBe(true)
    expect(
      diveFieldsPatch.safeParse({ startPressure: 60, endPressure: 200 }).success
    ).toBe(false)
    expect(diveFieldsPatch.safeParse({ endPressure: 200 }).success).toBe(true)
  })

  it("rejects visibility in metres and as a rating together", () => {
    expect(
      diveFieldsPatch.safeParse({ visibility: 8, visibilityRating: "low" })
        .success
    ).toBe(false)
    expect(
      diveFieldsPatch.safeParse({ visibility: 8, visibilityRating: null })
        .success
    ).toBe(true)
  })
})
