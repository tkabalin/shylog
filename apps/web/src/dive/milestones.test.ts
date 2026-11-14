import { describe, expect, it } from "vitest"

import { milestoneFor, milestoneProgress } from "./milestones"

// Numbered dives 1 to n, as the server numbers them.
const log = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `dive-${i + 1}`,
    number: i + 1,
    startTime: `2026-01-01T09:${String(i % 60).padStart(2, "0")}:00`,
  }))

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

describe("milestoneProgress", () => {
  it("counts from the first dive towards the first milestone", () => {
    const { passed, next } = milestoneProgress(log(10))
    expect(passed).toEqual([])
    expect(next).toMatchObject({ number: 40, toGo: 30, fraction: 0.25 })
  })

  it("lists those passed with the dive that reached each", () => {
    const { passed, next } = milestoneProgress(log(55))
    expect(passed.map((m) => [m.number, m.dive.id])).toEqual([
      [40, "dive-40"],
      [50, "dive-50"],
    ])
    expect(next).toMatchObject({ number: 60, toGo: 5, fraction: 0.5 })
  })

  it("counts a milestone just reached as passed", () => {
    const { passed, next } = milestoneProgress(log(60))
    expect(passed.at(-1)?.number).toBe(60)
    expect(next).toMatchObject({ number: 100, toGo: 40, fraction: 0 })
  })

  it("counts a queued draft by its provisional number", () => {
    const dives = [
      ...log(39),
      {
        id: "dive-draft",
        number: null,
        provisional: 40,
        startTime: "2026-02-01T09:00:00",
      },
    ]
    const { passed, next } = milestoneProgress(dives)
    expect(passed.map((m) => [m.number, m.dive.id])).toEqual([
      [40, "dive-draft"],
    ])
    expect(next).toMatchObject({ number: 50, toGo: 10 })
  })

  it("leaves out dives with no number, as ignored dives have", () => {
    const dives = [
      ...log(39),
      { id: "dive-ignored", number: null, startTime: "2026-02-01T09:00:00" },
    ]
    const { passed, next } = milestoneProgress(dives)
    expect(passed).toEqual([])
    expect(next).toMatchObject({ number: 40, toGo: 1 })
  })

  it("has nothing next once the last is passed", () => {
    const { passed, next } = milestoneProgress(log(1003))
    expect(passed).toHaveLength(8)
    expect(next).toBeNull()
  })
})
