import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  byFixtureNumber,
  fixtureStarts,
  d4iXml,
} from "../../test/uddf-fixtures.ts"
import { sampleTemperatures } from "../derived.ts"
import { leftOut } from "../import/freedive.ts"
import { readUddf, UnreadableUddf } from "./reader.ts"

const uddf = (body: string) => `<?xml version="1.0"?>
<uddf xmlns="http://www.streit.cc/uddf/3.2/" version="3.2.0">
  <diver><owner id="owner"><equipment>
    <divecomputer id="dc1"><model>Suunto D4i</model></divecomputer>
    <divecomputer id="dc2"><model>Suunto Zoop Novo</model></divecomputer>
  </equipment></owner></diver>
  <gasdefinitions>
    <mix id="air"><o2>0.209</o2></mix>
    <mix id="ean32"><o2>0.32</o2></mix>
  </gasdefinitions>
  <profiledata><repetitiongroup>${body}</repetitiongroup></profiledata>
</uddf>`

const dive = (mix: string, computer = "") => `<dive>
  <informationbeforedive>
    ${computer && `<link ref="${computer}"/>`}
    <datetime>2026-07-22T08:12:19</datetime>
  </informationbeforedive>
  <tankdata><link ref="${mix}"/></tankdata>
  <samples><waypoint><depth>1</depth><divetime>0</divetime></waypoint></samples>
  <informationafterdive>
    <greatestdepth>20</greatestdepth><diveduration>1800</diveduration>
  </informationafterdive>
</dive>`

describe("readUddf", () => {
  it("reads 21 % or less as air", () => {
    const [airDive, nitrox] = readUddf(uddf(dive("air") + dive("ean32")))
    expect(airDive.oxygen).toBeNull()
    expect(nitrox.oxygen).toBe(320)
  })

  it("flags helium and under 20.9 % oxygen as gases v1 can't hold, read as air", () => {
    const file = uddf(
      dive("air") +
        dive("ean32") +
        dive("trimix") +
        dive("hypoxic") +
        dive("unnamed")
    ).replace(
      "</gasdefinitions>",
      `<mix id="trimix"><o2>0.32</o2><he>0.10</he></mix>
       <mix id="hypoxic"><o2>0.18</o2></mix>
       <mix id="unnamed"><name>air</name></mix></gasdefinitions>`
    )
    const dives = readUddf(file)
    expect(dives.map((read) => read.unsupportedGas)).toEqual([
      false,
      false,
      true,
      true,
      false,
    ])
    expect(dives.map((read) => read.oxygen)).toEqual([
      null,
      320,
      null,
      null,
      null,
    ])
  })

  it("keeps each dive's export id, or its place in the file without one", () => {
    const file = uddf(
      dive("air").replace("<dive>", '<dive id="id7">') + dive("air")
    )
    expect(readUddf(file).map((read) => read.ref)).toEqual(["id7", "dive 2"])
  })

  it("finds the gas whichever tank data link names it", () => {
    const tankFirst = dive("ean32").replace(
      "<tankdata>",
      '<tankdata><link ref="tank-steel-12000"/>'
    )
    expect(readUddf(uddf(tankFirst))[0].oxygen).toBe(320)
  })

  it("takes each dive's computer from its link", () => {
    const [d4i, zoop, unknown] = readUddf(
      uddf(dive("air", "dc1") + dive("air", "dc2") + dive("air"))
    )
    expect(d4i.computerModel).toBe("Suunto D4i")
    expect(zoop.computerModel).toBe("Suunto Zoop Novo")
    // Two computers and no link: no guess.
    expect(unknown.computerModel).toBeNull()
  })

  it("gives unlinked dives the one computer only when no dive links it", () => {
    const one = (body: string) =>
      uddf(body).replace(/\s*<divecomputer id="dc2">.*<\/divecomputer>/, "")
    // Subsurface's export from one computer links none of its dives.
    expect(
      readUddf(one(dive("air") + dive("air"))).map((d) => d.computerModel)
    ).toEqual(["Suunto D4i", "Suunto D4i"])
    // Shylog's links every computer dive, so the other was logged by hand.
    expect(
      readUddf(one(dive("air", "dc1") + dive("air"))).map(
        (d) => d.computerModel
      )
    ).toEqual(["Suunto D4i", null])
  })

  it("pairs ascent alarms in order and keeps an unclosed one open", () => {
    const at = (time: number, alarm = "") =>
      `<waypoint><depth>5</depth><divetime>${time}</divetime>${alarm && `<alarm>${alarm}</alarm>`}</waypoint>`
    const xml = uddf(
      dive("air").replace(
        /<samples>.*<\/samples>/,
        `<samples>${at(0)}${at(60, "ascent")}${at(80, "ascent")}${at(90, "surface")}${at(120, "ascent")}</samples>`
      )
    )
    expect(readUddf(xml)[0].events).toEqual([
      { type: "ascent", start: 60, end: 80 },
      { type: "surface", start: 90, end: null },
      { type: "ascent", start: 120, end: null },
    ])
  })

  it("reads a dive with no tank data or gas, as a freedive has", () => {
    const freedive = dive("air").replace(/<tankdata>.*<\/tankdata>/, "")
    const scuba = dive("ean32").replace(
      "<divetime>0</divetime>",
      '<divetime>0</divetime><switchmix ref="ean32"/>'
    )
    expect(
      readUddf(uddf(freedive + scuba)).map(
        ({ hasTankData, hasGas, oxygen }) => ({
          hasTankData,
          hasGas,
          oxygen,
        })
      )
    ).toEqual([
      { hasTankData: false, hasGas: false, oxygen: null },
      { hasTankData: true, hasGas: true, oxygen: 320 },
    ])
  })

  it("reads tank pressure from pascals", () => {
    const xml = uddf(
      dive("air").replace(
        "<divetime>0</divetime>",
        "<divetime>0</divetime><tankpressure>20000000</tankpressure>"
      )
    )
    expect(readUddf(xml)[0].samples[0].pressure).toBe(200)
  })

  it("reads the weight where Subsurface or UDDF puts it, and Subsurface's 0 as none", () => {
    const before = (kg: string) =>
      dive("air").replace(
        "<datetime>",
        `<equipmentused><leadquantity>${kg}</leadquantity></equipmentused><datetime>`
      )
    const after = (kg: string) =>
      dive("air").replace(
        "<greatestdepth>",
        `<equipmentused><leadquantity>${kg}</leadquantity></equipmentused><greatestdepth>`
      )
    // Only Subsurface's placeholder is none: 0 where UDDF puts it was entered.
    expect(
      readUddf(uddf(before("6") + before("0") + after("4.5") + after("0"))).map(
        (d) => d.weight
      )
    ).toEqual([6, null, 4.5, 0])
  })

  it("reads the dive's notes, not the animals, and an empty para as none", () => {
    const notes = (inner: string) =>
      dive("air").replace(
        "</informationafterdive>",
        `${inner}</informationafterdive>`
      )
    const xml = uddf(
      notes("<notes><para/></notes>") +
        notes(
          "<observations><notes><para>Turtle</para></notes></observations><notes><para> Strong surge\non the reef </para><para>Second</para></notes>"
        )
    )
    expect(readUddf(xml).map((d) => d.notes)).toEqual([
      null,
      "Strong surge\non the reef\n\nSecond",
    ])
  })

  it("reads the minimum temperature and the tank where the file has them", () => {
    const xml = uddf(
      dive("air")
        .replace(
          "<diveduration>",
          "<lowesttemperature>295.15</lowesttemperature><diveduration>"
        )
        .replace(
          "</tankdata>",
          "<tankvolume>0.0111</tankvolume><tankpressurebegin>20000000</tankpressurebegin><tankpressureend>5000000</tankpressureend></tankdata>"
        ) + dive("air")
    )
    const [given, missing] = readUddf(xml)
    expect(given).toMatchObject({
      minTemperature: 22,
      cylinderVolume: 11100,
      startPressure: 200,
      endPressure: 50,
    })
    expect(missing).toMatchObject({
      minTemperature: null,
      cylinderVolume: null,
      startPressure: null,
      endPressure: null,
    })
  })

  it("takes the gas from the switchmix at 0 s before the tank's", () => {
    const xml = uddf(
      dive("air").replace(
        "<divetime>0</divetime>",
        '<divetime>0</divetime><switchmix ref="ean32"/>'
      )
    )
    expect(readUddf(xml)[0].oxygen).toBe(320)
  })

  it.each([
    ["start time", (d: string) => d.replace("2026-07-22T08:12:19", "")],
    ["start time", (d: string) => d.replace("08:12:19", "08:12:19+02:00")],
    ["start time", (d: string) => d.replace("08:12:19", "08:60:19")],
    ["start time", (d: string) => d.replace("2026-07-22", "2026-02-30")],
    [
      "duration",
      (d: string) => d.replace("<diveduration>1800</diveduration>", ""),
    ],
    ["duration", (d: string) => d.replace("1800</", "1800.5</")],
    [
      "depth",
      (d: string) => d.replace("<greatestdepth>20", "<greatestdepth>abc"),
    ],
    [
      "depth",
      (d: string) => d.replace("<greatestdepth>20", "<greatestdepth>0"),
    ],
    [
      "depth",
      (d: string) => d.replace("<greatestdepth>20", "<greatestdepth>351"),
    ],
    [
      "average depth",
      (d: string) =>
        d.replace(
          "<greatestdepth>",
          "<averagedepth>21</averagedepth><greatestdepth>"
        ),
    ],
    [
      "weight",
      (d: string) =>
        d.replace(
          "<greatestdepth>",
          "<equipmentused><leadquantity>-1</leadquantity></equipmentused><greatestdepth>"
        ),
    ],
    [
      "end pressure",
      (d: string) =>
        d.replace(
          "</tankdata>",
          "<tankpressurebegin>5000000</tankpressurebegin><tankpressureend>20000000</tankpressureend></tankdata>"
        ),
    ],
    ["sample time", (d: string) => d.replace("<divetime>0</divetime>", "")],
    [
      "sample time",
      (d: string) =>
        d.replace("<divetime>0</divetime>", "<divetime>0.5</divetime>"),
    ],
    [
      "sample time",
      (d: string) =>
        d.replace(
          "</samples>",
          "<waypoint><depth>2</depth><divetime>20</divetime></waypoint><waypoint><depth>3</depth><divetime>10</divetime></waypoint></samples>"
        ),
    ],
  ])("refuses a file whose dive has no valid %s", (what, spoil) => {
    expect(() => readUddf(uddf(dive("air") + spoil(dive("air"))))).toThrow(
      `Dive 2 in the file has no valid ${what}`
    )
  })

  it("refuses a file in which two dives share an id", () => {
    const named = dive("air").replace("<dive>", '<dive id="id7">')
    expect(() => readUddf(uddf(named + named))).toThrow(
      new UnreadableUddf("Dive 2 in the file repeats another's id")
    )
  })

  it("refuses a file that isn't XML", () => {
    for (const file of ["", "garbage", "<uddf>"]) {
      expect(() => readUddf(file)).toThrow(UnreadableUddf)
    }
  })

  it("refuses an XML file that isn't UDDF", () => {
    const log = `<divelog program="subsurface"><dives><dive number="1" /></dives></divelog>`
    expect(() => readUddf(log)).toThrow(new UnreadableUddf("Not a UDDF file"))
  })
})

describe("readUddf on the D4i export", () => {
  const dives = readUddf(d4iXml)
  const starts = fixtureStarts(d4iXml)
  const fixture = byFixtureNumber(d4iXml, dives)
  const events = dives.flatMap((dive) => dive.events)

  it("reads all 72 dives, with no offset on any start", () => {
    expect(dives).toHaveLength(72)
    for (const dive of dives)
      expect(dive.startTime).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/)
  })

  it("finds the 26 freedives of 28 December 2025 and nothing else", () => {
    const freedives = dives.filter((dive) => leftOut(dive) === "freedive")
    expect(freedives.map((dive) => dive.startTime)).toEqual(
      Array.from({ length: 26 }, (_, i) => starts.get(i + 9))
    )
    for (const dive of freedives) {
      expect(dive.startTime.slice(0, 10)).toBe("2025-12-28")
      expect(dive.duration).toBeGreaterThanOrEqual(8)
      expect(dive.duration).toBeLessThanOrEqual(26)
    }
    expect(Math.min(...freedives.map((dive) => dive.duration))).toBe(8)
    expect(Math.max(...freedives.map((dive) => dive.duration))).toBe(26)
    // Four blips of 100 to 180 s are left out as short; the shortest real
    // dive is 15 minutes.
    expect(
      dives
        .filter((dive) => leftOut(dive) === "short")
        .map((dive) => [dive.startTime, dive.duration])
    ).toEqual([
      ["2021-02-18T09:45:24", 180],
      ["2025-11-05T16:48:12", 100],
      ["2026-01-14T12:46:52", 160],
      ["2026-03-07T09:25:51", 120],
    ])
  })

  it("pairs 59 ascent alarms and keeps 159 surfacings", () => {
    expect(new Set(events.map((event) => event.type))).toEqual(
      new Set(["ascent", "surface"])
    )
    const ascents = events.filter((event) => event.type === "ascent")
    expect(ascents).toHaveLength(59)
    expect(ascents.every((event) => event.end != null)).toBe(true)
    expect(fixture(3).events.find((e) => e.type === "ascent")).toEqual({
      type: "ascent",
      start: 290,
      end: 311,
    })
    const surfacings = events.filter((event) => event.type === "surface")
    expect(surfacings).toHaveLength(159)
    expect(surfacings.every((event) => event.end == null)).toBe(true)
  })

  it("takes the gas from the start, 21 % as air and 32 % as Nitrox 32.0", () => {
    const scuba = dives.filter((dive) => leftOut(dive) == null)
    expect(scuba.every((dive) => dive.hasGas && dive.hasTankData)).toBe(true)
    // Its three mixes: air, EANx32 and EANx33.
    expect(new Set(scuba.map((dive) => dive.oxygen))).toEqual(
      new Set([null, 320, 330])
    )
    expect(fixture(63).oxygen).toBe(320)
  })

  it("merges dive 3's five repeated times", () => {
    const raw = /<divenumber>3<\/divenumber>[\s\S]*?<\/dive>/.exec(d4iXml)![0]
    const written = raw.split("<waypoint>").length - 1
    const times = fixture(3).samples.map((sample) => sample.time)
    expect(new Set(times).size).toBe(times.length)
    expect(times).toHaveLength(written - 5)
  })

  it("keeps dive 6's samples past its duration", () => {
    const dive = fixture(6)
    expect(dive.duration).toBe(180)
    expect(dive.samples.at(-1)!.time).toBe(502)
  })

  it("takes max and average depth from the computer's figures", () => {
    const dive = fixture(63)
    expect(dive.maxDepth).toBe(32.66)
    expect(
      Math.max(...dive.samples.map((sample) => sample.depth))
    ).toBeLessThan(32.66)
    const average =
      /<divenumber>63<\/divenumber>[\s\S]*?<averagedepth>([^<]+)</.exec(
        d4iXml
      )![1]
    expect(dive.averageDepth).toBe(Number(average))
  })

  it("converts temperatures from kelvin, only where the computer wrote one", () => {
    const dive = fixture(63)
    expect(dive.samples[0].temperature).not.toBeNull()
    expect(dive.samples.some((sample) => sample.temperature == null)).toBe(true)
    expect(sampleTemperatures(dive.samples)).toEqual({ min: 23, max: 24 })
  })

  it("reads none of Subsurface's placeholders as data", () => {
    for (const dive of dives) {
      expect(dive.weight).toBeNull()
      expect(dive.notes).toBeNull()
    }
  })
})

it("reads the synthetic gauge dive, no gas and 20 s sampling, as a dive", () => {
  const xml = readFileSync(
    new URL("../../../../fixtures/synthetic/gauge.uddf", import.meta.url),
    "utf8"
  )
  const [dive] = readUddf(xml)
  expect(dive.oxygen).toBeNull()
  expect(leftOut(dive)).toBeNull()
})
