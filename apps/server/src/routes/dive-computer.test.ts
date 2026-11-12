import { mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import type { ImportPreview } from "@shylog/core"
import { afterEach, describe, expect, it } from "vitest"

import { apiHeaders, origin, send, testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import { d4iXml } from "../../test/uddf-fixtures.ts"
import { rememberComputer, storedComputer } from "../download/computer.ts"
import { applyImport } from "../import/apply.ts"
import { storePreview } from "../import/preview.ts"

const fake = fileURLToPath(
  new URL("../../test/fake-dctool.mjs", import.meta.url)
)

function setup({ cable = true, enabled = true } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "shylog-dc-"))
  const device = join(dataDir, "suunto")
  if (cable) writeFileSync(device, "")
  const db = testDb()
  const app = testApp({
    db,
    env: {
      SHYLOG_DATA_DIR: dataDir,
      SHYLOG_DCTOOL: fake,
      ...(enabled && { SHYLOG_DC_DEVICE: device }),
    },
  })
  return { db, app, dataDir }
}

afterEach(() => {
  for (const key of [
    "FAKE_DCTOOL_MODE",
    "FAKE_DCTOOL_SERIAL",
    "FAKE_DCTOOL_BEFORE",
    "FAKE_DCTOOL_DELAY",
  ])
    delete process.env[key]
})

type App = ReturnType<typeof testApp>
const detect = (app: App) => send(app, "POST", "/api/dive-computer/detect")
async function download(app: App, body: { readAll?: boolean } = {}) {
  const response = await send(app, "POST", "/api/dive-computer/download", body)
  return {
    status: response.status,
    body: (await response.json()) as {
      preview?: ImportPreview | null
      reason?: string
      error?: string
    },
  }
}
// Applies a preview as proposed, every new dive added.
const apply = (db: ReturnType<typeof testDb>, preview: ImportPreview) =>
  applyImport(db, preview.id, {
    revision: preview.revision,
    pairs: preview.pairs.map(({ computerDive, diveId }) => ({
      computerDive: computerDive.ref,
      diveId,
    })),
    add: preview.newDives.map((dive) => dive.ref),
    include: [],
  })

describe("the dive computer's states", () => {
  it("is off without a cable configured", async () => {
    const { app } = setup({ enabled: false })
    const response = await app.request("/api/dive-computer", {
      headers: apiHeaders,
    })
    expect(await response.json()).toEqual({ enabled: false, computer: null })
    expect((await detect(app)).status).toBe(404)
  })

  it("forgets a watch after downloading is turned off", async () => {
    const { db, app } = setup({ enabled: false })
    rememberComputer(db, { model: "Suunto D4i", serial: "12345678" })
    expect((await send(app, "DELETE", "/api/dive-computer")).status).toBe(204)
    expect(storedComputer(db)).toBeNull()
  })

  it("says when there's no cable, or no watch on it", async () => {
    const unplugged = await detect(setup({ cable: false }).app)
    expect(unplugged.status).toBe(409)
    expect(await unplugged.json()).toMatchObject({ reason: "noCable" })
    process.env.FAKE_DCTOOL_MODE = "noWatch"
    const silent = await detect(setup().app)
    expect(await silent.json()).toMatchObject({ reason: "noWatch" })
  })

  it("names the watch it finds", async () => {
    const response = await detect(setup().app)
    expect(await response.json()).toEqual({
      model: "Suunto D4i",
      known: false,
      other: false,
      lastDownloadAt: null,
    })
  })

  it("says how far a download has read, and nothing outside one", async () => {
    const { app } = setup()
    const progress = async () => {
      const response = await app.request("/api/dive-computer/progress", {
        headers: apiHeaders,
      })
      return ((await response.json()) as { progress: number | null }).progress
    }
    expect(await progress()).toBeNull()
    process.env.FAKE_DCTOOL_DELAY = "10"
    const running = download(app)
    let read: number | null = null
    // A pause between asks, so dctool's output gets its turn.
    while (read == null) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      read = await progress()
    }
    expect(read).toBeGreaterThanOrEqual(0)
    expect(read).toBeLessThanOrEqual(1)
    expect((await running).status).toBe(200)
    expect(await progress()).toBeNull()
  })

  it("answers a read that broke off as the server's failure", async () => {
    process.env.FAKE_DCTOOL_MODE = "failed"
    const { status, body } = await download(setup().app)
    expect(status).toBe(502)
    expect(body.reason).toBe("failed")
  })
})

describe("downloading", () => {
  it("remembers the first watch and refuses another, storing nothing", async () => {
    const { db, app, dataDir } = setup()
    process.env.FAKE_DCTOOL_BEFORE = "20260101"
    const first = await download(app)
    expect(first.status).toBe(200)
    // A watch nothing came from yet: a download, with no dive before it.
    expect(first.body.preview!.earlierThan).toBeNull()
    expect(storedComputer(db)).toMatchObject({
      model: "Suunto D4i",
      serial: "12345678",
      marker: null,
    })
    process.env.FAKE_DCTOOL_SERIAL = "87654321"
    const before = db.prepare("SELECT id FROM import_previews").pluck().all()
    const other = await download(app)
    expect(other.status).toBe(409)
    expect(other.body.error).toMatch(/isn't the D4i this log downloads from/)
    expect(db.prepare("SELECT id FROM import_previews").pluck().all()).toEqual(
      before
    )
    expect(storedComputer(db)?.serial).toBe("12345678")
    // Nor an empty folder for the refused read.
    expect(readdirSync(join(dataDir, "downloads"))).toHaveLength(1)
    expect(await (await detect(app)).json()).toMatchObject({ other: true })
  })

  it("keeps the raw download in the data directory", async () => {
    const { app, dataDir } = setup()
    process.env.FAKE_DCTOOL_BEFORE = "20251201"
    await download(app)
    const [folder] = readdirSync(join(dataDir, "downloads"))
    expect(folder).toMatch(/^\d{8}T\d{6}Z-12345678-\w{6}$/)
    expect(
      readdirSync(join(dataDir, "downloads", folder)).filter((name) =>
        name.endsWith(".bin")
      )
    ).toEqual(["20251105T164812-E9070B0510300C.bin"])
    expect(
      readdirSync(join(dataDir, "downloads", folder)).filter((name) =>
        name.endsWith(".xml")
      )
    ).toEqual(["20251105T164812-E9070B0510300C.xml"])
  })

  it("moves the marker only on apply, then reads only newer dives", async () => {
    const { db, app } = setup()
    process.env.FAKE_DCTOOL_BEFORE = "20261024"
    const { body } = await download(app)
    const preview = body.preview!
    // Discarding leaves the marker where it was.
    await send(app, "DELETE", `/api/import/${preview.id}`)
    expect(storedComputer(db)?.marker).toBeNull()
    const again = (await download(app)).body.preview!
    expect(apply(db, again).status).toBe("applied")
    expect(storedComputer(db)).toMatchObject({
      marker: "2026-10-23T19:49:00",
      lastDownloadAt: expect.any(String),
    })
    expect((await download(app)).body.preview).toBeNull()
    delete process.env.FAKE_DCTOOL_BEFORE
    const newer = (await download(app)).body.preview!
    expect(newer.newDives.map((dive) => dive.computerStartTime)).toEqual([
      "2026-10-24T14:49:00",
    ])
    expect(newer.earlierThan).toBe("2026-10-23T19:49:00")
  })

  it("never moves the marker on a failed apply", async () => {
    const { db, app } = setup()
    process.env.FAKE_DCTOOL_BEFORE = "20251201"
    const preview = (await download(app)).body.preview!
    db.exec(
      "CREATE TRIGGER fail BEFORE INSERT ON fingerprints BEGIN SELECT RAISE(ABORT, 'disk full'); END"
    )
    expect(apply(db, preview).status).toBe("failed")
    expect(storedComputer(db)?.marker).toBeNull()
  })

  it("starts a first download at the newest dive imported from that model", async () => {
    const { db, app } = setup()
    const imported = storePreview(db, d4iXml)
    apply(db, imported)
    const preview = (await download(app)).body.preview!
    expect(preview.earlierThan).toBe("2026-09-24T11:23:46")
    // The watch stopped at that dive, so nothing older was read.
    expect(preview.alreadyImported).toBe(0)
    // Remembered now, but with nothing applied it starts there again.
    await send(app, "DELETE", `/api/import/${preview.id}`)
    expect((await download(app)).body.preview!.earlierThan).toBe(
      "2026-09-24T11:23:46"
    )
    expect(
      [...preview.newDives, ...preview.leftOut]
        .map((dive) => dive.computerStartTime)
        .sort()
    ).toEqual([
      "2026-10-23T19:37:45",
      "2026-10-23T19:49:00",
      "2026-10-24T14:49:00",
    ])
  })

  it("reading every dive again skips what is imported and leaves out what was skipped", async () => {
    const { db, app } = setup()
    process.env.FAKE_DCTOOL_BEFORE = "20260115"
    const first = (await download(app)).body.preview!
    // The dive on 30 December is skipped in the review.
    apply(db, {
      ...first,
      newDives: first.newDives.filter(
        (dive) => !dive.computerStartTime.startsWith("2025-12-30")
      ),
    })
    expect(storedComputer(db)?.marker).toBe("2026-01-14T12:46:52")
    // An ordinary download stops at the marker, so it finds nothing.
    expect((await download(app)).body.preview).toBeNull()
    const again = (await download(app, { readAll: true })).body.preview!
    expect(again.alreadyImported).toBe(30)
    expect(
      again.leftOut
        .filter((dive) => dive.reason === "earlier")
        .map((dive) => dive.computerStartTime)
    ).toEqual(["2025-12-30T11:43:25"])
  })

  it("forgets the watch, so another can be used", async () => {
    const { db, app } = setup()
    process.env.FAKE_DCTOOL_BEFORE = "20251201"
    await download(app)
    expect((await send(app, "DELETE", "/api/dive-computer")).status).toBe(204)
    expect(storedComputer(db)).toBeNull()
    process.env.FAKE_DCTOOL_SERIAL = "87654321"
    expect((await download(app)).status).toBe(200)
    expect(storedComputer(db)?.serial).toBe("87654321")
  })
})

it("needs the Origin and the JSON type like any write", async () => {
  const { app } = setup()
  const response = await app.request("/api/dive-computer/download", {
    method: "POST",
    headers: { ...apiHeaders, "Content-Type": "application/json" },
    body: "{}",
  })
  expect(response.status).toBe(403)
  void origin
})
