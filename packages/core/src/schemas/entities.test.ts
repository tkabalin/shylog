import { describe, expect, it } from "vitest"

import { cardFieldsSchema } from "./cards.ts"
import { entityFields } from "./entities.ts"

describe("entityFields", () => {
  it("trims names and rejects empty ones", () => {
    expect(entityFields.person.parse({ name: " Sam Naidoo " })).toEqual({
      name: "Sam Naidoo",
    })
    expect(entityFields.trip.safeParse({ name: "  " }).success).toBe(false)
  })

  it("defaults a site's water type from its body of water", () => {
    const site = { name: "Long Beach", countryCode: "ZA" }
    expect(entityFields.site.parse(site).waterType).toBe("salt")
    expect(
      entityFields.site.parse({ ...site, bodyOfWater: "lakeQuarry" }).waterType
    ).toBe("fresh")
    expect(
      entityFields.site.parse({
        ...site,
        bodyOfWater: "lakeQuarry",
        waterType: "salt",
      }).waterType
    ).toBe("salt")
  })

  it("takes only ISO 3166 country codes", () => {
    for (const countryCode of ["UK", "EU", "XX"]) {
      expect(
        entityFields.region.safeParse({ name: "Sodwana", countryCode }).success
      ).toBe(false)
    }
    expect(
      entityFields.region.safeParse({ name: "Brighton", countryCode: "GB" })
        .success
    ).toBe(true)
  })

  it("needs a country code for sites and regions", () => {
    expect(entityFields.site.safeParse({ name: "Long Beach" }).success).toBe(
      false
    )
    expect(
      entityFields.region.safeParse({ name: "Sodwana", countryCode: "za" })
        .success
    ).toBe(false)
    expect(
      entityFields.region.safeParse({ name: "Sodwana", countryCode: "ZA" })
        .success
    ).toBe(true)
  })

  it("links a dive centre to a region by id", () => {
    expect(
      entityFields.diveCentre.safeParse({
        name: "Coral Divers",
        regionId: "region-sodwana",
      }).success
    ).toBe(true)
    expect(
      entityFields.diveCentre.safeParse({
        name: "Coral Divers",
        regionId: "site-sodwana",
      }).success
    ).toBe(false)
  })

  it("rejects unknown fields", () => {
    expect(
      entityFields.person.safeParse({ name: "Sam", role: "instructor" }).success
    ).toBe(false)
  })
})

describe("cardFieldsSchema", () => {
  it("needs a name", () => {
    expect(
      cardFieldsSchema.safeParse({ name: "PADI Open Water" }).success
    ).toBe(true)
    expect(cardFieldsSchema.safeParse({}).success).toBe(false)
  })
})
