import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { d4iXml } from "../../test/uddf-fixtures.ts"
import { readUddf } from "../uddf/reader.ts"
import { fingerprint } from "./fingerprint.ts"

const dive = {
  startTime: "2026-07-22T08:12:19",
  duration: 2500,
  maxDepth: 32.66,
}

describe("fingerprint", () => {
  it("is the computer's start, the duration and the max depth in mm", () => {
    expect(fingerprint(dive)).toBe("2026-07-22T08:12:19 2500 32660")
  })

  it("tells apart dives that differ in any of the three", () => {
    const prints = new Set([
      fingerprint(dive),
      fingerprint({ ...dive, startTime: "2026-07-22T08:12:20" }),
      fingerprint({ ...dive, duration: 2501 }),
      fingerprint({ ...dive, maxDepth: 32.661 }),
    ])
    expect(prints.size).toBe(4)
  })

  it("is the same however the export writes the numbers", () => {
    const rewritten = d4iXml
      .replace(
        "<greatestdepth>32.66</greatestdepth>",
        "<greatestdepth>32.660</greatestdepth>"
      )
      .replace(
        "<diveduration>2500</diveduration>",
        "<diveduration>2500.0</diveduration>"
      )
    expect(rewritten).not.toBe(d4iXml)
    expect(readUddf(rewritten).map(fingerprint)).toEqual(
      readUddf(d4iXml).map(fingerprint)
    )
  })

  it("is the same for a dive in a second export of it", () => {
    const prints = new Set(readUddf(d4iXml).map(fingerprint))
    expect(prints.size).toBe(72)
    // The synthetic files are new exports of D4i dives. Where a dive's
    // start, duration and depth are untouched (only its samples or gas
    // changed, or it was dived at home), the fingerprint matches.
    const again = (name: string) =>
      readUddf(
        readFileSync(
          new URL(`../../../../fixtures/synthetic/${name}`, import.meta.url),
          "utf8"
        )
      ).map(fingerprint)
    for (const name of ["pressure.uddf", "high-po2.uddf", "gauge.uddf"])
      expect(prints.has(again(name)[0]), name).toBe(true)
    const abroad = again("abroad.uddf")
    expect(abroad.map((print) => prints.has(print))).toEqual([
      true,
      ...Array(14).fill(false),
      true,
    ])
  })
})
