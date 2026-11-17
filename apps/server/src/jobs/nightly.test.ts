import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"

import { DOMParser } from "@xmldom/xmldom"
import { describe, expect, it, onTestFinished, vi } from "vitest"

import { apiHeaders, testApp } from "../../test/app.ts"
import { captureLog } from "../../test/log.ts"
import { seededDb } from "../../test/fixture.ts"
import { csvHeaders } from "../csv/writer.ts"
import { openDatabase } from "../db/open.ts"
import {
  checkCsv,
  checkUddf,
  csvFile,
  exportDir,
  exportFile,
  writeFiles,
} from "./export.ts"
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

// The CSV's read-back parse, which a test makes refuse the file.
const csvCheck = vi.hoisted(() => ({ fail: false }))
vi.mock("csv-parse/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("csv-parse/sync")>()
  return {
    ...actual,
    parse: ((...args: Parameters<typeof actual.parse>) => {
      if (csvCheck.fail) throw new Error("unreadable")
      return actual.parse(...args)
    }) as typeof actual.parse,
  }
})

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
    const lines = captureLog()
    await nightly(db, dir, "ok", new Date(2026, 9, 22))

    expect(lines).toContainEqual(
      expect.objectContaining({
        level: "error",
        event: "snapshot_failed",
        err: expect.objectContaining({ stack: expect.any(String) }),
      })
    )
    const health = (await (
      await app.request("/api/health", { headers: apiHeaders })
    ).json()) as { lastSnapshotAt: string }
    expect(health.lastSnapshotAt).toBe(first.toISOString())
  })

  it("logs what the snapshot and the export wrote, and how long each took", async () => {
    const dir = dataDir()
    const db = seededDb()
    const lines = captureLog()
    await nightly(db, dir, "ok", new Date(2026, 9, 22))

    const file = join(snapshotsDir(dir), "shylog-2026-10-22.db.gz")
    expect(lines).toEqual([
      expect.objectContaining({
        level: "info",
        event: "snapshot",
        file,
        bytes: statSync(file).size,
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({
        level: "info",
        event: "export",
        dives: 42,
        uddfBytes: statSync(exportFile(dir)).size,
        csvBytes: statSync(csvFile(dir)).size,
        durationMs: expect.any(Number),
      }),
    ])
  })

  it("purges expired import previews before the snapshot", async () => {
    const dir = dataDir()
    const db = seededDb()
    const now = new Date(2026, 9, 22)
    const insert = db.prepare(
      "INSERT INTO import_previews VALUES (?, 'v', 'a', ?, '{}', 'file')"
    )
    insert.run("import-old", now.toISOString())
    insert.run("import-new", new Date(now.getTime() + 1).toISOString())
    await nightly(db, dir, "ok", now)
    const file = join(snapshotsDir(dir), "shylog-2026-10-22.db.gz")
    const copy = join(dir, "copy.db")
    writeFileSync(copy, gunzipSync(readFileSync(file)))
    const restored = openDatabase(copy)
    onTestFinished(() => {
      restored.close()
    })
    expect(
      restored.prepare("SELECT id FROM import_previews").pluck().all()
    ).toEqual(["import-new"])
  })

  it("writes the UDDF and CSV exports after the snapshot", async () => {
    const dir = dataDir()
    const db = seededDb()
    const now = new Date(2026, 9, 22)
    const order: string[] = []
    const prepare = db.prepare.bind(db)
    const spy = vi.spyOn(db, "prepare").mockImplementation(((sql: string) => {
      if (sql.startsWith("VACUUM INTO")) order.push("snapshot")
      return prepare(sql)
    }) as typeof db.prepare)
    // The export's worker reads a copy of an in-memory database, taken as
    // it starts.
    const serialize = db.serialize.bind(db)
    const copy = vi.spyOn(db, "serialize").mockImplementation(() => {
      order.push("export")
      return serialize()
    })
    onTestFinished(() => {
      spy.mockRestore()
      copy.mockRestore()
    })
    await nightly(db, dir, "ok", now)

    expect(order).toEqual(["snapshot", "export"])
    const xml = readFileSync(exportFile(dir), "utf8")
    expect(xml.match(/<dive id=/g)).toHaveLength(42)
    expect(readFileSync(csvFile(dir), "utf8").match(/\r\ndive-/g)).toHaveLength(
      42
    )
    // The temp files are gone once the renames are done.
    expect(readdirSync(exportDir(dir)).sort()).toEqual([
      "dives.csv",
      "dives.uddf",
    ])
    const meta = (key: string) =>
      db.prepare("SELECT value FROM meta WHERE key = ?").pluck().get(key)
    expect(meta("last_export_at")).toBe(now.toISOString())
  })

  it("says in health when an export fails, and clears it on the next", async () => {
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

    // A change the next good export should carry.
    const id = db.prepare("SELECT id FROM dives LIMIT 1").pluck().get()
    db.prepare("UPDATE dives SET notes = ? WHERE id = ?").run("ok", id)
    // A file where the folder should be fails the worker's write.
    rmSync(exportDir(dir), { recursive: true })
    writeFileSync(exportDir(dir), "")
    const lines = captureLog()
    const second = new Date(2026, 9, 22)
    await nightly(db, dir, "ok", second)

    expect(lines).toContainEqual(
      expect.objectContaining({
        level: "error",
        event: "export_failed",
        err: expect.objectContaining({ stack: expect.any(String) }),
      })
    )
    expect(await exportHealth()).toMatchObject({
      lastExportAt: first.toISOString(),
      exportFailedAt: second.toISOString(),
    })

    rmSync(exportDir(dir))
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

  it("takes a missed snapshot, or a missing export file, at startup", async () => {
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

    // The UDDF without the CSV, as left by a version before it.
    mkdirSync(exportDir(dir), { recursive: true })
    writeFileSync(exportFile(dir), "")
    vi.clearAllTimers()
    startNightly(dir, run)
    expect(run).toHaveBeenCalledTimes(3)

    writeFileSync(csvFile(dir), "")
    vi.clearAllTimers()
    startNightly(dir, run)
    expect(run).toHaveBeenCalledTimes(3)
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
    const lines = captureLog()
    await nightly(db, dir, "failed", new Date(2026, 9, 22))

    expect(lines.map(({ level, event }) => ({ level, event }))).toEqual([
      { level: "error", event: "snapshot_failed" },
    ])
    expect(readdirSync(dir)).not.toContain("export")
    expect(
      db
        .prepare("SELECT value FROM meta WHERE key = 'export_failed_at'")
        .pluck()
        .get()
    ).toBeUndefined()
  })
})

// The worker's side of the export, run here so a test can break its checks.
describe("export files", () => {
  function written() {
    const dir = dataDir()
    const db = seededDb()
    writeFiles(db, dir, new Date(2026, 9, 21))
    const good = readFileSync(exportFile(dir), "utf8")
    const goodCsv = readFileSync(csvFile(dir), "utf8")
    // A change a failed export mustn't carry.
    const id = db.prepare("SELECT id FROM dives LIMIT 1").pluck().get()
    db.prepare("UPDATE dives SET notes = ? WHERE id = ?").run("ok", id)
    return { dir, db, good, goodCsv }
  }
  const kept = (dir: string, good: string, goodCsv: string) => {
    expect(readFileSync(exportFile(dir), "utf8")).toBe(good)
    // The CSV isn't swapped in without the UDDF beside it.
    expect(readFileSync(csvFile(dir), "utf8")).toBe(goodCsv)
    expect(readdirSync(exportDir(dir)).sort()).toEqual([
      "dives.csv",
      "dives.uddf",
    ])
  }

  it("keeps both files when the UDDF fails its check", () => {
    const { dir, db, good, goodCsv } = written()
    const parse = vi
      .spyOn(DOMParser.prototype, "parseFromString")
      .mockImplementation(() => {
        throw new Error("unreadable")
      })
    onTestFinished(() => parse.mockRestore())
    expect(() => writeFiles(db, dir, new Date(2026, 9, 22))).toThrow(
      "unreadable"
    )
    kept(dir, good, goodCsv)
  })

  it("keeps both files when the CSV fails its check after the UDDF passed", () => {
    const { dir, db, good, goodCsv } = written()
    csvCheck.fail = true
    onTestFinished(() => {
      csvCheck.fail = false
    })
    expect(() => writeFiles(db, dir, new Date(2026, 9, 22))).toThrow(
      "unreadable"
    )
    kept(dir, good, goodCsv)
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

// The checks, which the downloads run on the file they send.
describe("export checks", () => {
  const uddf = (groups: string[], head = "", tail = "</uddf>") => ({
    head: `<uddf xmlns="http://www.streit.cc/uddf/3.2/">${head}<profiledata>`,
    groups,
    tail: `</profiledata>${tail}`,
  })
  const group = "<repetitiongroup><dive/></repetitiongroup>"

  it("counts a UDDF export's dives, a group at a time", () => {
    expect(() => checkUddf(uddf([group, group]))).not.toThrow()
    expect(() => checkUddf(uddf([group, "<repetitiongroup/>"]))).toThrow(
      "The export holds 1 dives, not 2"
    )
    // Under the file's namespace, as in the file.
    expect(() => checkUddf(uddf([group, '<dive xmlns="other"/>']))).toThrow(
      "The export holds 1 dives, not 2"
    )
    expect(() => checkUddf(uddf([group], "<dive/>"))).toThrow(
      "The export holds 2 dives, not 1"
    )
  })

  it("refuses a dive, or the rest of the file, that isn't well-formed", () => {
    expect(() => checkUddf(uddf([group, "<repetitiongroup>"]))).toThrow()
    expect(() => checkUddf(uddf([group], "", ""))).toThrow()
  })

  // One DOM of a whole 1000-dive file outgrew the server's memory.
  it("parses the export a dive at a time", () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString")
    onTestFinished(() => parse.mockRestore())
    writeFiles(seededDb(), dataDir(), new Date(2026, 9, 22))

    const dives = parse.mock.calls.map(
      ([xml]) => xml.split("<dive ").length - 1
    )
    expect(dives.filter((n) => n === 1)).toHaveLength(42)
    // The rest of the file, without them.
    expect(dives.filter((n) => n !== 1)).toEqual([0])
  })

  it("counts a CSV export's rows and checks their width", () => {
    const width = csvHeaders.length
    const row = (cells: number) => `${Array(cells).fill("x").join(",")}\r\n`
    expect(() => checkCsv(row(width) + row(width), 1)).not.toThrow()
    expect(() => checkCsv(row(width), 1)).toThrow(
      "The CSV export holds 0 rows, not 1"
    )
    expect(() => checkCsv(row(width - 1) + row(width - 1), 1)).toThrow(
      `The CSV export's rows aren't ${width} wide`
    )
  })
})
