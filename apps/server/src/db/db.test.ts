import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { currentVersion } from "../journal.ts"
import {
  migrate,
  migrations,
  schemaVersion,
  type Migration,
} from "./migrate.ts"
import { openDatabase, type Db } from "./open.ts"

const tables = [
  "aliases",
  "certification_images",
  "certifications",
  "countries",
  "dive_buddies",
  "dive_centres",
  "dive_professionals",
  "dive_tags",
  "dives",
  "events",
  "field_meta",
  "fingerprints",
  "import_previews",
  "import_raw",
  "meta",
  "ops",
  "people",
  "regions",
  "samples",
  "settings",
  "sites",
  "trips",
]

let dir: string
let db: Db

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shylog-db-"))
  db = openDatabase(join(dir, "shylog.db"))
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const ops = () =>
  db.prepare("SELECT type, payload FROM ops ORDER BY seq").all() as {
    type: string
    payload: string
  }[]

describe("a fresh database", () => {
  beforeEach(() => migrate(db, dir))

  it("has every table in the spec's list", () => {
    const names = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .pluck()
      .all()
    expect(names).toEqual(tables)
  })

  it("is opened with the spec's pragmas", () => {
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal")
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1)
    // 2 is FULL.
    expect(db.pragma("synchronous", { simple: true })).toBe(2)
    expect(db.pragma("busy_timeout", { simple: true })).toBe(5000)
  })

  it("seeds the ISO 3166 countries and default settings", () => {
    expect(db.prepare("SELECT count(*) FROM countries").pluck().get()).toBe(249)
    expect(db.prepare("SELECT * FROM settings").get()).toEqual({
      id: 1,
      diver_name: "",
      max_po2: 1.4,
      new_dive_defaults: '{"visibilityMode":"metres"}',
    })
  })

  it("takes no snapshot and journals the migration", () => {
    expect(existsSync(join(dir, "snapshots"))).toBe(false)
    expect(schemaVersion(db)).toBe(1)
    expect(ops()).toEqual([
      { type: "migration", payload: '{"version":1,"name":"initial"}' },
    ])
    expect(currentVersion(db)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("refuses a schema newer than the server's", () => {
    db.prepare("UPDATE meta SET value = '2' WHERE key = 'schema_version'").run()
    expect(() => migrate(db, dir)).toThrow(
      /schema 2, newer than this server's 1/
    )
  })

  it("does nothing when migrated again", () => {
    const version = currentVersion(db)
    migrate(db, dir)
    expect(ops()).toHaveLength(1)
    expect(currentVersion(db)).toBe(version)
  })
})

describe("migrating a database with data", () => {
  const second: Migration = {
    version: 2,
    name: "add colour",
    up: (db) => db.exec("ALTER TABLE trips ADD COLUMN colour TEXT"),
  }

  beforeEach(() => {
    migrate(db, dir)
    db.prepare(
      "INSERT INTO trips (id, name, key) VALUES ('trip-a', 'A', 'a')"
    ).run()
  })

  it("snapshots before each migration, then journals after the change", () => {
    const third: Migration = {
      version: 3,
      name: "add notes",
      up: (db) => db.exec("ALTER TABLE trips ADD COLUMN notes TEXT"),
    }
    migrate(db, dir, [...migrations, second, third])
    const [snapshot, beforeThird] = readdirSync(join(dir, "snapshots")).sort()
    expect(snapshot).toMatch(/^pre-migration-2-.*\.db$/)
    expect(beforeThird).toMatch(/^pre-migration-3-.*\.db$/)

    // The snapshot is the database before the migration ran.
    const before = openDatabase(join(dir, "snapshots", snapshot))
    expect(schemaVersion(before)).toBe(1)
    expect(before.prepare("SELECT count(*) FROM ops").pluck().get()).toBe(1)
    before.close()

    expect(schemaVersion(db)).toBe(3)
    expect(ops().slice(-2)).toEqual([
      { type: "migration", payload: '{"version":2,"name":"add colour"}' },
      { type: "migration", payload: '{"version":3,"name":"add notes"}' },
    ])
    expect(db.pragma("foreign_key_check")).toEqual([])
  })

  it("rolls back a migration that breaks a foreign key", () => {
    const broken: Migration = {
      version: 2,
      name: "broken",
      up: (db) =>
        db.exec(
          "INSERT INTO sites (id, name, key, country_code, water_type) VALUES ('site-x', 'X', 'XX:x', 'XX', 'salt')"
        ),
    }
    expect(() => migrate(db, dir, [...migrations, broken])).toThrow(
      /broke foreign keys/
    )
    expect(schemaVersion(db)).toBe(1)
    expect(db.prepare("SELECT count(*) FROM sites").pluck().get()).toBe(0)
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1)
  })
})
