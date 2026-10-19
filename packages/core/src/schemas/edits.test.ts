import { describe, expect, it } from "vitest"

import {
  mergeEntityRequests,
  patchDiveRequest,
  putEntityRequests,
  putSettingsRequest,
} from "./edits.ts"

describe("patchDiveRequest", () => {
  it("takes changed fields, adoptions and dismissals", () => {
    expect(
      patchDiveRequest.safeParse({
        fields: { notes: "Ragged-tooth sharks" },
        adopt: ["duration"],
        dismiss: ["maxDepth", "minTemperature"],
      }).success
    ).toBe(true)
  })

  it("rejects an empty request", () => {
    expect(patchDiveRequest.safeParse({}).success).toBe(false)
    expect(patchDiveRequest.safeParse({ fields: {}, adopt: [] }).success).toBe(
      false
    )
  })

  it("only adopts or dismisses values a computer can disagree with", () => {
    expect(patchDiveRequest.safeParse({ adopt: ["notes"] }).success).toBe(false)
  })

  it("ignores a field left undefined when checking adoptions", () => {
    expect(
      patchDiveRequest.safeParse({
        fields: { duration: undefined, notes: "Turtle" },
        adopt: ["duration"],
      }).success
    ).toBe(true)
  })

  it("rejects a field that is both typed and adopted, or adopted and dismissed", () => {
    expect(
      patchDiveRequest.safeParse({
        fields: { duration: 2700 },
        adopt: ["duration"],
      }).success
    ).toBe(false)
    expect(
      patchDiveRequest.safeParse({
        adopt: ["duration"],
        dismiss: ["duration"],
      }).success
    ).toBe(false)
  })
})

describe("putEntityRequests", () => {
  it("renames, and clears an optional link with null", () => {
    expect(
      putEntityRequests.site.safeParse({ name: "2 Mile Reef" }).success
    ).toBe(true)
    expect(putEntityRequests.site.safeParse({ regionId: null }).success).toBe(
      true
    )
    expect(putEntityRequests.site.safeParse({ name: null }).success).toBe(false)
    expect(putEntityRequests.trip.safeParse({}).success).toBe(false)
  })

  it("changes a site's water type but never clears it", () => {
    const site = putEntityRequests.site
    expect(site.safeParse({ waterType: "fresh" }).success).toBe(true)
    expect(site.safeParse({ waterType: null }).success).toBe(false)
  })

  it("switches the water type with a new body of water unless one is sent", () => {
    const site = putEntityRequests.site
    expect(site.parse({ bodyOfWater: "pool" })).toEqual({
      bodyOfWater: "pool",
      waterType: "fresh",
    })
    expect(site.parse({ bodyOfWater: null })).toEqual({ bodyOfWater: null })
    expect(site.parse({ bodyOfWater: "pool", waterType: "salt" })).toEqual({
      bodyOfWater: "pool",
      waterType: "salt",
    })
    expect(site.parse({ name: "Miracles" })).toEqual({ name: "Miracles" })
  })
})

describe("mergeEntityRequests", () => {
  it("names a survivor of the same kind", () => {
    expect(
      mergeEntityRequests.person.safeParse({ into: "person-sam" }).success
    ).toBe(true)
    expect(
      mergeEntityRequests.person.safeParse({ into: "site-sam" }).success
    ).toBe(false)
  })
})

describe("putSettingsRequest", () => {
  it("changes one setting without resetting the others", () => {
    expect(putSettingsRequest.parse({ maxPo2: 1.5 })).toEqual({ maxPo2: 1.5 })
    expect(putSettingsRequest.safeParse({ maxPo2: 3 }).success).toBe(false)
    expect(putSettingsRequest.safeParse({}).success).toBe(false)
  })
})
