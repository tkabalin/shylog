import { describe, expect, it } from "vitest"

import { milestoneFor } from "./milestones"

describe("milestoneFor", () => {
  it("gives a milestone number its line, and nothing for any other", () => {
    expect(milestoneFor(40)?.line).toBe("Can start Divemaster training")
    expect(milestoneFor(100)?.line).toBe(
      "Century diver (can qualify as an instructor)"
    )
    expect(milestoneFor(75)).toBeNull()
    expect(milestoneFor(41)).toBeNull()
    expect(milestoneFor(null)).toBeNull()
  })
})
