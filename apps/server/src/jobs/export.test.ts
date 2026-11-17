import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it, onTestFinished, vi } from "vitest"

import { seededDb } from "../../test/fixture.ts"
import { openDatabase, type Db } from "../db/open.ts"
import { writeUddf } from "../uddf/writer.ts"
import { inWorker } from "./export.ts"

// How many export workers are alive at once.
const workers = vi.hoisted(() => ({ alive: 0, most: 0 }))
vi.mock("node:worker_threads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:worker_threads")>()
  class Counted extends actual.Worker {
    constructor(...args: ConstructorParameters<typeof actual.Worker>) {
      super(...args)
      workers.most = Math.max(workers.most, ++workers.alive)
      this.once("exit", () => workers.alive--)
    }
  }
  return { ...actual, Worker: Counted }
})

// A database file, as the server has, which the worker opens read-only.
// Changed in memory first, which is quicker than through the file's WAL.
function fileDb(change = (db: Db) => db) {
  const dir = mkdtempSync(join(tmpdir(), "shylog-export-"))
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, "shylog.db")
  change(seededDb()).prepare("VACUUM INTO ?").run(file)
  const db = openDatabase(file)
  onTestFinished(() => {
    db.close()
  })
  return db
}

describe("export worker", () => {
  it("fails alone, out of memory or not, one export at a time", async () => {
    const now = new Date(2026, 9, 22)
    // A 32 MB cap, twice what loading the worker takes, against 84 MB of
    // notes, 2 MB each: Node lets an ending worker allocate only 16 MB past
    // its cap, and one larger value would abort the test's process.
    const big = fileDb((db) => {
      db.prepare("UPDATE dives SET notes = ?").run("x".repeat(2 * 2 ** 20))
      return db
    })
    const db = fileDb()

    const tooBig = inWorker(
      big,
      { kind: "uddf" },
      { maxOldGenerationSizeMb: 32 }
    )
    // A throw, which reaches the server before its worker has gone: the
    // database file as the data folder, which can't hold export/.
    const failed = inWorker(db, { kind: "files", dataDir: db.name, now })
    const next = inWorker<Uint8Array>(db, { kind: "uddf" })
    await expect(tooBig).rejects.toMatchObject({
      code: "ERR_WORKER_OUT_OF_MEMORY",
    })
    await expect(failed).rejects.toMatchObject({ code: "ENOTDIR" })
    expect(new TextDecoder().decode(await next)).toBe(writeUddf(db).xml)
    expect(workers.most).toBe(1)
  })
})
