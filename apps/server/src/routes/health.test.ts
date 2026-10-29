import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it, onTestFinished, vi } from "vitest"

import {
  apiHeaders,
  origin,
  testApp,
  testEnv,
  testWebRoot,
} from "../../test/app.ts"
import { fixtureXml, seededDb } from "../../test/fixture.ts"
import { migrate } from "../db/migrate.ts"
import { openDatabase, type Db } from "../db/open.ts"
import { seed } from "../seed.ts"
import { boot } from "../server.ts"

interface Health {
  walBytes: number
  integrity: string
  writesPaused: boolean
  diveCount: number
  lastSnapshotAt: string | null
  lastExportAt: string | null
  server: string
}

const health = async (app: {
  request: ReturnType<typeof testApp>["request"]
}) =>
  (await (
    await app.request("/api/health", { headers: apiHeaders })
  ).json()) as Health

// A data directory for one test, removed once the servers booted in it have
// closed their databases, in one hook so the order is certain.
function dataDir() {
  const dir = mkdtempSync(join(tmpdir(), "shylog-health-"))
  const open: Db[] = []
  onTestFinished(() => {
    for (const db of open) db.close()
    rmSync(dir, { recursive: true, force: true })
  })
  return {
    dir,
    boot: () => {
      const booted = boot(testEnv({ SHYLOG_DATA_DIR: dir }), testWebRoot())
      open.push(booted.db)
      return booted
    },
  }
}

describe("GET /api/health", () => {
  it("reports the WAL, integrity, dive count, backup times and server", async () => {
    expect(await health(testApp({ db: seededDb() }))).toEqual({
      walBytes: 0,
      integrity: "ok",
      writesPaused: false,
      diveCount: 46,
      lastSnapshotAt: null,
      lastExportAt: null,
      server: "shylog",
    })
  })

  it("reads the WAL size of a database on disk", async () => {
    const { app } = dataDir().boot()
    expect((await health(app)).walBytes).toBeGreaterThan(0)
  })
})

// Garbles a page of an index on sites past its header, leaving the rest
// readable, as a disk fault might.
function corrupt(file: string) {
  const db = openDatabase(file)
  const page = db.pragma("page_size", { simple: true }) as number
  const root = db
    .prepare(
      "SELECT rootpage FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'sites'"
    )
    .pluck()
    .get() as number
  db.close()
  const fd = openSync(file, "r+")
  writeSync(
    fd,
    Buffer.alloc(page - 8, 0xff),
    0,
    page - 8,
    (root - 1) * page + 8
  )
  closeSync(fd)
}

describe("the startup integrity check", () => {
  it("pauses writes on a corrupt database and says so", async () => {
    const { dir, boot } = dataDir()
    const file = join(dir, "shylog.db")
    const setup = openDatabase(file)
    migrate(setup, dir)
    seed(setup, fixtureXml, "fixture")
    setup.close()
    corrupt(file)

    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    onTestFinished(() => logged.mockRestore())
    const { app, state } = boot()
    expect(state.integrity).toBe("failed")
    expect(logged).toHaveBeenCalledWith(
      "integrity_check failed:",
      expect.anything()
    )
    expect(await health(app)).toMatchObject({
      integrity: "failed",
      writesPaused: true,
    })
    const write = await app.request("/api/anything", {
      method: "POST",
      headers: {
        ...apiHeaders,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: "{}",
    })
    expect(write.status).toBe(503)
  })
})
