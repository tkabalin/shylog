import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

import { describe, expect, it, onTestFinished } from "vitest"

import { apiHeaders, origin, send, testApp } from "../../test/app.ts"
import { fixtureXml } from "../../test/fixture.ts"
import { migrate } from "../db/migrate.ts"
import { openDatabase, type Db } from "../db/open.ts"
import { snapshot } from "../jobs/nightly.ts"
import { seed } from "../seed.ts"
import { compare } from "./compare.ts"
import { drill, restore, SnapshotRefused } from "./restore.ts"

// A live instance: a seeded database file in its own data folder, and the
// app writing to it.
function instance() {
  const dir = mkdtempSync(join(tmpdir(), "shylog-restore-"))
  const open: Db[] = []
  onTestFinished(() => {
    for (const db of open) if (db.open) db.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const db = openDatabase(join(dir, "shylog.db"))
  open.push(db)
  migrate(db, dir)
  seed(db, fixtureXml, "d4i-2026-10-12.uddf")
  const app = testApp({ db, env: { SHYLOG_DATA_DIR: dir } })
  const reopen = (file = join(dir, "shylog.db")) => {
    const copy = openDatabase(file)
    open.push(copy)
    return copy
  }
  return { dir, db, app, reopen }
}

// A card with one PNG page, made distinct by its last byte.
function putCard(app: ReturnType<typeof testApp>, page: number) {
  const form = new FormData()
  form.append("name", "PADI Open Water")
  form.append(
    "images",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, page])])
  )
  return app.request("/api/cards/card-padi", {
    method: "PUT",
    headers: { ...apiHeaders, Origin: origin },
    body: form,
  })
}

const settings = (db: Db) =>
  db.prepare("SELECT diver_name AS name, max_po2 AS po2 FROM settings").get()

describe("restore", () => {
  it("swaps the snapshot in and replays the moved-aside journal", async () => {
    const { dir, db, app, reopen } = instance()
    await snapshot(db, dir, new Date(2026, 9, 22))
    await send(app, "PUT", "/api/settings", { diverName: "Thomas" })
    await send(app, "PUT", "/api/settings", { maxPo2: 1.6 })
    // Stopped the way a crashed app leaves it: the WAL still beside it.
    expect(existsSync(join(dir, "shylog.db-wal"))).toBe(true)

    const result = restore(dir, "shylog-2026-10-22.db.gz", "all")
    expect(readdirSync(result.aside).sort()).toEqual([
      "shylog.db",
      "shylog.db-shm",
      "shylog.db-wal",
    ])
    expect(result.replay?.replayed).toHaveLength(2)
    expect(result.cardProblems).toEqual([])
    expect(existsSync(join(dir, "shylog.db-wal"))).toBe(false)
    // The old connection still reads the moved-aside file and its WAL.
    expect(compare(reopen(), db)).toEqual([])
  })

  it("replays up to a sequence number and lists the rest", async () => {
    const { dir, db, app, reopen } = instance()
    await snapshot(db, dir, new Date(2026, 9, 22))
    await send(app, "PUT", "/api/settings", { diverName: "Thomas" })
    await send(app, "PUT", "/api/settings", { maxPo2: 1.6 })
    const last = db.prepare("SELECT max(seq) FROM ops").pluck().get() as number
    db.close()

    const result = restore(dir, "shylog-2026-10-22.db.gz", last - 1)
    expect(result.replay?.replayed.map((row) => row.seq)).toEqual([last - 1])
    expect(result.replay?.notReplayed.map((row) => row.seq)).toEqual([last])
    expect(settings(reopen())).toEqual({ name: "Thomas", po2: 1.4 })
  })

  it("replays nothing unless asked, listing every entry", async () => {
    const { dir, db, app, reopen } = instance()
    await snapshot(db, dir, new Date(2026, 9, 22))
    await send(app, "PUT", "/api/settings", { diverName: "Thomas" })
    db.close()

    const result = restore(dir, "shylog-2026-10-22.db.gz")
    expect(result.replay?.replayed).toEqual([])
    expect(result.replay?.notReplayed.map((row) => row.type)).toEqual([
      "putSettings",
    ])
    expect(settings(reopen())).toEqual({ name: "", po2: 1.4 })
  })

  it("names card images a later edit removed", async () => {
    const { dir, db, app } = instance()
    await putCard(app, 1)
    const [before] = readdirSync(join(dir, "cards", "card-padi"))
    await snapshot(db, dir, new Date(2026, 9, 22))
    await putCard(app, 2)
    db.close()

    const result = restore(dir, "shylog-2026-10-22.db.gz")
    expect(result.cardProblems).toEqual([
      `cards/card-padi/${before} is missing`,
    ])
  })

  it("leaves the database in place when the snapshot can't be read", () => {
    const { dir, db } = instance()
    db.close()

    expect(() => restore(dir, "shylog-2026-10-23.db.gz")).toThrow(
      SnapshotRefused
    )
    expect(readdirSync(dir)).toContain("shylog.db")
    expect(existsSync(join(dir, "restore-aside"))).toBe(false)

    // A clean gzip of something that isn't a database.
    mkdirSync(join(dir, "snapshots"), { recursive: true })
    writeFileSync(
      join(dir, "snapshots", "shylog-2026-10-24.db.gz"),
      gzipSync("not a database")
    )
    expect(() => restore(dir, "shylog-2026-10-24.db.gz")).toThrow()
    expect(readdirSync(dir)).toContain("shylog.db")
    expect(readdirSync(dir)).not.toContain("shylog.db.restoring")
    expect(existsSync(join(dir, "restore-aside"))).toBe(false)
  })

  it("still restores when the database can't be read and no replay is asked", async () => {
    const { dir, db } = instance()
    await snapshot(db, dir, new Date(2026, 9, 22))
    db.close()
    const damage = () => writeFileSync(join(dir, "shylog.db"), "not a database")

    damage()
    expect(() =>
      restore(dir, "shylog-2026-10-22.db.gz", "all", new Date(1))
    ).toThrow()
    damage()
    const result = restore(
      dir,
      "shylog-2026-10-22.db.gz",
      undefined,
      new Date(2)
    )
    expect(result.replay).toBeNull()
    expect(result.unlisted).toBeDefined()
  })
})

describe("drill", () => {
  it("finds no difference after a clean replay, and checks card files", async () => {
    const { dir, db, app } = instance()
    await snapshot(db, dir, new Date(2026, 9, 21))
    await snapshot(db, dir, new Date(2026, 9, 22))
    await send(app, "PUT", "/api/settings", { diverName: "Thomas" })
    await putCard(app, 1)

    const clean = drill(dir)
    expect(clean.snapshot).toBe("shylog-2026-10-22.db.gz")
    expect(clean.replay.replayed.map((row) => row.type)).toEqual([
      "putSettings",
      "putCard",
    ])
    expect(clean.differences).toEqual([])

    const [hash] = readdirSync(join(dir, "cards", "card-padi"))
    writeFileSync(join(dir, "cards", "card-padi", hash), "changed")
    expect(drill(dir).differences).toEqual([
      `cards/card-padi/${hash} doesn't match its hash`,
    ])
    rmSync(join(dir, "cards", "card-padi", hash))
    expect(drill(dir).differences).toEqual([
      `cards/card-padi/${hash} is missing`,
    ])
  })

  it("needs a nightly snapshot", () => {
    const { dir } = instance()
    mkdirSync(join(dir, "snapshots"))
    writeFileSync(join(dir, "snapshots", "pre-migration-3.db"), "")
    expect(() => drill(dir)).toThrow("There is no nightly snapshot to restore")
  })
})
