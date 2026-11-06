import { describe, expect, it } from "vitest"

import { readUddf } from "./reader.ts"

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

  it("skips a dive with no tank data, as a freedive has", () => {
    const freedive = dive("air").replace(/<tankdata>.*<\/tankdata>/, "")
    expect(readUddf(uddf(freedive + dive("ean32")))).toHaveLength(1)
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

  it("refuses a file that isn't XML", () => {
    expect(() => readUddf("")).toThrow()
  })
})
