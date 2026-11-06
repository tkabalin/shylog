import { describe, expect, it } from "vitest"

import { apiHeaders, send, testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import { logByHand } from "../../test/hand.ts"
import { zoopXml } from "../../test/uddf-fixtures.ts"
import type { Db } from "../../src/db/open.ts"
import type { Log } from "../../src/routes/log.ts"
import { seed } from "../../src/seed.ts"
import { convertPadi, type Extras } from "./convert.ts"
import { april, december, extras, january, padiExport } from "./fixture.ts"
import { applyPlan, planPadi, type Api } from "./plan.ts"

// The Zoop's dives imported first, as computer values, then PADI on top.
function setup(before?: (db: Db) => void) {
  const db = testDb()
  seed(db, zoopXml, "test")
  before?.(db)
  const app = testApp({ db })
  const api: Api = async (method, path, body) => {
    const reply = await send(app, method, path, body)
    return {
      status: reply.status,
      body: (await reply.json()) as Record<string, unknown>,
    }
  }
  const log = async () =>
    (await (
      await app.request("/api/log", { headers: apiHeaders })
    ).json()) as Log
  const plan = async (extra: Extras = extras) =>
    planPadi(
      convertPadi(padiExport([december, january, april]), extra),
      await log(),
      new Date().toISOString()
    )
  return { app, api, log, plan }
}

const onDay = (log: Log, day: string) =>
  log.dives.filter((dive) => dive.startTime.startsWith(day))
const metaOf = (log: Log, diveId: string) =>
  Object.fromEntries(
    log.fieldMeta
      .filter((meta) => meta.diveId === diveId)
      .map((meta) => [meta.field, meta.source])
  )
const namesOf = (log: Log, diveId: string, type: string) =>
  log.links
    .filter((link) => link.diveId === diveId && link.type === type)
    .map((link) => log.people.find((person) => person.id === link.target)!.name)

describe("planPadi", () => {
  it("matches the computer's dives by day, depth and duration", async () => {
    const { plan, log } = await setup()
    const { patches, drafts, entities } = await plan()
    const { dives } = await log()
    expect(
      patches.map(({ padi, dive }) => [padi.padiId, dive.startTime])
    ).toEqual([
      [101, onDay({ dives } as Log, "2025-12-07")[0]!.startTime],
      [102, onDay({ dives } as Log, "2026-01-14")[0]!.startTime],
    ])
    expect(drafts.map(({ padi }) => padi.padiId)).toEqual([103])
    // Regions first, as sites sit in them.
    expect(entities.map((entity) => [entity.kind, entity.fields.name])).toEqual(
      [
        ["region", "False Bay"],
        ["site", "Kelp Point"],
        ["site", "Seal Rock"],
        ["diveCentre", "Reef Club"],
        ["person", "Alex Example"],
        ["person", "Sam van Example"],
        ["person", "Pat Guide"],
      ]
    )
  })

  it("fills in the dives and leaves the computer's figures alone", async () => {
    const { plan, api, log } = await setup()
    const before = await log()
    const { failures } = await applyPlan(await plan(), api)
    expect(failures).toEqual([])
    const after = await log()

    const december = onDay(after, "2025-12-07")[0]!
    expect(december).toMatchObject({
      ...Object.fromEntries(
        [
          "startTime",
          "duration",
          "maxDepth",
          "minTemperature",
          "maxTemperature",
          "nitrox",
        ].map((field) => [
          field,
          onDay(before, "2025-12-07")[0]![field as "duration"],
        ])
      ),
      surge: "moderate",
      visibility: 6,
      cylinderVolume: 12000,
      notes: "Saw a seal\nFelt good.",
    })
    expect(after.sites.find((site) => site.id === december.siteId)!.name).toBe(
      "Kelp Point"
    )
    expect(
      after.diveCentres.find((centre) => centre.id === december.diveCentreId)!
        .name
    ).toBe("Reef Club")
    expect(namesOf(after, december.id, "buddy")).toEqual([
      "Alex Example",
      "Sam van Example",
    ])
    expect(metaOf(after, december.id)).toMatchObject({
      startTime: "computer",
      duration: "computer",
      maxDepth: "computer",
      minTemperature: "computer",
      surge: "hand",
      siteId: "hand",
      buddies: "hand",
    })

    const january = onDay(after, "2026-01-14")[0]!
    expect(namesOf(after, january.id, "buddy")).toEqual(["Alex Example"])
    expect(namesOf(after, january.id, "professional")).toEqual(["Pat Guide"])

    const added = after.dives.find((dive) => dive.id === "dive-padi-103")!
    expect(added).toMatchObject({
      startTime: "2026-04-05T09:30:00",
      duration: 2640,
      maxDepth: 18,
      minTemperature: 21,
      computerModel: null,
    })
  })

  it("changes nothing on a rerun", async () => {
    const { plan, api, log } = await setup()
    await applyPlan(await plan(), api)
    const { version } = await log()
    const again = await plan()
    expect(again.entities).toEqual([])
    expect(again.drafts).toEqual([])
    expect(again.patches.map((patch) => patch.fields)).toEqual([{}, {}, {}])
    expect(await applyPlan(again, api)).toEqual({ tally: {}, failures: [] })
    expect((await log()).version).toBe(version)
  })

  it("keeps what the diver set in the app and says so", async () => {
    const { plan, api, log } = await setup()
    const dive = onDay(await log(), "2025-12-07")[0]!
    const reply = await api("PATCH", `/api/dives/${dive.id}`, {
      fields: { notes: "Typed on the phone", weight: 8 },
    })
    expect(reply.status).toBe(200)
    const patch = (await plan()).patches.find(
      (patch) => patch.dive.id === dive.id
    )!
    expect(patch.kept).toEqual(["weight", "notes"])
    expect(patch.fields).not.toHaveProperty("notes")
    expect(patch.fields).not.toHaveProperty("weight")
  })

  it("uses a site or person the log already has under that name", async () => {
    const { plan, api } = await setup()
    await api("PUT", "/api/entities/person/person-alex", {
      name: "alex  EXAMPLE",
    })
    const { entities, patches } = await plan()
    expect(entities.map((entity) => entity.fields.name)).not.toContain(
      "Alex Example"
    )
    expect(patches[0]!.fields.buddies).toEqual([
      "person-alex",
      expect.stringMatching(/^person-padi-/),
    ])
  })

  it("refuses a dive it can't place", async () => {
    const { plan, log } = await setup((db) =>
      // A second dive like the computer's on 7 December, typed in by hand.
      logByHand(db, [
        {
          id: "dive-typed",
          startTime: "2025-12-07T15:00:00",
          duration: 3700,
          maxDepth: 6.5,
        },
      ])
    )
    const computer = onDay(await log(), "2025-12-07")[0]!.startTime
    await expect(
      plan({ ...extras, dives: { "102": { professionals: ["Pat Guide"] } } })
    ).rejects.toThrow(
      [
        `PADI dive 101 (2025-12-07, Kelp Point) could be any of ${computer}, 2025-12-07T15:00:00`,
        "PADI dive 103 (2026-04-05, Kelp Point) matches no dive in the log: give its start time in the extras",
      ].join("\n")
    )
  })

  it("refuses a new dive that overlaps one in the log", async () => {
    const { plan } = await setup((db) =>
      logByHand(db, [
        {
          id: "dive-typed",
          startTime: "2026-04-05T10:00:00",
          duration: 1800,
          maxDepth: 5,
        },
      ])
    )
    await expect(plan()).rejects.toThrow(
      "PADI dive 103 (2026-04-05, Kelp Point) at 2026-04-05T09:30:00 overlaps the dive at 2026-04-05T10:00:00"
    )
  })
})
