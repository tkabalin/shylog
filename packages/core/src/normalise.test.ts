import { describe, expect, it } from "vitest"

import { normaliseName, placeKey } from "./normalise.ts"

describe("normaliseName", () => {
  it("ignores case, trailing and repeated spaces, and accents", () => {
    const key = normaliseName("Long Beach")
    expect(key).toBe("long beach")
    expect(normaliseName("long beach ")).toBe(key)
    expect(normaliseName("Lông Beách")).toBe(key)
    expect(normaliseName("Long  Beach")).toBe(key)
    expect(normaliseName("\tLong Beach")).toBe(key)
  })

  it("matches Vietnamese names with and without diacritics", () => {
    expect(normaliseName("Hòn Dài")).toBe(normaliseName("Hon Dai"))
    expect(normaliseName("Cù Lao Chàm")).toBe("cu lao cham")
  })

  it("folds letters Unicode does not decompose", () => {
    expect(normaliseName("đ")).toBe("d")
    expect(normaliseName("Đà Nẵng")).toBe("da nang")
    expect(normaliseName("Łódź")).toBe("lodz")
  })

  it("matches letters whose capitals lowercase differently", () => {
    expect(normaliseName("Sığacık")).toBe(normaliseName("SIĞACIK"))
    expect(normaliseName("Großer See")).toBe(normaliseName("GROSSER SEE"))
  })

  it("treats curly and straight quotes alike", () => {
    expect(normaliseName("Simon’s Town")).toBe(normaliseName("Simon's Town"))
    expect(normaliseName("“Blue” Hole")).toBe(normaliseName('"Blue" Hole'))
  })

  it("keeps marks that make a different word in other scripts", () => {
    expect(normaliseName("ガ")).not.toBe(normaliseName("カ"))
    expect(normaliseName("किम")).not.toBe(normaliseName("कम"))
    expect(normaliseName("Мой")).not.toBe(normaliseName("Мои"))
    expect(normaliseName("Ёлка")).not.toBe(normaliseName("Елка"))
    expect(normaliseName("ЁЛКА")).toBe(normaliseName("ёлка"))
  })

  it("keeps other punctuation", () => {
    expect(normaliseName("Two-Mile Reef")).not.toBe(
      normaliseName("Two Mile Reef")
    )
  })
})

describe("placeKey", () => {
  it("scopes the key to a country", () => {
    expect(placeKey("long beach ", "ZA")).toBe(placeKey("Long Beach", "ZA"))
    expect(placeKey("Long Beach", "ZA")).not.toBe(placeKey("Long Beach", "VN"))
  })
})
