import { describe, expect, it } from "vitest"

import { countryName } from "./countries.ts"

describe("countryName", () => {
  it("names a country in English", () => {
    expect(countryName("ZA")).toBe("South Africa")
    expect(countryName("VN")).toBe("Vietnam")
  })

  it("shows a code it doesn't know as itself", () => {
    expect(countryName("QZ")).toBe("QZ")
  })
})
