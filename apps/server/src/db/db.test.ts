import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { latestSchemaVersion } from "@shylog/core"
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
  "deleted_entities",
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

// The server's own schema version, so the synthetic migrations below come
// after it.
const latest = migrations.length

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
      new_dive_defaults: "{}",
    })
  })

  it("ends at the schema version core gives the app", () => {
    expect(latest).toBe(latestSchemaVersion)
  })

  it("takes no snapshot and journals each migration", () => {
    expect(existsSync(join(dir, "snapshots"))).toBe(false)
    expect(schemaVersion(db)).toBe(latest)
    expect(ops()).toEqual(
      migrations.map(({ version, name }) => ({
        type: "migration",
        payload: JSON.stringify({ version, name }),
      }))
    )
    expect(currentVersion(db)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("refuses a schema newer than the server's", () => {
    db.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run(
      String(latest + 1)
    )
    expect(() => migrate(db, dir)).toThrow(
      `schema ${latest + 1}, newer than this server's ${latest}`
    )
  })

  it("does nothing when migrated again", () => {
    const version = currentVersion(db)
    migrate(db, dir)
    expect(ops()).toHaveLength(latest)
    expect(currentVersion(db)).toBe(version)
  })
})

describe("migrating a database with data", () => {
  const second: Migration = {
    version: latest + 1,
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
      version: latest + 2,
      name: "add notes",
      up: (db) => db.exec("ALTER TABLE trips ADD COLUMN notes TEXT"),
    }
    migrate(db, dir, [...migrations, second, third])
    const [snapshot, beforeThird] = readdirSync(join(dir, "snapshots")).sort()
    expect(snapshot).toMatch(`pre-migration-${latest + 1}-`)
    expect(beforeThird).toMatch(`pre-migration-${latest + 2}-`)

    // The snapshot is the database before the migration ran.
    const before = openDatabase(join(dir, "snapshots", snapshot))
    expect(schemaVersion(before)).toBe(latest)
    expect(before.prepare("SELECT count(*) FROM ops").pluck().get()).toBe(
      latest
    )
    before.close()

    expect(schemaVersion(db)).toBe(latest + 2)
    expect(ops().slice(-2)).toEqual([
      {
        type: "migration",
        payload: JSON.stringify({ version: latest + 1, name: "add colour" }),
      },
      {
        type: "migration",
        payload: JSON.stringify({ version: latest + 2, name: "add notes" }),
      },
    ])
    expect(db.pragma("foreign_key_check")).toEqual([])
  })

  it("rolls back a migration that breaks a foreign key", () => {
    const broken: Migration = {
      version: latest + 1,
      name: "broken",
      up: (db) =>
        db.exec(
          "INSERT INTO sites (id, name, key, country_code, water_type) VALUES ('site-x', 'X', 'XX:x', 'XX', 'salt')"
        ),
    }
    expect(() => migrate(db, dir, [...migrations, broken])).toThrow(
      /broke foreign keys/
    )
    expect(schemaVersion(db)).toBe(latest)
    expect(db.prepare("SELECT count(*) FROM sites").pluck().get()).toBe(0)
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1)
  })
})

describe("migration 3", () => {
  it("fills SAC's sample figures for dives that already have samples", () => {
    migrate(db, dir, migrations.slice(0, 2))
    db.exec(`
      INSERT INTO sites (id, name, key, country_code, water_type)
        VALUES ('site-a', 'A', 'ZA:a', 'ZA', 'salt');
      INSERT INTO dives (id, start_time, site_id, duration, max_depth)
        VALUES ('dive-a', '2026-07-22T08:00:00', 'site-a', 900, 10),
               ('dive-b', '2026-07-22T12:00:00', 'site-a', 900, 10);
      INSERT INTO samples (dive_id, time, depth) VALUES
        ('dive-a', 0, 0), ('dive-a', 60, 10), ('dive-a', 600, 10),
        ('dive-a', 660, 0), ('dive-a', 900, 0);
    `)
    migrate(db, dir)
    const figures = db
      .prepare(
        "SELECT id, sample_duration, sample_average_depth FROM dives ORDER BY id"
      )
      .all()
    expect(figures).toEqual([
      { id: "dive-a", sample_duration: 660, sample_average_depth: 9.091 },
      { id: "dive-b", sample_duration: null, sample_average_depth: null },
    ])
  })
})

describe("migration 4", () => {
  it("drops the visibility default and keeps the others", () => {
    migrate(db, dir, migrations.slice(0, 3))
    db.prepare("UPDATE settings SET new_dive_defaults = ?").run(
      '{"weight":4,"visibilityMode":"rating"}'
    )
    migrate(db, dir)
    expect(
      db.prepare("SELECT new_dive_defaults FROM settings").pluck().get()
    ).toBe('{"weight":4}')
  })
})
