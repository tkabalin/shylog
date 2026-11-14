import { describe, expect, it } from "vitest"

import type { Pattern } from "./catalogue"
import { byMeasure, score, topThree } from "./score"

const found = (
  id: string,
  value: number,
  fields: Partial<Pattern> = {}
): Pattern => ({
  id,
  type: "difference",
  measure: id.split(":")[1]!,
  field: id.split(":")[2]!,
  score: value,
  words: ["", id, ""],
  groups: [],
  ...fields,
})

describe("score", () => {
  it("is the effect over its minimum times the root of the smaller group", () => {
    // 3.9 L/min over 1.5, six dives in the smaller group.
    expect(score(3.9, 1.5, 6)).toBeCloseTo(2.6 * Math.sqrt(6))
    expect(score(3, 3, 25)).toBe(5)
  })
})

describe("topThree", () => {
  it("picks the highest scores, by rule id on a tie", () => {
    const top = topThree([
      found("difference:sac:current", 4),
      found("difference:maxDepth:buddy", 5),
      found("difference:duration:gas", 5),
      found("difference:ascentAlarms:entry", 4),
    ])
    expect(top.map((p) => p.id)).toEqual([
      "difference:duration:gas",
      "difference:maxDepth:buddy",
      "difference:ascentAlarms:entry",
    ])
  })

  it("keeps one per measure and one per field", () => {
    const top = topThree([
      found("difference:sac:current", 9),
      found("difference:sac:surge", 8),
      found("difference:duration:current", 7),
      found("difference:maxDepth:buddy", 6),
      found("difference:duration:gas", 5),
    ])
    expect(top.map((p) => p.id)).toEqual([
      "difference:sac:current",
      "difference:maxDepth:buddy",
      "difference:duration:gas",
    ])
  })

  it("never shows SAC rate over time, which the screen leads with", () => {
    const top = topThree([
      found("trend:sac", 50, { type: "trend", measure: "sac", field: "time" }),
      found("change:sac", 40, {
        type: "change",
        measure: "sac",
        field: "year",
      }),
      found("difference:sac:current", 3),
    ])
    // SAC against current and the rest still lead.
    expect(top.map((p) => p.id)).toEqual(["difference:sac:current"])
  })

  it("never shows a record or a habit", () => {
    const top = topThree([
      found("record:deepest", 99, { type: "record", measure: "record" }),
      found("habit:gas", 50, { type: "habit", measure: "habit", field: "gas" }),
      found("difference:sac:current", 1),
    ])
    expect(top.map((p) => p.id)).toEqual(["difference:sac:current"])
  })
})

describe("byMeasure", () => {
  it("groups by measure, led by the best, with habits and records last", () => {
    const groups = byMeasure([
      found("record:deepest", 0, {
        type: "record",
        measure: "record",
        field: "deepest",
      }),
      found("record:longest", 0, {
        type: "record",
        measure: "record",
        field: "longest",
      }),
      found("habit:gas", 50, { type: "habit", measure: "habit", field: "gas" }),
      found("difference:sac:current", 3),
      found("difference:duration:gas", 6),
      found("difference:sac:surge", 4),
    ])
    expect(groups.map((g) => [g.measure, g.patterns.map((p) => p.id)])).toEqual(
      [
        ["duration", ["difference:duration:gas"]],
        ["sac", ["difference:sac:surge", "difference:sac:current"]],
        ["habits", ["habit:gas"]],
        ["records", ["record:deepest", "record:longest"]],
      ]
    )
  })
})
