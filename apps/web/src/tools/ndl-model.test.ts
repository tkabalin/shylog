import { describe, expect, it } from "vitest"

import { ndlText } from "./ndl-model"

describe("ndlText", () => {
  it("gives Bühlmann in whole minutes, rounded down", () => {
    // 23 min 40 s, the descent included.
    expect(ndlText("gf85", 320, 30_000)).toBe("23 min")
    expect(ndlText("gf70", 209, 30_000)).toBe("10 min")
  })

  it("says 6 h+ past the planner's 6 hours", () => {
    expect(ndlText("gf85", 209, 6000)).toBe("6 h+")
  })

  it("reads the Navy table, with no limit to 20 fsw and none past 190", () => {
    expect(ndlText("navy", 209, 18_000)).toBe("63 min")
    expect(ndlText("navy", 209, 6000)).toBe("No limit")
    expect(ndlText("navy", 209, 59_000)).toBe("—")
  })
})
