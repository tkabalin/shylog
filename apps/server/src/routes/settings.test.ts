import type { Settings } from "@shylog/core"
import { beforeEach, describe, expect, it } from "vitest"

import { apiHeaders, send, testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import type { Db } from "../db/open.ts"

let db: Db
let app: ReturnType<typeof testApp>
beforeEach(() => {
  db = testDb()
  app = testApp({ db })
})

const getSettings = async () =>
  (await (
    await app.request("/api/settings", { headers: apiHeaders })
  ).json()) as Settings
const put = (body: unknown) => send(app, "PUT", "/api/settings", body)

describe("GET /api/settings", () => {
  it("defaults to an empty name, 1.4 bar, no new-dive defaults and visibility in metres", async () => {
    expect(await getSettings()).toEqual({
      diverName: "",
      maxPo2: 1.4,
      newDiveDefaults: { visibilityMode: "metres" },
    })
  })
})

describe("PUT /api/settings", () => {
  it("saves the fields sent, journals, and writes nothing when repeated", async () => {
    const res = await put({ diverName: " Thomas ", maxPo2: 1.6 })
    expect(res.status).toBe(200)
    const { version } = (await res.json()) as { version: string }
    expect(await getSettings()).toMatchObject({
      diverName: "Thomas",
      maxPo2: 1.6,
    })
    const again = await put({ maxPo2: 1.6 })
    expect(((await again.json()) as { version: string }).version).toBe(version)
    expect(
      db.prepare("SELECT type FROM ops ORDER BY seq").pluck().all().at(-1)
    ).toBe("putSettings")
  })

  it("replaces new-dive defaults whole, in dive field shapes", async () => {
    const defaults = {
      cylinderMaterial: "aluminium",
      cylinderVolume: 11100,
      nitrox: true,
      oxygen: 320,
      visibilityMode: "rating",
    }
    expect((await put({ newDiveDefaults: defaults })).status).toBe(200)
    expect((await getSettings()).newDiveDefaults).toEqual(defaults)
    await put({ newDiveDefaults: { visibilityMode: "metres", weight: 4 } })
    expect((await getSettings()).newDiveDefaults).toEqual({
      visibilityMode: "metres",
      weight: 4,
    })
  })

  it("validates with core's schema", async () => {
    for (const body of [
      {},
      { maxPo2: 1.45 },
      { newDiveDefaults: { visibilityMode: "metres", cylinderVolume: 11.1 } },
      { newDiveDefaults: { visibilityMode: "metres", nitrox: true } },
      { colour: "cyan" },
    ]) {
      expect((await put(body)).status).toBe(400)
    }
    expect(await getSettings()).toMatchObject({ maxPo2: 1.4 })
  })
})
