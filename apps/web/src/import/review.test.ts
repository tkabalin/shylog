import type { ComputerDive, ImportPreview } from "@shylog/core"
import { describe, expect, it } from "vitest"

import {
  applyRequest,
  carryOver,
  choose,
  chooseFor,
  clockDay,
  entries,
  firstDayToCheck,
  gapText,
  offsetText,
  pairWarning,
  review,
  stepOffset,
  yourComputer,
} from "./review"

const computer = (
  ref: string,
  startTime: string,
  extra: Partial<ComputerDive> = {}
): ComputerDive => ({
  ref,
  day: startTime.slice(0, 10),
  computerStartTime: startTime,
  startTime,
  duration: 2700,
  maxDepth: 18,
  averageDepth: 11,
  minTemperature: 20,
  maxTemperature: 22,
  profile: null,
  oxygen: null,
  site: null,
  unsupportedGas: false,
  ...extra,
})

// Two days: on the 25th two hand dives pair and a third computer dive is
// new; on the 26th a hand dive is unpaired beside a new dive, with a
// freedive and a dive under five minutes left out.
const preview: ImportPreview = {
  id: "import-a",
  basedOnVersion: "v1",
  revision: 2,
  createdAt: "2026-11-07T10:00:00.000Z",
  expiresAt: "2026-11-14T10:00:00.000Z",
  computerModel: "Suunto D4i",
  days: [
    { date: "2026-07-25", estimatedOffset: 0, offset: 0 },
    { date: "2026-07-26", estimatedOffset: 300, offset: 315 },
  ],
  pairs: [
    {
      computerDive: computer("c1", "2026-07-25T09:14:00"),
      diveId: "dive-1",
    },
    {
      computerDive: computer("c2", "2026-07-25T12:40:00"),
      diveId: "dive-2",
    },
  ],
  newDives: [
    computer("c3", "2026-07-25T15:00:00"),
    computer("c4", "2026-07-26T11:35:00"),
  ],
  unpaired: [{ diveId: "dive-3", day: "2026-07-26", nearestStartGap: 9900 }],
  leftOut: [
    {
      ...computer("f1", "2026-07-26T10:02:00", { duration: 52 }),
      reason: "freedive",
    },
    {
      ...computer("s1", "2026-07-26T10:30:00", { duration: 160 }),
      reason: "short",
    },
  ],
  alreadyImported: 14,
}

const hands = new Map([
  ["dive-1", { startTime: "2026-07-25T09:12:00" }],
  ["dive-2", { startTime: "2026-07-25T12:38:00" }],
  ["dive-3", { startTime: "2026-07-26T08:50:00" }],
])

describe("the review as proposed", () => {
  it("names the computer from the preview's model", () => {
    expect(yourComputer(preview)).toBe("your D4i")
    expect(yourComputer({ computerModel: "Suunto Zoop Novo" })).toBe(
      "your Zoop Novo"
    )
    expect(yourComputer({ computerModel: null })).toBe("your dive computer")
  })

  it("sorts every computer dive into its section, newest first", () => {
    const current = review(preview, {}, hands)
    expect(current.paired.map((pair) => pair.diveId)).toEqual([
      "dive-2",
      "dive-1",
    ])
    expect(current.newDives.map(({ entry }) => entry.dive.ref)).toEqual([
      "c4",
      "c3",
    ])
    // Freedives and dives under five minutes share one list, left out.
    expect(
      current.leftOut.map(({ entry, included }) => [entry.reason, included])
    ).toEqual([
      ["short", false],
      ["freedive", false],
    ])
    expect(current.notPaired).toEqual([
      // 08:50 against the day's nearest computer dive, the 10:02 freedive.
      { diveId: "dive-3", day: "2026-07-26", gap: 72 * 60 },
    ])
  })

  it("counts paired, added and included dives on the button", () => {
    expect(review(preview, {}, hands).counts).toEqual({
      paired: 2,
      added: 2,
      included: 0,
      skipped: 0,
      total: 4,
    })
  })

  it("sends the proposal as apply's body", () => {
    expect(applyRequest(preview, {})).toEqual({
      revision: 2,
      pairs: [
        { computerDive: "c1", diveId: "dive-1" },
        { computerDive: "c2", diveId: "dive-2" },
      ],
      add: ["c3", "c4"],
      include: [],
    })
  })
})

describe("changing the review", () => {
  it("counts an unticked new dive as skipped, and leaves it out of apply", () => {
    const overrides = choose(preview, {}, "c3", { kind: "skip" })
    expect(review(preview, overrides, hands).counts).toMatchObject({
      added: 1,
      skipped: 1,
      total: 3,
    })
    expect(applyRequest(preview, overrides).add).toEqual(["c4"])
  })

  it("adds an included left-out dive to the total, as include", () => {
    const overrides = choose(preview, {}, "f1", { kind: "add" })
    expect(review(preview, overrides, hands).counts).toMatchObject({
      included: 1,
      total: 5,
    })
    expect(applyRequest(preview, overrides).include).toEqual(["f1"])
  })

  it("takes a hand dive from the computer dive it had, which is then added", () => {
    const overrides = choose(preview, {}, "c3", {
      kind: "pair",
      diveId: "dive-2",
    })
    const current = review(preview, overrides, hands)
    expect(current.paired.map(({ entry }) => entry.dive.ref)).toEqual([
      "c3",
      "c1",
    ])
    expect(current.newDives).toContainEqual({
      entry: entries(preview).get("c2"),
      added: true,
    })
  })

  it("pairs a hand dive from its own screen, or leaves it unpaired", () => {
    const paired = chooseFor(preview, {}, "dive-3", "c4")
    expect(review(preview, paired, hands).notPaired).toEqual([])
    const unpaired = chooseFor(preview, {}, "dive-1", null)
    expect(
      review(preview, unpaired, hands).notPaired.map((h) => h.diveId)
    ).toEqual(["dive-3", "dive-1"])
    expect(applyRequest(preview, unpaired).add).toContain("c1")
    // Nothing to undo for a dive that isn't paired.
    expect(chooseFor(preview, {}, "dive-3", null)).toEqual({})
  })

  it("leaves a paired dive under five minutes out once unpaired", () => {
    const blip: ImportPreview = {
      ...preview,
      pairs: [
        {
          computerDive: computer("b1", "2026-07-25T09:14:00", {
            duration: 200,
          }),
          diveId: "dive-1",
        },
      ],
    }
    const overrides = chooseFor(blip, {}, "dive-1", null)
    expect(review(blip, overrides, hands).leftOut[0]).toMatchObject({
      entry: { reason: "short" },
      included: false,
    })
  })

  it("keeps choices on days not proposed again", () => {
    const overrides = {
      ...choose(preview, {}, "c3", { kind: "skip" }),
      ...choose(preview, {}, "c4", { kind: "skip" }),
      ...choose(preview, {}, "f1", { kind: "pair", diveId: "dive-9" }),
    }
    const kept = carryOver(
      preview,
      overrides,
      new Set(["2026-07-26"]),
      () => true
    )
    expect(kept).toEqual({ c3: { kind: "skip" } })
    // A pair with a dive since given a computer dive goes too.
    expect(
      carryOver(
        preview,
        { c3: { kind: "pair", diveId: "dive-9" } },
        new Set(),
        () => false
      )
    ).toEqual({})
  })

  it("drops a pick from another day whose dive the new proposal pairs", () => {
    // c4 on the 26th was paired by hand with dive-1; the 25th, proposed
    // again, pairs dive-1 with c1, so apply would get it twice.
    const overrides = { c4: { kind: "pair", diveId: "dive-1" } } as const
    expect(
      carryOver(preview, overrides, new Set(["2026-07-25"]), () => true)
    ).toEqual({})
    expect(
      carryOver(preview, overrides, new Set(["2026-07-27"]), () => true)
    ).toEqual(overrides)
  })
})

describe("the clock sheet", () => {
  it("steps by 15 minutes, no further than 14 hours", () => {
    expect(stepOffset(0, 1)).toBe(15)
    expect(stepOffset(0, -1)).toBe(-15)
    expect(stepOffset(840, 1)).toBe(840)
    expect(stepOffset(-840, -1)).toBe(-840)
  })

  it("writes offsets as the board does", () => {
    expect(offsetText(0)).toBe("0:00")
    expect(offsetText(300)).toBe("+5:00")
    expect(offsetText(-75)).toBe("−1:15")
  })

  it("shows how many of the day's dives pair, and its reset", () => {
    expect(clockDay(preview, {}, "2026-07-25")).toEqual({
      offset: 0,
      pairLine: "2 of 2 logged dives paired",
      allPaired: true,
      reset: null,
    })
    // Moved off a +5:00 estimate: back to it.
    expect(clockDay(preview, {}, "2026-07-26")).toEqual({
      offset: 315,
      pairLine: "0 of 1 logged dive paired",
      allPaired: false,
      reset: "Use +5:00",
    })
    const moved = {
      ...preview,
      days: [{ date: "2026-07-25", estimatedOffset: 0, offset: 15 }],
    }
    expect(clockDay(moved, {}, "2026-07-25").reset).toBe("Reset")
  })

  it("opens on the newest day whose logged dives didn't all pair", () => {
    expect(firstDayToCheck(preview, review(preview, {}, hands))).toBe(
      "2026-07-26"
    )
    // The 25th is the only day left with an unpaired dive.
    const settled = chooseFor(preview, {}, "dive-3", "c4")
    const older = chooseFor(preview, settled, "dive-1", null)
    expect(firstDayToCheck(preview, review(preview, older, hands))).toBe(
      "2026-07-25"
    )
    // Every logged dive pairs: the newest day with any.
    expect(firstDayToCheck(preview, review(preview, settled, hands))).toBe(
      "2026-07-26"
    )
  })
})

describe("a pairing made by hand", () => {
  const entry = entries(preview).get("c1")!
  const hand = {
    startTime: "2026-07-25T09:12:00",
    duration: 2700,
    maxDepth: 18.2,
    averageDepth: 11,
  }

  it("passes when the dives look the same", () => {
    expect(pairWarning(entry, hand)).toBeNull()
  })

  it("warns across days", () => {
    expect(
      pairWarning(entry, { ...hand, startTime: "2026-07-24T09:12:00" })
    ).toBe("These are on different days. Your values are kept either way.")
  })

  it("warns when the dives fail the same-dive test", () => {
    expect(
      pairWarning(entry, { ...hand, startTime: "2026-07-25T12:38:00" })
    ).toBe(
      "These start 3 h 24 min apart and look like different dives. Your values are kept either way."
    )
    expect(pairWarning(entry, { ...hand, maxDepth: 30 })).toBe(
      "These look like different dives. Your values are kept either way."
    )
  })

  it("writes gaps in hours and minutes", () => {
    expect(gapText(600)).toBe("10 min")
    expect(gapText(3 * 3600)).toBe("3 h")
    expect(gapText(3 * 3600 + 24 * 60)).toBe("3 h 24 min")
  })
})
