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

import { describe, expect, it, onTestFinished, vi } from "vitest"

import { apiHeaders, testApp } from "../../test/app.ts"
import { seededDb } from "../../test/fixture.ts"
import { openDatabase } from "../db/open.ts"
import {
  localDate,
  nightly,
  prune,
  retained,
  scheduleNightly,
  snapshot,
  snapshotsDir,
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
    await nightly(db, dir, first)

    // A file where the folder should be makes the next snapshot fail.
    rmSync(snapshotsDir(dir), { recursive: true })
    writeFileSync(snapshotsDir(dir), "")
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    onTestFinished(() => error.mockRestore())
    await nightly(db, dir, new Date(2026, 9, 22))

    expect(error).toHaveBeenCalledWith(
      "Nightly snapshot failed:",
      expect.any(Error)
    )
    const health = (await (
      await app.request("/api/health", { headers: apiHeaders })
    ).json()) as { lastSnapshotAt: string }
    expect(health.lastSnapshotAt).toBe(first.toISOString())
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
