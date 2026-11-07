import { describe, expect, it } from "vitest"

import {
  importApplyRequest,
  importOffsetRequest,
  importPreviewSchema,
} from "./import.ts"

const computerDive = {
  ref: "id119",
  day: "2026-07-22",
  computerStartTime: "2026-07-22T03:12:19",
  startTime: "2026-07-22T08:12:19",
  duration: 2520,
  maxDepth: 32.66,
  averageDepth: 18.4,
  minTemperature: 22,
  maxTemperature: 24,
  profile: [0, 32.66],
  unsupportedGas: false,
}

describe("importPreviewSchema", () => {
  it("takes a preview with each kind of dive", () => {
    const preview = {
      id: "import-1",
      basedOnVersion: "v1",
      revision: 2,
      createdAt: "2026-11-06T10:00:00.000Z",
      expiresAt: "2026-11-13T10:00:00.000Z",
      computerModel: "Suunto D4i",
      days: [{ date: "2026-07-22", estimatedOffset: 300, offset: 315 }],
      pairs: [{ computerDive, diveId: "dive-1" }],
      newDives: [{ ...computerDive, ref: "id120" }],
      unpaired: [{ diveId: "dive-2", day: "2026-07-22", nearestStartGap: 60 }],
      leftOut: [{ ...computerDive, ref: "id121", reason: "short" }],
      alreadyImported: 3,
    }
    expect(importPreviewSchema.parse(preview)).toEqual(preview)
  })

  it("refuses a computer dive with a zone on its start", () => {
    expect(
      importPreviewSchema.shape.newDives.safeParse([
        { ...computerDive, startTime: "2026-07-22T08:12:19Z" },
      ]).success
    ).toBe(false)
  })
})

describe("importOffsetRequest", () => {
  it("takes 15-minute steps up to 14 hours either way, or null to reset", () => {
    for (const offset of [-840, -15, 0, 15, 300, 840, null]) {
      expect(
        importOffsetRequest.safeParse({ date: "2026-07-22", offset }).success
      ).toBe(true)
    }
    for (const offset of [10, 855, -855, 7.5]) {
      expect(
        importOffsetRequest.safeParse({ date: "2026-07-22", offset }).success
      ).toBe(false)
    }
  })

  it("refuses a day that isn't a date", () => {
    expect(
      importOffsetRequest.safeParse({ date: "22 Jul", offset: 0 }).success
    ).toBe(false)
  })
})

describe("importApplyRequest", () => {
  const request = {
    revision: 0,
    pairs: [{ computerDive: "id119", diveId: "dive-1" }],
    add: ["id120"],
    include: ["id121"],
  }

  it("takes pairs, dives to add and left-out dives to include", () => {
    expect(importApplyRequest.parse(request)).toEqual(request)
  })

  it("refuses a computer dive named twice", () => {
    expect(
      importApplyRequest.safeParse({ ...request, include: ["id120"] }).success
    ).toBe(false)
  })

  it("refuses a logged dive paired twice", () => {
    expect(
      importApplyRequest.safeParse({
        ...request,
        pairs: [
          { computerDive: "id119", diveId: "dive-1" },
          { computerDive: "id122", diveId: "dive-1" },
        ],
      }).success
    ).toBe(false)
  })
})
