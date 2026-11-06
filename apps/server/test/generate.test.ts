import { readdirSync, readFileSync } from "node:fs"

import { maxPo2 } from "@shylog/core"
import { describe, expect, it } from "vitest"

import { generate } from "../../../fixtures/synthetic/generate.ts"
import { readUddf } from "../src/uddf/reader.ts"
import { d4iXml, fixtureStarts } from "./uddf-fixtures.ts"

const folder = new URL("../../../fixtures/synthetic/", import.meta.url)
const generated = generate()
const read = (name: string) => readUddf(generated[name])
const starts = fixtureStarts(d4iXml)

describe("the synthetic fixtures", () => {
  it("are checked in exactly as the generator makes them", () => {
    expect(
      readdirSync(folder)
        .filter((name) => name.endsWith(".uddf"))
        .sort()
    ).toEqual(Object.keys(generated).sort())
    for (const [name, xml] of Object.entries(generated))
      expect(readFileSync(new URL(name, folder), "utf8"), name).toBe(xml)
  })

  it("put the Sodwana week 5 hours behind, between dives at home", () => {
    const dives = read("abroad.uddf")
    expect(dives.map((dive) => dive.startTime)).toEqual([
      starts.get(51),
      ...[...Array(14).keys()].map((i) => {
        const site = new Date(`${starts.get(52 + i)}Z`)
        site.setUTCHours(site.getUTCHours() - 5)
        return site.toISOString().slice(0, 19)
      }),
      starts.get(66),
    ])
    // Every dive stays on its date, so a day's offset is all there is.
    expect(
      dives.map((dive) => dive.startTime.slice(0, 10)).slice(1, -1)
    ).toEqual(
      [...Array(14).keys()].map((i) => starts.get(52 + i)!.slice(0, 10))
    )
  })

  it("start a dive at 23:40 that ends the next day", () => {
    const [dive] = read("midnight.uddf")
    expect(dive.startTime).toBe("2026-07-22T23:40:00")
    expect(23 * 3600 + 40 * 60 + dive.duration).toBeGreaterThan(24 * 3600)
  })

  it("give a gauge dive no tank data or gas, sampled every 20 s", () => {
    const [dive] = read("gauge.uddf")
    expect(dive.hasTankData).toBe(false)
    expect(dive.hasGas).toBe(false)
    const gaps = dive.samples
      .slice(1)
      .map((sample, i) => sample.time - dive.samples[i].time)
    expect(Math.max(...gaps)).toBe(20)
  })

  it("carry a tank pressure on every sample and on the tank", () => {
    const [dive] = read("pressure.uddf")
    expect(dive.samples[0].pressure).toBe(200)
    expect(dive.samples.every((sample) => sample.pressure != null)).toBe(true)
    expect(dive.startPressure).toBe(200)
    expect(dive.endPressure).toBe(dive.samples.at(-1)!.pressure)
  })

  it("breathe EANx36 to a PO₂ over 1.4 bar", () => {
    const [dive] = read("high-po2.uddf")
    expect(dive.oxygen).toBe(360)
    expect(
      maxPo2(dive.oxygen!, dive.maxDepth, { waterType: "salt" })
    ).toBeGreaterThan(1.4)
  })
})
