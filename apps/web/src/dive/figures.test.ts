import { describe, expect, it } from "vitest"

import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"

import { diveFigures, recentSac } from "./figures"

// An air dive whose SAC rate follows its end pressure; no end pressure, no
// SAC rate.
const dive = (day: number, endPressure: number | null, extra = {}) =>
  ({
    id: `dive-${day}`,
    startTime: `2026-07-${String(day).padStart(2, "0")}T09:00:00`,
    siteId: "site-a",
    duration: 2700,
    maxDepth: 18,
    averageDepth: 12,
    nitrox: false,
    oxygen: null,
    cylinderVolume: 12000,
    startPressure: 200,
    endPressure,
    ignored: false,
    sampleDuration: null,
    sampleAverageDepth: null,
    ...extra,
  }) as unknown as Dive

const logOf = (dives: Dive[]) =>
  ({
    // Newest first, as the log keeps them.
    dives: [...dives].reverse(),
    sites: new Map(),
    fieldMeta: new Map(),
    settings: { maxPo2: 1.4 },
  }) as unknown as LogView

describe("recent SAC rates", () => {
  it("takes the five latest dives before this one that have a rate", () => {
    const dives = [
      dive(1, 40),
      dive(2, 50),
      dive(3, 60),
      dive(4, null),
      dive(5, 70),
      dive(6, 80, { ignored: true }),
      dive(7, 90),
      dive(8, 100),
      dive(9, 110),
      dive(10, 120),
    ]
    const log = logOf(dives)
    const sac = (day: number) => diveFigures(dives[day - 1]!, log).sac
    // Dive 10 is later, 6 is ignored and 4 has no rate.
    expect(recentSac(dives[8]!, log)).toEqual([
      sac(8),
      sac(7),
      sac(5),
      sac(3),
      sac(2),
    ])
  })

  it("has nothing to compare against with fewer than five", () => {
    const dives = [dive(1, 40), dive(2, 50), dive(3, null), dive(4, 60)]
    expect(recentSac(dives[3]!, logOf(dives))).toBeNull()
  })
})
