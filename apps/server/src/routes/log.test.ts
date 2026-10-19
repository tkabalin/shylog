import { beforeAll, describe, expect, it } from "vitest"

import { apiHeaders, testApp } from "../../test/app.ts"
import { diveId, seededDb } from "../../test/fixture.ts"
import type { Db } from "../db/open.ts"
import { write } from "../journal.ts"
import type { Log } from "./log.ts"

let db: Db
let app: ReturnType<typeof testApp>
beforeAll(() => {
  db = seededDb()
  app = testApp({ db })
})

const get = (headers: Record<string, string> = {}) =>
  app.request("/api/log", { headers: { ...apiHeaders, ...headers } })

describe("GET /api/log", () => {
  it("returns the whole log in the spec's shape", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const log = (await res.json()) as Log
    expect(Object.keys(log)).toEqual([
      "schemaVersion",
      "version",
      "serverTime",
      "dives",
      "sites",
      "countries",
      "regions",
      "people",
      "diveCentres",
      "trips",
      "links",
      "fieldMeta",
      "settings",
      "cards",
    ])
    expect(log.schemaVersion).toBe(1)
    expect(log.dives).toHaveLength(46)
    expect(log.countries).toHaveLength(249)
    expect(log.settings).toEqual({
      diverName: "",
      maxPo2: 1.4,
      newDiveDefaults: { visibilityMode: "metres" },
    })
  })

  it("is tagged with the version, and a matching If-None-Match gets a 304", async () => {
    const res = await get()
    const { version } = (await res.json()) as Log
    expect(res.headers.get("ETag")).toBe(`"${version}"`)
    const again = await get({ "If-None-Match": `"${version}"` })
    expect(again.status).toBe(304)
    expect(await again.text()).toBe("")
    // As a proxy may weaken it, or a client list several.
    const weak = await get({ "If-None-Match": `"other", W/"${version}"` })
    expect(weak.status).toBe(304)
  })

  it("carries each dive's sparkline and ascent-alarm count", async () => {
    const log = (await (await get()).json()) as Log
    const dive54 = log.dives.find((dive) => dive.id === diveId(db, 54))!
    expect(dive54.ascentAlarmCount).toBe(5)
    expect(dive54.sparkline).toHaveLength(24)
    expect(dive54).toMatchObject({
      nitrox: false,
      ignored: false,
      deletedAt: null,
    })
    expect(log.dives.every((dive) => dive.sparkline?.length === 24)).toBe(true)
  })

  it("includes deleted dives with deletedAt, under a new version", async () => {
    const before = (await (await get()).json()) as Log
    const id = diveId(db, 63)
    write(db, () =>
      db
        .prepare(
          "UPDATE dives SET deleted_at = '2026-10-19T10:00:00Z' WHERE id = ?"
        )
        .run(id)
    )
    const res = await get({ "If-None-Match": `"${before.version}"` })
    expect(res.status).toBe(200)
    const after = (await res.json()) as Log
    expect(after.version).not.toBe(before.version)
    expect(after.dives.find((dive) => dive.id === id)?.deletedAt).toBe(
      "2026-10-19T10:00:00Z"
    )

    const version = (await (
      await app.request("/api/version", { headers: apiHeaders })
    ).json()) as { version: string }
    expect(version.version).toBe(after.version)
  })
})
