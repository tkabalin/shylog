import { DOMParser, type Element } from "@xmldom/xmldom"
import { beforeAll, describe, expect, it } from "vitest"

import { send, testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import { diveId, fixtureStart, seededDb } from "../../test/fixture.ts"
import { readAsSubsurface } from "../../test/reference/subsurface-uddf.ts"
import { uddfSchemaErrors } from "../../test/uddf-schema.ts"
import type { Db } from "../db/open.ts"
import { readUddf } from "./sample-reader.ts"
import { shylogNamespace } from "./shylog-namespace.ts"
import { uddfNamespace, writeUddf } from "./writer.ts"

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, "text/xml").documentElement!
const all = (parent: Element, name: string, ns = uddfNamespace) =>
  Array.from(parent.getElementsByTagNameNS(ns, name))
const text = (parent: Element, name: string, ns = uddfNamespace) =>
  all(parent, name, ns)[0]?.textContent ?? null
const own = (dive: Element, name: string) =>
  all(dive, name, shylogNamespace).map((node) => node.textContent)
const byId = (root: Element, name: string, id: string) =>
  all(root, name).find((node) => node.getAttribute("id") === id)!
const refs = (parent: Element) =>
  all(parent, "link")
    .filter((node) => node.parentNode === parent)
    .map((node) => node.getAttribute("ref"))

// Subsurface's reading of a file, dive by dive.
const subsurfaceDives = (xml: string) =>
  Array.from(readAsSubsurface(xml).getElementsByTagName("dive"))

describe("the seeded log", { timeout: 20_000 }, () => {
  let db: Db
  let xml: string
  beforeAll(() => {
    db = seededDb()
    xml = writeUddf(db).xml
  })

  it("passes the UDDF schema", () => {
    expect(uddfSchemaErrors(xml)).toEqual([])
  })

  it("is byte-identical on a second run with no change", () => {
    expect(writeUddf(db).xml).toBe(xml)
  })

  it("names every dive by its Shylog id", () => {
    const ids = db
      .prepare("SELECT id FROM dives ORDER BY start_time")
      .pluck()
      .all()
    expect(all(parse(xml), "dive").map((d) => d.getAttribute("id"))).toEqual(
      ids
    )
  })

  it("writes dive 63 in UDDF's units with a local time", () => {
    const dive = byId(parse(xml), "dive", diveId(db, 63))
    expect(text(dive, "datetime")).toBe(fixtureStart[63])
    expect(text(dive, "greatestdepth")).toBe("32.66")
    expect(text(dive, "diveduration")).toBe("2500")
    // 23 °C from the samples (D10).
    expect(text(dive, "lowesttemperature")).toBe("296.15")
    expect(own(dive, "maxTemperature")).toEqual(["297.15"])
    expect(refs(all(dive, "tankdata")[0])).toEqual(["mix-320"])
  })

  it("gives back the samples and events the import read", () => {
    const stored = (id: string) =>
      db
        .prepare(
          "SELECT type, start_seconds AS start, end_seconds AS end FROM events WHERE dive_id = ? ORDER BY start_seconds, id"
        )
        .all(id)
    const reread = readUddf(xml)
    const ids = all(parse(xml), "dive").map((d) => d.getAttribute("id")!)
    expect(reread).toHaveLength(ids.length)
    reread.forEach((dive, i) => {
      expect(dive.events).toEqual(stored(ids[i]))
      expect(dive.samples).toEqual(
        db
          .prepare(
            "SELECT time, depth, temperature, pressure FROM samples WHERE dive_id = ? ORDER BY time"
          )
          .all(ids[i])
      )
    })
    // Fixture dive 3's ascent pairs come back as pairs.
    expect(stored(diveId(db, 3)).length).toBeGreaterThan(0)
  })

  it("is read by Subsurface with every dive's figures", () => {
    const dives = subsurfaceDives(xml)
    const rows = db
      .prepare(
        "SELECT start_time AS startTime, duration, max_depth AS maxDepth, oxygen, sites.name AS site FROM dives JOIN sites ON sites.id = site_id ORDER BY start_time"
      )
      .all() as {
      startTime: string
      duration: number
      maxDepth: number
      oxygen: number | null
      site: string
    }[]
    expect(dives).toHaveLength(rows.length)
    dives.forEach((dive, i) => {
      const row = rows[i]
      const [date, time] = row.startTime.split("T")
      expect(dive.getAttribute("date")).toBe(date)
      expect(dive.getAttribute("time")).toBe(time)
      const seconds = row.duration % 60
      expect(dive.getAttribute("duration")).toBe(
        `${Math.floor(row.duration / 60)}:${String(seconds).padStart(2, "0")} min`
      )
      // Subsurface writes two decimals ("3.20 m").
      expect(
        parseFloat(dive.getElementsByTagName("depth")[0].getAttribute("max")!)
      ).toBe(row.maxDepth)
      expect(dive.getElementsByTagName("cylinder")[0].getAttribute("o2")).toBe(
        String((row.oxygen ?? 210) / 1000)
      )
      expect(dive.getElementsByTagName("location")[0].textContent).toBe(
        row.site
      )
    })
  })

  it("gives models that read alike their own, lasting computer ids", () => {
    const models = seededDb()
    const [a, b] = models
      .prepare("SELECT id FROM dives ORDER BY start_time LIMIT 2")
      .pluck()
      .all() as string[]
    const model = models.prepare(
      "UPDATE dives SET computer_model = ? WHERE id = ?"
    )
    const computers = () => {
      const root = parse(writeUddf(models).xml)
      return new Map(
        all(root, "divecomputer").map((c) => [
          text(c, "model")!,
          c.getAttribute("id")!,
        ])
      )
    }
    model.run("perdix-2", b)
    const before = computers().get("perdix-2")
    model.run("Perdix 2", a)
    const out = writeUddf(models).xml
    const ids = computers()

    // A model that reads alike, sorting first, leaves the other's id be.
    expect(ids.get("perdix-2")).toBe(before)
    expect(ids.get("Perdix 2")).toMatch(/^computer-perdix-2-[0-9a-f]{6}$/)
    expect(ids.get("perdix-2")).toMatch(/^computer-perdix-2-[0-9a-f]{6}$/)
    expect(ids.get("Perdix 2")).not.toBe(ids.get("perdix-2"))
    expect(refs(all(byId(parse(out), "dive", b), "equipmentused")[0])).toEqual([
      ids.get("perdix-2"),
    ])
    expect(uddfSchemaErrors(out)).toEqual([])
  })

  it("writes a hand value that differs from the computer's", async () => {
    const edited = seededDb()
    const id = diveId(edited, 63)
    const res = await send(
      testApp({ db: edited }),
      "PATCH",
      `/api/dives/${id}`,
      {
        fields: { maxDepth: 33.1, duration: 2520 },
      }
    )
    expect(res.status).toBe(200)
    const dive = byId(parse(writeUddf(edited).xml), "dive", id)
    expect(text(dive, "greatestdepth")).toBe("33.1")
    expect(text(dive, "diveduration")).toBe("2520")
  })
})

// A new instance's first start exports a log with no dives yet.
it("writes an empty log that passes the UDDF schema", () => {
  const { xml, dives } = writeUddf(testDb())
  expect(dives).toBe(0)
  expect(uddfSchemaErrors(xml)).toEqual([])
})

// A log typed by hand, built through the API as the phone builds it.
describe("a hand-logged log", { timeout: 20_000 }, () => {
  let db: Db
  let xml: string
  let root: Element
  let opCount = 0
  const op = (fields: Record<string, unknown>) => ({
    opId: `op-${++opCount}`,
    opVersion: 1,
    deviceId: "device-phone",
    at: "2026-07-22T12:00:00.000Z",
    ...fields,
  })
  const entity = (kind: string, id: string, fields: Record<string, unknown>) =>
    op({ type: "upsertEntity", kind, id, fields })
  const dive = (diveId: string, fields: Record<string, unknown>) =>
    op({
      type: "upsertDive",
      diveId,
      fields: {
        siteId: "site-two-mile",
        duration: 2520,
        maxDepth: 18.4,
        ...fields,
      },
    })

  beforeAll(async () => {
    db = testDb()
    const app = testApp({ db })
    expect(
      (await send(app, "PUT", "/api/settings", { diverName: "Thandi van Wyk" }))
        .status
    ).toBe(200)
    // A draft holds one dive, with the entities it creates.
    const drafts = [
      [
        entity("region", "region-sodwana", {
          name: "Sodwana",
          countryCode: "ZA",
        }),
        entity("site", "site-two-mile", {
          name: "Two Mile Reef",
          countryCode: "ZA",
          regionId: "region-sodwana",
          bodyOfWater: "oceanSea",
        }),
        entity("site", "site-quarry", {
          name: "Miracle Waters",
          countryCode: "ZA",
        }),
        entity("person", "person-sam", { name: "Sam Naidoo" }),
        entity("person", "person-lee", { name: "Lee" }),
        entity("trip", "trip-sodwana", { name: "Sodwana & friends" }),
        entity("diveCentre", "centre-coral", { name: "Coral Divers" }),
        dive("dive-a", {
          startTime: "2026-07-20T08:10:00",
          nitrox: true,
          oxygen: 324,
          cylinderMaterial: "aluminium",
          cylinderVolume: 11100,
          startPressure: 200,
          endPressure: 70,
          buddies: ["person-sam"],
          diveProfessionals: ["person-lee"],
          tags: ["wreck", "drift"],
          tripId: "trip-sodwana",
          diveCentreId: "centre-coral",
          surge: "moderate",
          surface: "calm",
          weather: "cloudy",
          maxTemperature: 24,
          minTemperature: 22.5,
          visibilityRating: "high",
          gearDetails: "5 mm suit",
          diveType: "training",
          trainingAgency: "SSI",
          trainingCourse: "Deep",
          notableAnimals: "Potato bass",
          // A bell character pasted in along with the text, and a line
          // separator, which xmldom would read as a newline unescaped.
          notes: "First line\n\nSecond paragraph & more\u2028end\u0007",
          entry: "smallBoat",
          current: "mild",
          workload: "light",
          thermalComfort: "cold",
          weight: 4,
        }),
      ],
      [
        dive("dive-b", {
          startTime: "2026-07-20T11:00:00",
          nitrox: true,
          oxygen: 320,
          cylinderMaterial: "aluminium",
          cylinderVolume: 11100,
          visibility: 15,
        }),
      ],
      [
        dive("dive-c", {
          startTime: "2026-07-21T08:00:00",
          siteId: "site-quarry",
          ignored: true,
        }),
      ],
      [dive("dive-gone", { startTime: "2026-07-21T10:00:00" })],
    ]
    for (const ops of drafts) {
      expect((await send(app, "POST", "/api/ops", { ops })).status).toBe(200)
    }
    expect((await send(app, "DELETE", "/api/dives/dive-gone")).status).toBe(200)
    xml = writeUddf(db).xml
    root = parse(xml)
  })

  it("passes the UDDF schema", () => {
    expect(uddfSchemaErrors(xml)).toEqual([])
  })

  it("leaves deleted dives out and keeps ignored ones", () => {
    expect(all(root, "dive").map((d) => d.getAttribute("id"))).toEqual([
      "dive-a",
      "dive-b",
      "dive-c",
    ])
    expect(writeUddf(db).dives).toBe(3)
  })

  it("groups gases by fraction and cylinders by material and volume", () => {
    expect(
      all(root, "mix").map((mix) => [mix.getAttribute("id"), text(mix, "o2")])
    ).toEqual([
      ["mix-210", "0.21"],
      ["mix-320", "0.32"],
      ["mix-324", "0.324"],
    ])
    expect(all(root, "tank").map((tank) => tank.getAttribute("id"))).toEqual([
      "tank-aluminium-11100",
    ])
    const tankdata = (id: string) =>
      refs(all(byId(root, "dive", id), "tankdata")[0])
    expect(tankdata("dive-a")).toEqual(["mix-324", "tank-aluminium-11100"])
    expect(tankdata("dive-b")).toEqual(["mix-320", "tank-aluminium-11100"])
    expect(tankdata("dive-c")).toEqual(["mix-210"])
    const a = all(byId(root, "dive", "dive-a"), "tankdata")[0]
    expect(text(a, "tankpressurebegin")).toBe("20000000")
    expect(text(a, "tankpressureend")).toBe("7000000")
  })

  it("puts buddies and professionals before the site, all as buddies", () => {
    const before = all(byId(root, "dive", "dive-a"), "informationbeforedive")[0]
    expect(refs(before)).toEqual(["person-sam", "person-lee", "site-two-mile"])
    const lee = byId(root, "buddy", "person-lee")
    expect(text(lee, "firstname")).toBe("Lee")
    expect(text(lee, "lastname")).toBe("")
    const owner = byId(root, "owner", "owner")
    expect([text(owner, "firstname"), text(owner, "lastname")]).toEqual([
      "Thandi",
      "van Wyk",
    ])
  })

  it("writes each site's region, country and body of water", () => {
    const reef = byId(root, "site", "site-two-mile")
    expect(text(reef, "environment")).toBe("ocean-sea")
    expect(text(reef, "location")).toBe("Sodwana")
    expect(text(reef, "country")).toBe("ZA")
    const quarry = byId(root, "site", "site-quarry")
    expect(text(quarry, "environment")).toBeNull()
    expect(text(quarry, "location")).toBe("")
  })

  it("keeps what UDDF has no element for in <shylog>", () => {
    const a = byId(root, "dive", "dive-a")
    expect(
      Array.from(all(a, "shylog", shylogNamespace)[0].childNodes)
        .filter((node) => node.nodeType === node.ELEMENT_NODE)
        .map((node) => [(node as Element).localName, node.textContent])
    ).toEqual([
      ["trainingAgency", "SSI"],
      ["trainingCourse", "Deep"],
      ["tag", "drift"],
      ["tag", "wreck"],
      ["tripId", "trip-sodwana"],
      ["tripName", "Sodwana & friends"],
      ["diveCentreId", "centre-coral"],
      ["diveCentreName", "Coral Divers"],
      ["surge", "moderate"],
      ["surface", "calm"],
      ["weather", "cloudy"],
      ["maxTemperature", "297.15"],
      ["visibilityRating", "high"],
      ["gearDetails", "5 mm suit"],
    ])
    expect(own(byId(root, "dive", "dive-c"), "ignored")).toEqual(["true"])
  })

  it("writes the standard fields in UDDF's units and strings", () => {
    const a = byId(root, "dive", "dive-a")
    expect(text(a, "platform")).toBe("small-boat")
    expect(text(a, "current")).toBe("mild-current")
    expect(text(a, "program")).toBe("training")
    expect(text(a, "workload")).toBe("light")
    expect(text(a, "thermalcomfort")).toBe("cold")
    expect(text(a, "lowesttemperature")).toBe("295.65")
    expect(text(a, "leadquantity")).toBe("4")
    expect(text(all(a, "observations")[0], "para")).toBe("Potato bass")
    expect(text(all(a, "notes").at(-1)!, "para")).toBe(
      "First line\n\nSecond paragraph & more\u2028end"
    )
    expect(text(byId(root, "dive", "dive-b"), "visibility")).toBe("15")
    expect(all(a, "samples")).toEqual([])
  })

  it("numbers dives that count and gives the first no surface interval", () => {
    const number = (id: string) => text(byId(root, "dive", id), "divenumber")
    expect([number("dive-a"), number("dive-b"), number("dive-c")]).toEqual([
      "1",
      "2",
      null,
    ])
    const interval = (id: string) =>
      all(byId(root, "dive", id), "surfaceintervalbeforedive")[0]
    expect(all(interval("dive-a"), "infinity")).toHaveLength(1)
    // 08:10 plus 42 minutes, to 11:00.
    expect(text(interval("dive-b"), "passedtime")).toBe(
      String(2 * 3600 + 8 * 60)
    )
  })

  it("is read by Subsurface with buddies, sites, gases and whole notes", () => {
    const [a, b, c] = subsurfaceDives(xml)
    expect(a.getElementsByTagName("buddy")[0].textContent).toBe(
      "Sam Naidoo, Lee"
    )
    expect(a.getElementsByTagName("notes")[0].textContent).toBe(
      "First line\n\nSecond paragraph & more\u2028end"
    )
    expect(a.getElementsByTagName("location")[0].textContent).toBe(
      "Two Mile Reef"
    )
    expect(c.getElementsByTagName("location")[0].textContent).toBe(
      "Miracle Waters"
    )
    expect(a.getElementsByTagName("cylinder")[0].getAttribute("o2")).toBe(
      "0.324"
    )
    expect(b.getElementsByTagName("cylinder")[0].getAttribute("o2")).toBe(
      "0.32"
    )
    expect(a.getAttribute("date")).toBe("2026-07-20")
    expect(a.getAttribute("time")).toBe("08:10:00")
  })
})
