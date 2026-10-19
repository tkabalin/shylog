import { describe, expect, it } from "vitest"

import { localSeconds } from "./time.ts"

describe("localSeconds", () => {
  it("counts seconds between wall-clock times", () => {
    const a = localSeconds("2019-02-10T11:01:29")
    expect(localSeconds("2019-02-10T11:46:40") - a).toBe(45 * 60 + 11)
  })

  it("carries across midnight, month ends and leap days", () => {
    expect(
      localSeconds("2026-07-21T00:10:00") - localSeconds("2026-07-20T23:50:00")
    ).toBe(20 * 60)
    expect(
      localSeconds("2024-03-01T00:00:00") - localSeconds("2024-02-28T00:00:00")
    ).toBe(2 * 86400)
    expect(
      localSeconds("2026-01-01T00:00:00") - localSeconds("2025-12-31T23:59:59")
    ).toBe(1)
  })

  it("does not depend on the machine's time zone", () => {
    expect(localSeconds("1970-01-01T00:00:00")).toBe(0)
    expect(localSeconds("2026-07-22T08:12:19")).toBe(1784707939)
  })
})
