import { describe, expect, it } from "vitest"

import { readUddf } from "./sample-reader.ts"

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

  it("takes each dive's computer from its link", () => {
    const [d4i, zoop, unknown] = readUddf(
      uddf(dive("air", "dc1") + dive("air", "dc2") + dive("air"))
    )
    expect(d4i.computerModel).toBe("Suunto D4i")
    expect(zoop.computerModel).toBe("Suunto Zoop Novo")
    // Two computers and no link: no guess.
    expect(unknown.computerModel).toBeNull()
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

  it("refuses a file that isn't XML", () => {
    expect(() => readUddf("")).toThrow()
  })
})
