import { describe, expect, it } from "vitest"

import { fixtureDive } from "../../test/fixture.ts"
import { diveEnd, mergeDuplicateSamples } from "./samples.ts"
import { surfaceInterval, type TimedDive } from "./surface-interval.ts"

const timed = (number: number): TimedDive => {
  const dive = fixtureDive(number)
  return {
    startTime: dive.startTime,
    end: diveEnd(dive.duration, mergeDuplicateSamples(dive.samples)),
  }
}

describe("fixture dives", () => {
  it("dive 2 follows dive 1 the same morning", () => {
    // Dive 1 starts at 11:01:29 and its last sample below 0.75 m is at
    // 2111 s, later than its 2040 s duration, so it ends at 11:36:40.
    const dives = [timed(1), timed(2)]
    expect(surfaceInterval(dives[1].startTime, dives)).toBe(600)
  })

  it("dive 8 is 47 days after dive 7, so has no previous dive", () => {
    const dives = [timed(7), timed(8)]
    expect(surfaceInterval(dives[1].startTime, dives)).toBe("none")
  })

  it("dive 1 has no earlier dive", () => {
    expect(surfaceInterval(timed(1).startTime, [timed(1), timed(2)])).toBe(
      "none"
    )
  })
})

describe("surfaceInterval", () => {
  const dive = (startTime: string, end = 3600) => ({ startTime, end })

  it("is 0 when the previous dive was still going", () => {
    const dives = [dive("2026-07-20T08:00:00"), dive("2026-07-20T08:30:00")]
    expect(surfaceInterval("2026-07-20T08:30:00", dives)).toBe(0)
    // Ending exactly at the start is also 0.
    expect(surfaceInterval("2026-07-20T09:00:00", dives.slice(0, 1))).toBe(0)
  })

  it("measures from the dive that started most recently, as Subsurface does", () => {
    // A long dive runs until 12:00; a short one from 09:00 ends at 09:30.
    const dives = [
      dive("2026-07-20T08:00:00", 4 * 3600),
      dive("2026-07-20T09:00:00", 1800),
    ]
    expect(surfaceInterval("2026-07-20T11:00:00", dives)).toBe(5400)
  })

  it("caps at 48 hours", () => {
    const dives = [dive("2026-07-20T08:00:00")]
    // The dive ends at 09:00.
    expect(surfaceInterval("2026-07-22T09:00:00", dives)).toBe(48 * 3600)
    expect(surfaceInterval("2026-07-22T09:00:01", dives)).toBe("none")
  })

  it("ignores dives starting at the same time or later", () => {
    const dives = [dive("2026-07-20T08:00:00"), dive("2026-07-20T10:00:00")]
    expect(surfaceInterval("2026-07-20T08:00:00", dives)).toBe("none")
  })

  it("takes the later-written of two dives that start together", () => {
    const dives = [
      dive("2026-07-20T08:00:00", 1800),
      dive("2026-07-20T08:00:00", 3600),
    ]
    expect(surfaceInterval("2026-07-20T10:00:00", dives)).toBe(3600)
    expect(surfaceInterval("2026-07-20T10:00:00", dives.toReversed())).toBe(
      5400
    )
  })

  it("does not depend on the order of dives with different starts", () => {
    const dives = [
      dive("2026-07-20T12:00:00"),
      dive("2026-07-20T08:00:00"),
      dive("2026-07-20T10:00:00", 1800),
    ]
    expect(surfaceInterval("2026-07-20T12:00:00", dives)).toBe(5400)
  })

  it("lets an override win, including none and 0", () => {
    const dives = [dive("2026-07-20T08:00:00")]
    expect(surfaceInterval("2026-07-20T10:00:00", dives, 1800)).toBe(1800)
    expect(surfaceInterval("2026-07-20T10:00:00", dives, 0)).toBe(0)
    expect(surfaceInterval("2026-07-20T10:00:00", dives, "none")).toBe("none")
    expect(surfaceInterval("2026-07-20T10:00:00", [], 600)).toBe(600)
  })

  it("is calculated when the override is cleared", () => {
    const dives = [dive("2026-07-20T08:00:00")]
    expect(surfaceInterval("2026-07-20T10:00:00", dives, null)).toBe(3600)
    expect(surfaceInterval("2026-07-20T10:00:00", dives, undefined)).toBe(3600)
  })

  it("counts across midnight", () => {
    const dives = [dive("2026-07-20T22:30:00")]
    expect(surfaceInterval("2026-07-21T00:15:00", dives)).toBe(45 * 60)
  })
})
