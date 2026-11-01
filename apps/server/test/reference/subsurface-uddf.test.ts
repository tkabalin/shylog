import { DOMParser } from "@xmldom/xmldom"
import { describe, expect, it } from "vitest"

import { d4iXml, zoopXml } from "../uddf-fixtures.ts"
import { readAsSubsurface, stripUddfNamespace } from "./subsurface-uddf.ts"

const dives = (uddf: string) =>
  Array.from(readAsSubsurface(uddf).getElementsByTagName("dive"))
const d4iDives = () => dives(d4iXml)

// One dive with two buddies and a site, small enough to read many times.
const tiny = (ns: string, links = "") => `<?xml version="1.0"?>
<uddf xmlns="${ns}" version="3.2.0">
  <diver>
    <owner id="owner"/>
    <buddy id="b1"><personal><firstname>Sam</firstname><lastname>Naidoo</lastname></personal></buddy>
    <buddy id="b2"><personal><firstname>Lee</firstname></personal></buddy>
  </diver>
  <divesite><site id="s1"><name>Two-Mile Reef</name></site></divesite>
  <profiledata><repetitiongroup><dive id="d1">
    <informationbeforedive>${links}<datetime>2026-07-22T08:12:19</datetime></informationbeforedive>
    <informationafterdive><greatestdepth>20</greatestdepth><diveduration>1800</diveduration></informationafterdive>
    <applicationdata><shylog xmlns="https://github.com/tkabalin/shylog/uddf"><surface>calm</surface></shylog></applicationdata>
  </dive></repetitiongroup></profiledata>
</uddf>`
const uddf32 = "http://www.streit.cc/uddf/3.2/"

// Subsurface's own exports must survive its own import, or a failure in
// Shylog's export could be the reader's fault rather than the writer's.
describe("reading UDDF as Subsurface does", { timeout: 20_000 }, () => {
  it.each([
    ["D4i", d4iDives, 72],
    ["Zoop Novo", () => dives(zoopXml), 61],
  ])(
    "reads every dive of the %s export with its date and time",
    (_, read, count) => {
      const all = read()
      expect(all).toHaveLength(count)
      expect(
        all.filter((d) => !d.getAttribute("date") || !d.getAttribute("time"))
      ).toEqual([])
    }
  )

  it("reads dive 63 with the figures Shylog imports", () => {
    const dive = d4iDives().find((d) => d.getAttribute("number") === "63")!
    expect(dive.getAttribute("date")).toBe("2026-07-22")
    expect(dive.getAttribute("time")).toBe("08:12:19")
    expect(dive.getAttribute("duration")).toBe("41:40 min")
    expect(dive.getElementsByTagName("depth")[0].getAttribute("max")).toBe(
      "32.66 m"
    )
    expect(dive.getElementsByTagName("cylinder")[0].getAttribute("o2")).toBe(
      "0.32"
    )
  })

  it.each(["3.2/", "3.1/", "4/"])("strips the UDDF %s namespace", (version) => {
    expect(dives(tiny(`http://www.streit.cc/uddf/${version}`))).toHaveLength(1)
  })

  it.each([".3/", "3./", "3..2/", "x/", "3.2"])(
    "reads no dives under a UDDF namespace ending %s",
    (version) => {
      expect(dives(tiny(`http://www.streit.cc/uddf/${version}`))).toHaveLength(
        0
      )
    }
  )

  it("keeps every other namespace", () => {
    const stripped = new DOMParser().parseFromString(
      stripUddfNamespace(tiny(uddf32)),
      "text/xml"
    )
    expect(stripped.documentElement!.namespaceURI).toBeNull()
    expect(stripped.getElementsByTagName("shylog")[0].namespaceURI).toBe(
      "https://github.com/tkabalin/shylog/uddf"
    )
  })

  // Why the spec puts a dive's buddy links before its other links.
  it("joins buddies only when their links come first", () => {
    const buddy = (links: string) =>
      dives(tiny(uddf32, links))[0].getElementsByTagName("buddy")[0].textContent
    const [b1, b2, s1] = [
      '<link ref="b1"/>',
      '<link ref="b2"/>',
      '<link ref="s1"/>',
    ]
    expect(buddy(b1 + b2 + s1)).toBe("Sam Naidoo, Lee")
    expect(buddy(s1 + b1 + b2)).toBe(", Sam Naidoo, Lee")
  })

  it("refuses a file Subsurface wouldn't read as UDDF", () => {
    expect(() => readAsSubsurface("not xml")).toThrow()
    expect(() => readAsSubsurface("<divelog/>")).toThrow("<divelog>")
    expect(() =>
      readAsSubsurface('<uddf><generator name="subsurface"/></uddf>')
    ).toThrow("its own XML")
  })
})
