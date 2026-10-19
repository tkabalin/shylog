import { describe, expect, it } from "vitest"

import { idSchema, newId } from "./ids.ts"

describe("newId", () => {
  it("prefixes a UUID with the kind", () => {
    expect(newId("dive")).toMatch(
      /^dive-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(newId("diveCentre")).toMatch(/^centre-/)
    expect(newId("site")).not.toBe(newId("site"))
  })
})

describe("idSchema", () => {
  const siteId = idSchema("site")

  it("accepts a generated id of its kind", () => {
    expect(siteId.safeParse(newId("site")).success).toBe(true)
  })

  it.each([
    ["another kind's id", "dive-1"],
    ["a leading digit", "1site-a"],
    ["no prefix", "abc"],
    ["an empty suffix", "site-"],
    ["a space", "site-a b"],
    ["a character XML ids can't hold", "site-a:b"],
    ["a non-ASCII letter", "site-é"],
    ["a number", 42],
  ])("rejects %s", (_, value) => {
    expect(siteId.safeParse(value).success).toBe(false)
  })
})
