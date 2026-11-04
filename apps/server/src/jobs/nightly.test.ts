import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"

import { DOMParser } from "@xmldom/xmldom"
import { describe, expect, it, onTestFinished, vi } from "vitest"

import { apiHeaders, testApp } from "../../test/app.ts"
import { seededDb } from "../../test/fixture.ts"
import { openDatabase } from "../db/open.ts"
import { checkUddf, exportDir, exportFile } from "./export.ts"
import {
  checkedSnapshot,
  localDate,
  nightly,
  prune,
  retained,
  scheduleNightly,
  snapshot,
  snapshotsDir,
  startNightly,
} from "./nightly.ts"

function dataDir() {
  const dir = mkdtempSync(join(tmpdir(), "shylog-nightly-"))
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const diveCount = (db: ReturnType<typeof seededDb>) =>
  db.prepare("SELECT count(*) FROM dives").pluck().get()

const day = 24 * 60 * 60 * 1000
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * day).toISOString().slice(0, 10)

describe("snapshot", () => {
  it("writes a compressed copy named for the local date", async () => {
    const dir = dataDir()
    const db = seededDb()
    const now = new Date(2026, 9, 22, 0, 0, 0)
    const file = await snapshot(db, dir, now)

    expect(file).toBe(join(snapshotsDir(dir), "shylog-2026-10-22.db.gz"))
    const stat = lstatSync(file)
    expect(stat.isFile() && !stat.isSymbolicLink()).toBe(true)
    // The temp files are gone once the rename is done.
    expect(readdirSync(snapshotsDir(dir))).toEqual(["shylog-2026-10-22.db.gz"])

    const copy = join(dir, "copy.db")
    writeFileSync(copy, gunzipSync(readFileSync(file)))
    const restored = openDatabase(copy)
    onTestFinished(() => {
      restored.close()
    })
    expect(diveCount(restored)).toBe(diveCount(db))
    expect(
      db
        .prepare("SELECT value FROM meta WHERE key = 'last_snapshot_at'")
        .pluck()
        .get()
    ).toBe(now.toISOString())
  })
})

describe("nightly", () => {
  it("logs a failure and leaves the last snapshot time in health", async () => {
    const dir = dataDir()
    const db = seededDb()
    const app = testApp({ db })
    const first = new Date(2026, 9, 21)
    await nightly(db, dir, "ok", first)

    // A file where the folder should be makes the next snapshot fail.
    rmSync(snapshotsDir(dir), { recursive: true })
    writeFileSync(snapshotsDir(dir), "")
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    onTestFinished(() => error.mockRestore())
    await nightly(db, dir, "ok", new Date(2026, 9, 22))

    expect(error).toHaveBeenCalledWith(
      "Nightly snapshot failed:",
      expect.any(Error)
    )
    const health = (await (
      await app.request("/api/health", { headers: apiHeaders })
    ).json()) as { lastSnapshotAt: string }
    expect(health.lastSnapshotAt).toBe(first.toISOString())
  })

  it("writes the UDDF export after the snapshot", async () => {
    const dir = dataDir()
    const db = seededDb()
    const now = new Date(2026, 9, 22)
    const order: string[] = []
    const prepare = db.prepare.bind(db)
    const spy = vi.spyOn(db, "prepare").mockImplementation(((sql: string) => {
      if (sql.startsWith("VACUUM INTO")) order.push("snapshot")
      if (sql.includes("FROM dives WHERE deleted_at IS NULL ORDER BY"))
        order.push("export")
      return prepare(sql)
    }) as typeof db.prepare)
    onTestFinished(() => spy.mockRestore())
    await nightly(db, dir, "ok", now)

    expect(order).toEqual(["snapshot", "export"])
    const xml = readFileSync(exportFile(dir), "utf8")
    expect(xml.match(/<dive id=/g)).toHaveLength(46)
    // The temp file is gone once the rename is done.
    expect(readdirSync(exportDir(dir))).toEqual(["dives.uddf"])
    const meta = (key: string) =>
      db.prepare("SELECT value FROM meta WHERE key = ?").pluck().get(key)
    expect(meta("last_export_at")).toBe(now.toISOString())
  })

  it("keeps the last export when one fails, says so in health, and retries", async () => {
    const dir = dataDir()
    const db = seededDb()
    const app = testApp({ db })
    const exportHealth = async () =>
      (await (
        await app.request("/api/health", { headers: apiHeaders })
      ).json()) as {
        lastExportAt: string | null
        exportFailedAt: string | null
      }
    const first = new Date(2026, 9, 21)
    await nightly(db, dir, "ok", first)
    const good = readFileSync(exportFile(dir), "utf8")

    // A change the next good export should carry.
    const id = db.prepare("SELECT id FROM dives LIMIT 1").pluck().get()
    db.prepare("UPDATE dives SET notes = ? WHERE id = ?").run("ok", id)
    // The re-parse refusing the written file.
    const parse = vi
      .spyOn(DOMParser.prototype, "parseFromString")
      .mockImplementation(() => {
        throw new Error("unreadable")
      })
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    onTestFinished(() => error.mockRestore())
    const second = new Date(2026, 9, 22)
    await nightly(db, dir, "ok", second)
    parse.mockRestore()

    expect(error).toHaveBeenCalledWith(
      "Nightly export failed:",
      expect.any(Error)
    )
    expect(readFileSync(exportFile(dir), "utf8")).toBe(good)
    expect(readdirSync(exportDir(dir))).toEqual(["dives.uddf"])
    expect(await exportHealth()).toMatchObject({
      lastExportAt: first.toISOString(),
      exportFailedAt: second.toISOString(),
    })

    const third = new Date(2026, 9, 23)
    await nightly(db, dir, "ok", third)
    expect(readFileSync(exportFile(dir), "utf8")).toContain("<para>ok</para>")
    expect(await exportHealth()).toMatchObject({
      lastExportAt: third.toISOString(),
      exportFailedAt: null,
    })
  })

  it("runs at each local midnight", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 22, 23, 0, 0) })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const run = vi.fn()
    scheduleNightly(run)

    vi.advanceTimersByTime(59 * 60 * 1000)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60 * 1000)
    expect(run).toHaveBeenCalledTimes(1)
    expect(localDate(new Date())).toBe("2026-10-23")
    vi.advanceTimersByTime(day)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("takes a missed snapshot, or a missing export, at startup", async () => {
    const dir = dataDir()
    const db = seededDb()
    vi.useFakeTimers({ now: new Date(2026, 9, 22, 9, 0, 0) })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const run = vi.fn()
    startNightly(dir, run)
    expect(run).toHaveBeenCalledTimes(1)

    // Today's snapshot but no export yet, as on a first start.
    await snapshot(db, dir, new Date())
    vi.clearAllTimers()
    startNightly(dir, run)
    expect(run).toHaveBeenCalledTimes(2)

    mkdirSync(exportDir(dir), { recursive: true })
    writeFileSync(exportFile(dir), "")
    vi.clearAllTimers()
    startNightly(dir, run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("doesn't snapshot or prune a damaged database", async () => {
    const dir = dataDir()
    const db = seededDb()
    // The 7th goes once pruned: the 14th is its month's newest.
    const old = ["shylog-2020-01-07.db.gz", "shylog-2020-01-14.db.gz"]
    mkdirSync(snapshotsDir(dir))
    for (const name of old) writeFileSync(join(snapshotsDir(dir), name), "")

    await expect(
      checkedSnapshot(db, dir, "failed", new Date(2026, 9, 22))
    ).rejects.toThrow("The database failed its check")
    expect(readdirSync(snapshotsDir(dir)).sort()).toEqual(old)

    await checkedSnapshot(db, dir, "ok", new Date(2026, 9, 22))
    expect(readdirSync(snapshotsDir(dir)).sort()).toEqual([
      old[1],
      "shylog-2026-10-22.db.gz",
    ])
  })

  it("leaves the last export, and no alert, for a damaged database", async () => {
    const dir = dataDir()
    const db = seededDb()
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    onTestFinished(() => error.mockRestore())
    await nightly(db, dir, "failed", new Date(2026, 9, 22))

    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(
      "Nightly snapshot failed:",
      expect.any(Error)
    )
    expect(readdirSync(dir)).not.toContain("export")
    expect(
      db
        .prepare("SELECT value FROM meta WHERE key = 'export_failed_at'")
        .pluck()
        .get()
    ).toBeUndefined()
  })
})

describe("retention", () => {
  it("keeps the right set after three years of nightly runs", () => {
    const start = "2024-01-01"
    const today = "2026-12-31"
    let kept: string[] = []
    for (let date = start; date <= today; date = addDays(date, 1)) {
      kept = [...retained([...kept, date], date)]
    }

    // Every night has a snapshot, so the newest of a week is its Sunday and
    // the newest of a month its last day.
    const expected: string[] = []
    for (let date = start; date <= today; date = addDays(date, 1)) {
      const age = (Date.parse(today) - Date.parse(date)) / day
      const sunday = new Date(Date.parse(date)).getUTCDay() === 0
      const lastOfMonth = addDays(date, 1).slice(8) === "01"
      if (age < 90 || (sunday && date >= "2024-12-31") || lastOfMonth) {
        expected.push(date)
      }
    }
    expect(kept.sort()).toEqual(expected)
    // 90 daily, about 2 × 52 weekly, plus the months before that.
    expect(kept.length).toBeGreaterThan(190)
    expect(kept.length).toBeLessThan(220)
  })

  it("matches what a single pruning of the same dates keeps", () => {
    const dates: string[] = []
    for (
      let date = "2024-01-01";
      date <= "2026-12-31";
      date = addDays(date, 3)
    ) {
      dates.push(date)
    }
    let kept: string[] = []
    for (const date of dates) kept = [...retained([...kept, date], date)]
    expect(kept.sort()).toEqual([...retained(dates, dates.at(-1)!)].sort())
  })

  it("prunes only nightly snapshots", () => {
    const dir = dataDir()
    mkdirSync(snapshotsDir(dir))
    const names = [
      "shylog-2026-01-01.db.gz",
      "shylog-2026-01-02.db.gz",
      "shylog-2026-01-31.db.gz",
      "shylog-2026-10-22.db.gz",
      "pre-migration-3-2026-01-02T10-00-00-000Z.db",
      "notes.txt",
    ]
    for (const name of names) writeFileSync(join(snapshotsDir(dir), name), "")
    // Temp files: one a crashed run left two days ago, one a run in progress.
    const now = new Date()
    const stale = join(
      snapshotsDir(dir),
      "shylog-2026-10-20.db.gz.1a2b3c4d.tmp"
    )
    writeFileSync(stale, "")
    utimesSync(
      stale,
      new Date(now.getTime() - 2 * day),
      new Date(now.getTime() - 2 * day)
    )
    writeFileSync(
      join(snapshotsDir(dir), "shylog-2026-10-22.db.gz.5e6f7a8b.raw.tmp"),
      ""
    )
    prune(dir, "2026-10-22", now)
    expect(readdirSync(snapshotsDir(dir)).sort()).toEqual(
      [
        // 1 January is a Thursday, so its week's newest is the 2nd; the 31st
        // is January's newest.
        "notes.txt",
        "pre-migration-3-2026-01-02T10-00-00-000Z.db",
        "shylog-2026-01-02.db.gz",
        "shylog-2026-01-31.db.gz",
        "shylog-2026-10-22.db.gz",
        "shylog-2026-10-22.db.gz.5e6f7a8b.raw.tmp",
      ].sort()
    )
  })
})

// The read-back check, which the download also runs on the text it sends.
describe("export checks", () => {
  const uddf = (dives: number) =>
    `<uddf xmlns="http://www.streit.cc/uddf/3.2/">${"<dive/>".repeat(dives)}</uddf>`

  it("counts a UDDF export's dives", () => {
    expect(() => checkUddf(uddf(2), 2)).not.toThrow()
    expect(() => checkUddf(uddf(1), 2)).toThrow(
      "The export holds 1 dives, not 2"
    )
    expect(() => checkUddf("<uddf>", 0)).toThrow()
  })
})
