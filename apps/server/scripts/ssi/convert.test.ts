import type { Op, UploadDraftRequest } from "@shylog/core"
import { describe, expect, it } from "vitest"

import { apiHeaders, send, testApp } from "../../test/app.ts"
import type { Log } from "../../src/routes/log.ts"
import { convertSsi, type Extras } from "./convert.ts"
import { boat, csv, extras, freedive, shore } from "./fixture.ts"
import { readCsv } from "./csv.ts"

const at = "2026-11-05T10:00:00.000Z"
const personId = expect.stringMatching(/^person-ssi-[0-9a-f]{12}$/)
const regionId = expect.stringMatching(/^region-ssi-[0-9a-f]{12}$/)

function convert(rows = [shore, boat, freedive], extra = extras) {
  return convertSsi(csv(rows), extra, at)
}

const diveOf = (draft: UploadDraftRequest) =>
  draft.ops.find((op) => op.type === "upsertDive")!
const fieldsOf = (rows?: Parameters<typeof convert>[0], extra?: Extras) =>
  convert(rows, extra).drafts.map((draft) => diveOf(draft).fields)
const entities = (draft: UploadDraftRequest, kind: string) =>
  draft.ops.filter(
    (op): op is Extract<Op, { type: "upsertEntity" }> =>
      op.type === "upsertEntity" && op.kind === kind
  )

describe("readCsv", () => {
  it("reads quoted commas, quotes and newlines", () => {
    expect(readCsv('a,b\r\n"x, ""y""","1\n2"\n3,\n')).toEqual([
      { a: 'x, "y"', b: "1\n2" },
      { a: "3", b: "" },
    ])
  })
})

describe("convertSsi", () => {
  it("makes one draft per scuba dive and leaves out freedives", () => {
    const { drafts, dives, freedives } = convert()
    expect([dives, freedives]).toEqual([2, 1])
    expect(drafts.map((draft) => diveOf(draft).diveId)).toEqual([
      "dive-ssi-101",
      "dive-ssi-102",
    ])
  })

  it("converts to Shylog's units and keys, with local times and no offset", () => {
    expect(fieldsOf()[0]).toEqual({
      startTime: "2025-11-09T08:45:00",
      siteId: "site-ssi-11",
      duration: 2760,
      maxDepth: 5.3,
      averageDepth: 4.1,
      diveType: "training",
      trainingAgency: "SSI",
      trainingCourse: "Open Water Diver",
      tags: ["photoVideo"],
      buddies: [personId, personId],
      entry: "beachShore",
      current: "mild",
      surface: "calm",
      weather: "cloudless",
      minTemperature: 12,
      maxTemperature: 13,
      visibility: 5,
      weight: 6,
      cylinderMaterial: "steel",
      cylinderVolume: 12000,
      nitrox: false,
      ignored: false,
      startPressure: 220,
      endPressure: 60,
      notes: 'Cold, "green" water\nsecond line',
    })
  })

  it("keeps nitrox, drops deep, and sends only what SSI holds", () => {
    const fun = fieldsOf()[1]!
    expect(fun).toMatchObject({
      diveType: "recreation",
      entry: "smallBoat",
      nitrox: true,
      oxygen: 320,
      // Deep (28) is dropped; night (40) is a tag.
      tags: ["night"],
      gearDetails: "Overweighted",
    })
    expect(fun).not.toHaveProperty("trainingAgency")
    expect(fun).not.toHaveProperty("buddies")
    expect(fun).not.toHaveProperty("notes")
  })

  it("reads 21 % nitrox as air", () => {
    const air = fieldsOf([shore, { ...boat, ean_percent: "21" }])[1]
    expect(air).toMatchObject({ nitrox: false })
    expect(air).not.toHaveProperty("oxygen")
  })

  it("creates each dive's site and region, unescaping SSI's HTML", () => {
    const [, fun] = convert().drafts
    expect(entities(fun!, "region").map((op) => [op.id, op.fields])).toEqual([
      [regionId, { name: "Sodwana", countryCode: "ZA" }],
    ])
    expect(entities(fun!, "site").map((op) => [op.id, op.fields])).toEqual([
      [
        "site-ssi-12",
        {
          name: "Reef I & J",
          countryCode: "ZA",
          regionId: entities(fun!, "region")[0]!.id,
          bodyOfWater: "oceanSea",
          waterType: "salt",
        },
      ],
    ])
  })

  it("creates buddies and leaves out the people the extras name", () => {
    const [training, fun] = convert().drafts
    expect(
      entities(training!, "person").map((op) => [op.id, op.fields])
    ).toEqual([
      [personId, { name: "Alex Example" }],
      [personId, { name: "Sam van Example" }],
    ])
    expect(entities(fun!, "person")).toEqual([])
  })

  it("gives every op a stable id, so a rerun is skipped as already applied", () => {
    const ids = (run: ReturnType<typeof convert>) =>
      run.drafts.flatMap((draft) => draft.ops.map((op) => op.opId))
    expect(
      ids(convertSsi(csv([shore, boat]), extras, "2026-12-01T00:00:00Z"))
    ).toEqual(ids(convert([shore, boat])))
    expect(new Set(ids(convert())).size).toBe(ids(convert()).length)
    expect(convert()).toEqual(convert())
  })

  it("keeps a person's and a region's id when the CSV or extras change", () => {
    const idsOf = (run: ReturnType<typeof convert>, kind: string) =>
      Object.fromEntries(
        run.drafts.flatMap((draft) =>
          entities(draft, kind).map((op) => [op.fields.name, op.id])
        )
      )
    const before = convert([shore, boat])
    // An earlier dive with a new buddy and a new region, and Alex left out.
    const earlier = {
      ...boat,
      id: "100",
      datetime: "2025-10-01 09:00",
      dive_sites_id: "13",
      dive_sites_name: "Castle Rock",
      buddy_names: "Kim Example, Sam van Example",
    }
    const after = convert([earlier, shore, boat], {
      ...extras,
      sites: {
        ...extras.sites,
        "Castle Rock": { country: "ZA", region: "Cape Point" },
      },
      leaveOutPeople: [...extras.leaveOutPeople!, "Alex Example"],
    })
    expect(idsOf(after, "person")["Sam van Example"]).toBe(
      idsOf(before, "person")["Sam van Example"]
    )
    expect(idsOf(after, "region")).toMatchObject(idsOf(before, "region"))
  })

  it("refuses a code it doesn't know, naming the dive", () => {
    expect(() => convert([{ ...shore, var_current_id: "5" }])).toThrow(
      "SSI dive 1 (2025-11-09 08:47, Kelp Point): unknown var_current_id code 5"
    )
    expect(() => convert([{ ...boat, var_specialdive_id: "999" }])).toThrow(
      "unknown special dive code 999"
    )
    expect(() => convert([{ ...shore, dive_type: "3" }])).toThrow(
      "unknown log type 3"
    )
  })

  it("refuses a value Shylog would reject, naming the dive", () => {
    expect(() =>
      convert([{ ...shore, pressure_end_bar: "230.0" }, boat])
    ).toThrow(
      "SSI dive 1 (2025-11-09 08:47, Kelp Point): dive endPressure: Above the start pressure"
    )
  })

  it("names the op a bad value is in", () => {
    expect(() =>
      convert([{ ...shore, buddy_names: "x".repeat(200) }, boat])
    ).toThrow(/SSI dive 1 .*: person name: /)
  })

  it("leaves out a dive the extras skip, and people however they're written", () => {
    const run = convert([shore, boat], {
      ...extras,
      leaveOutPeople: ["pat  GUIDE"],
      dives: { ...extras.dives, "2025-11-10 10:00": { skip: true } },
    })
    expect([run.dives, run.skipped]).toEqual([1, 1])
    expect(() =>
      convert([shore, boat], { ...extras, leaveOutPeople: ["Nobody"] })
    ).toThrow("The extras file leaves out Nobody, who is on no dive")
  })

  it("reads gappy ids as SSI's own and 0 as not logged", () => {
    const [dive] = convert([
      {
        ...shore,
        id: "101.0",
        dive_sites_id: "11.0",
        vis_m: "0",
        weight_kg: "0.0",
      },
      boat,
    ]).drafts.map(diveOf)
    expect(dive!.diveId).toBe("dive-ssi-101")
    expect(dive!.fields.siteId).toBe("site-ssi-11")
    expect(dive!.fields).not.toHaveProperty("visibility")
    expect(dive!.fields).not.toHaveProperty("weight")
  })

  it("undoes SSI's HTML escapes and refuses one it doesn't know", () => {
    const [dive] = fieldsOf([
      { ...shore, comment: "Kim&apos;s &#x2018;reef&#8217;&nbsp;dive" },
      boat,
    ])
    expect(dive!.notes).toBe("Kim's \u2018reef\u2019 dive")
    expect(() =>
      convert([{ ...shore, comment: "Wait&hellip;" }, boat])
    ).toThrow("comment has &hellip;")
  })

  it("refuses SSI sites whose names and ids cross", () => {
    expect(() =>
      convert([shore, { ...boat, dive_sites_name: "Kelp Point" }])
    ).toThrow('two SSI sites are called "Kelp Point"')
    expect(() => convert([shore, { ...boat, dive_sites_id: "11" }])).toThrow(
      'SSI site 11 is called "Kelp Point" and "Reef I & J"'
    )
  })

  it("refuses unmapped sites and extras that match no dive", () => {
    expect(() => convert([shore, boat], { ...extras, sites: {} })).toThrow(
      'Site "Reef I & J" is missing'
    )
    expect(() => convert([boat])).toThrow(
      "names a dive at 2025-11-09 08:47, which isn't in the CSV"
    )
  })

  it("refuses a course on a dive that isn't training", () => {
    expect(() =>
      convert([shore, boat], {
        ...extras,
        dives: { "2025-11-10 10:00": { trainingCourse: "Deep" } },
      })
    ).toThrow("a course on a dive that isn't training")
  })

  it("refuses temperatures out of order, unless the extras correct them", () => {
    const swapped = { ...boat, watertemp_c: "17.0", watertemp_max_c: "16.0" }
    expect(() => convert([shore, swapped])).toThrow(
      "water temperature minimum above maximum"
    )
    const fun = fieldsOf([shore, swapped], {
      ...extras,
      dives: {
        ...extras.dives,
        "2025-11-10 10:00": { minTemperature: 16, maxTemperature: null },
      },
    })[1]!
    expect(fun.minTemperature).toBe(16)
    expect(fun).not.toHaveProperty("maxTemperature")
  })

  it("takes a dive's entry from the extras over SSI's", () => {
    const fun = fieldsOf([shore, boat], {
      ...extras,
      dives: { ...extras.dives, "2025-11-10 10:00": { entry: "charterBoat" } },
    })[1]!
    expect(fun.entry).toBe("charterBoat")
  })
})

describe("uploading the drafts", () => {
  it("logs every dive as hand values, once, and skips a rerun", async () => {
    const app = testApp()
    const upload = async () => {
      const results = []
      // Stamped now: the server refuses drafts more than two years old.
      const { drafts } = convertSsi(
        csv([shore, boat, freedive]),
        extras,
        new Date().toISOString()
      )
      for (const draft of drafts)
        results.push(
          (
            (await (await send(app, "POST", "/api/ops", draft)).json()) as {
              result: string
            }
          ).result
        )
      return results
    }
    expect(await upload()).toEqual(["applied", "applied"])
    expect(await upload()).toEqual(["alreadyApplied", "alreadyApplied"])

    const log = (await (
      await app.request("/api/log", { headers: apiHeaders })
    ).json()) as Log
    expect(log.dives.map((dive) => [dive.id, dive.number])).toEqual([
      ["dive-ssi-101", 1],
      ["dive-ssi-102", 2],
    ])
    expect(log.sites.map((site) => site.name).sort()).toEqual([
      "Kelp Point",
      "Reef I & J",
    ])
    expect(log.people.map((person) => person.name).sort()).toEqual([
      "Alex Example",
      "Sam van Example",
    ])
    expect(log.fieldMeta.every((row) => row.source === "hand")).toBe(true)
  })
})
