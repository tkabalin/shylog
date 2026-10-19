import { describe, expect, it } from "vitest"

import {
  bodiesOfWater,
  currents,
  cylinderMaterials,
  defaultWaterType,
  diveTypes,
  entries,
  keysOf,
  thermalComforts,
  workloads,
} from "./enums.ts"

const uddfValues = (options: Record<string, { uddf: string }>) =>
  Object.values(options).map((option) => option.uddf)

describe("UDDF values", () => {
  // Lists copied from the UDDF 3.2.1 documentation, leaving out its
  // "not specified" values, since Shylog omits unset choices, and carbon
  // tanks, which Shylog doesn't offer.
  it.each([
    [
      "program",
      diveTypes,
      [
        "recreation",
        "training",
        "scientific",
        "medical",
        "commercial",
        "military",
        "competitive",
        "other",
      ],
    ],
    [
      "platform",
      entries,
      [
        "beach-shore",
        "pier",
        "small-boat",
        "charter-boat",
        "live-aboard",
        "barge",
        "landside",
        "hyperbaric-facility",
        "other",
      ],
    ],
    [
      "current",
      currents,
      [
        "no-current",
        "very-mild-current",
        "mild-current",
        "moderate-current",
        "hard-current",
        "very-hard-current",
      ],
    ],
    [
      "workload",
      workloads,
      ["resting", "light", "moderate", "severe", "exhausting"],
    ],
    [
      "thermalcomfort",
      thermalComforts,
      ["comfortable", "cold", "very-cold", "hot"],
    ],
    ["tankmaterial", cylinderMaterials, ["steel", "aluminium"]],
    [
      "environment",
      bodiesOfWater,
      [
        "ocean-sea",
        "lake-quarry",
        "river-spring",
        "cave-cavern",
        "pool",
        "hyperbaric-chamber",
        "under-ice",
        "other",
      ],
    ],
  ])("maps every %s key to one UDDF string", (_, options, expected) => {
    expect(uddfValues(options)).toEqual(expected)
    expect(new Set(uddfValues(options)).size).toBe(keysOf(options).length)
  })
})

describe("defaultWaterType", () => {
  it("is fresh for lakes, rivers and pools and salt otherwise", () => {
    expect(defaultWaterType("lakeQuarry")).toBe("fresh")
    expect(defaultWaterType("riverSpring")).toBe("fresh")
    expect(defaultWaterType("pool")).toBe("fresh")
    expect(defaultWaterType("oceanSea")).toBe("salt")
    expect(defaultWaterType("caveCavern")).toBe("salt")
    expect(defaultWaterType(undefined)).toBe("salt")
  })
})
