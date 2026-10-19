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
})
