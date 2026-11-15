import type { Settings } from "@shylog/core"
import { beforeEach, describe, expect, it } from "vitest"

import { apiHeaders, origin, send, testApp } from "../../test/app.ts"
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
  it("defaults to an empty name, 1.4 bar and no new-dive defaults", async () => {
    expect(await getSettings()).toEqual({
      diverName: "",
      maxPo2: 1.4,
      newDiveDefaults: {},
    })
  })

  // As a restore finds it, replaying settings saved before migration 4.
  it("reads a row that still has the dropped visibility default", async () => {
    db.prepare("UPDATE settings SET new_dive_defaults = ?").run(
      '{"weight":4,"visibilityMode":"rating"}'
    )
    expect((await getSettings()).newDiveDefaults).toEqual({ weight: 4 })
  })

  // And before migration 7 removed the gas and start pressure.
  it("reads a row that still has the dropped gas and start pressure defaults", async () => {
    db.prepare("UPDATE settings SET new_dive_defaults = ?").run(
      '{"weight":4,"nitrox":true,"oxygen":320,"startPressure":200}'
    )
    expect((await getSettings()).newDiveDefaults).toEqual({ weight: 4 })
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
    }
    expect((await put({ newDiveDefaults: defaults })).status).toBe(200)
    expect((await getSettings()).newDiveDefaults).toEqual(defaults)
    await put({ newDiveDefaults: { weight: 4 } })
    expect((await getSettings()).newDiveDefaults).toEqual({
      weight: 4,
    })
  })

  it("validates with core's schema", async () => {
    for (const body of [
      {},
      { maxPo2: 1.45 },
      { newDiveDefaults: { cylinderVolume: 11.1 } },
      { newDiveDefaults: { nitrox: true } },
      { colour: "cyan" },
    ]) {
      expect((await put(body)).status).toBe(400)
    }
    expect(await getSettings()).toMatchObject({ maxPo2: 1.4 })
  })

  // As every JSON write is, before its body is read.
  it("refuses a body far larger than any JSON write", async () => {
    const res = await put({ diverName: "x".repeat(6 * 1024 * 1024) })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: "The request is too large" })
    expect(await getSettings()).toMatchObject({ diverName: "" })
    // Whatever the case of its type, which the parser ignores.
    const shouted = await app.request("/api/settings", {
      method: "PUT",
      headers: {
        ...apiHeaders,
        Origin: origin,
        "Content-Type": "Application/JSON",
      },
      body: JSON.stringify({ diverName: "x".repeat(6 * 1024 * 1024) }),
    })
    expect(shouted.status).toBe(413)
  })
})
