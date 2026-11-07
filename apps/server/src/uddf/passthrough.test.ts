import type { ImportPreview } from "@shylog/core"
import { DOMParser, type Element } from "@xmldom/xmldom"
import { describe, expect, it } from "vitest"

import { testDb } from "../../test/db.ts"
import { logByHand } from "../../test/hand.ts"
import { d4iXml, syntheticXml } from "../../test/uddf-fixtures.ts"
import { uddfSchemaErrors } from "../../test/uddf-schema.ts"
import { applyImport } from "../import/apply.ts"
import { storePreview } from "../import/preview.ts"
import { passThrough } from "./passthrough.ts"
import { uddfNamespace, writeUddf } from "./writer.ts"

const now = new Date("2026-11-07T10:00:00Z")

// Imports a file as the review proposes it, every left-out dive included,
// and exports the log.
function throughShylog(xml: string, db = testDb()) {
  const preview = storePreview(db, xml, now)
  applyImport(db, preview.id, proposed(preview), now)
  return writeUddf(db).xml
}
const proposed = (preview: ImportPreview) => ({
  revision: preview.revision,
  pairs: preview.pairs.map(({ computerDive, diveId }) => ({
    computerDive: computerDive.ref,
    diveId,
  })),
  add: preview.newDives.map((dive) => dive.ref),
  include: preview.leftOut.map((dive) => dive.ref),
})

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, "text/xml").documentElement!
const all = (parent: Element, name: string) =>
  Array.from(parent.getElementsByTagNameNS(uddfNamespace, name))
const elements = (parent: Element) =>
  Array.from(parent.childNodes).filter(
    (node): node is Element => node.nodeType === node.ELEMENT_NODE
  )
const number = (text: string) =>
  text !== "" && Number.isFinite(Number(text)) ? String(Number(text)) : text

// Each dive by its start, as a set of leaves: the path from the dive, a
// waypoint known by its time, and the value, with a link to a mix read as
// the mix's oxygen and helium, since ids are remapped. Links to anything
// else are left out: Shylog writes its own.
function dives(xml: string) {
  const root = parse(xml)
  const gas = new Map(
    all(root, "mix").map((mix) => [
      mix.getAttribute("id"),
      ["o2", "he"]
        .map((name) => number(all(mix, name)[0]?.textContent ?? "0"))
        .join("/"),
    ])
  )
  const leaves = (element: Element, path: string, into: Set<string>) => {
    const name =
      element.localName === "waypoint"
        ? `waypoint@${all(element, "divetime")[0].textContent}`
        : element.localName
    const at = path ? `${path}/${name}` : name!
    const ref = element.getAttribute("ref")
    if (ref != null) {
      if (gas.has(ref)) into.add(`${at}=${gas.get(ref)}`)
      return
    }
    const children = elements(element)
    if (!children.length) {
      const attributes = Array.from(element.attributes)
        .map((a) => `${a.name}:${a.value}`)
        .sort()
      into.add(`${at}=${number(element.textContent!.trim())}${attributes}`)
    }
    for (const child of children) leaves(child, at, into)
  }
  return new Map(
    all(root, "dive").map((dive) => {
      const into = new Set<string>()
      for (const child of elements(dive)) leaves(child, "", into)
      return [all(dive, "datetime")[0].textContent!, into]
    })
  )
}

// What Subsurface writes that carries no data, Shylog's numbering, and
// waypoints at a repeated time, which are merged on import (see What the
// D4i export contains in the spec).
function ignored(leaf: string, repeated: Set<string>) {
  return (
    leaf.startsWith("informationbeforedive/divenumber=") ||
    leaf === "informationbeforedive/equipmentused/leadquantity=0" ||
    leaf === "informationafterdive/notes/para=" ||
    [...repeated].some((time) => leaf.startsWith(`samples/waypoint@${time}/`))
  )
}

// Whole exports are imported here, which takes seconds under CI's coverage.
describe("pass-through", { timeout: 20_000 }, () => {
  it("gives back every standard element of the D4i's dives", () => {
    const before = dives(d4iXml)
    const after = dives(throughShylog(d4iXml))
    expect(after.size).toBe(72)
    const missing: string[] = []
    for (const [start, leaves] of before) {
      const times = [...leaves]
        .map((leaf) => /^samples\/waypoint@(\d+)\/divetime=/.exec(leaf)?.[1])
        .filter(Boolean)
      const raw = d4iXml
        .split("<dive ")
        .find((dive) => dive.includes(`<datetime>${start}<`))!
      const repeated = new Set(
        times.filter(
          (time) => raw.split(`<divetime>${time}</divetime>`).length > 2
        ) as string[]
      )
      for (const leaf of leaves)
        if (!ignored(leaf, repeated) && !after.get(start)?.has(leaf))
          missing.push(`${start} ${leaf}`)
    }
    expect(missing).toEqual([])
  })

  it("writes an export of the D4i's dives that passes the UDDF schema", () => {
    expect(uddfSchemaErrors(throughShylog(d4iXml))).toEqual([])
  })

  it("keeps a trimix switch, extra channels and stops in place", () => {
    const xml = throughShylog(syntheticXml("extras.uddf"))
    expect(uddfSchemaErrors(xml)).toEqual([])
    const [before] = dives(syntheticXml("extras.uddf")).values()
    const [after] = dives(xml).values()
    const extras = [...before].filter((leaf) =>
      /\/(cns|heading|decostop|switchmix|airtemperature|noflighttime|highestpo2|alarm)=/.test(
        leaf
      )
    )
    expect(extras.length).toBeGreaterThan(260)
    expect(extras.filter((leaf) => !after.has(leaf))).toEqual([])
    // The trimix under an id made from its make-up, with its helium.
    const trimix = all(parse(xml), "mix").find(
      (mix) => mix.getAttribute("id") === "mix-180-450"
    )!
    expect(
      ["name", "o2", "he"].map((name) => all(trimix, name)[0].textContent)
    ).toEqual(["TX 18/45", "0.18", "0.45"])
  })

  it("writes a hand value in the standard element the computer's held", () => {
    const db = testDb()
    logByHand(db, [
      {
        id: "dive-63",
        startTime: "2026-07-22T08:10:00",
        duration: 2520,
        maxDepth: 32.7,
        nitrox: true,
        oxygen: 324,
      },
    ])
    const root = parse(throughShylog(syntheticXml("extras.uddf"), db))
    const dive = all(root, "dive")[0]
    expect(all(dive, "greatestdepth")[0].textContent).toBe("32.7")
    // The gas the dive starts on is the dive's own, a gas switch included.
    const start = all(dive, "waypoint")[0]
    expect(all(start, "switchmix")[0].getAttribute("ref")).toBe("mix-324")
    expect(
      all(dive, "tankdata")[0]
        .getElementsByTagNameNS(uddfNamespace, "link")[0]
        .getAttribute("ref")
    ).toBe("mix-324")
  })
})

describe("passThrough on a crafted file", () => {
  const ns = uddfNamespace
  const after = (inner: string) =>
    passThrough(
      `<fragment xmlns="${ns}"><dive><informationafterdive>${inner}</informationafterdive></dive></fragment>`,
      "mix-210",
      () => "mix-x"
    ).informationafterdive.map((item) => item.xml)
  // What the export makes of the passed element, inside a UDDF parent.
  const reparsed = (xml: string) =>
    parse(`<informationafterdive xmlns="${ns}">${xml}</informationafterdive>`)

  it("writes no instruction, comment or CDATA, so none can end early", () => {
    // Each hides markup that taking the namespace out of it would let loose.
    for (const hidden of [
      `<?t ? xmlns="${ns}"></u:diveplan><evil/><?t ?>`,
      `<![CDATA[]] xmlns="${ns}"><evil/>]]>`,
      `<!-- xmlns="${ns}" --><!-- -->`,
    ]) {
      const [xml] = after(`<u:diveplan xmlns:u="${ns}">${hidden}</u:diveplan>`)
      const root = reparsed(xml)
      expect(all(root, "diveplan"), xml).toHaveLength(1)
      expect(all(root, "evil"), xml).toEqual([])
    }
  })

  it("drops characters XML can't hold, which a reference brought in", () => {
    const [xml] = after('<diveplan note="a&#x1;b">c&#x1;d&#xFFFF;e</diveplan>')
    for (const code of [0x1, 0xffff])
      expect(xml.includes(String.fromCharCode(code))).toBe(false)
    expect(xml).toBe('<diveplan note="ab">cde</diveplan>')
  })
})
