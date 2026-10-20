import { describe, expect, it } from "vitest"

import { testDb } from "../../test/db.ts"
import { prepared } from "./prepared.ts"

describe("prepared", () => {
  it("prepares a statement once and resets pluck for the next caller", () => {
    const db = testDb()
    const sql = "SELECT code FROM countries WHERE code = ?"
    expect(prepared(db, sql)).toBe(prepared(db, sql))
    expect(prepared(db, sql).pluck().get("ZA")).toBe("ZA")
    expect(prepared(db, sql).get("ZA")).toEqual({ code: "ZA" })
  })
})
