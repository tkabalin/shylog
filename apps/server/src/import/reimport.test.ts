import type { ImportPreview } from "@shylog/core"
import { describe, expect, it } from "vitest"

import { testDb } from "../../test/db.ts"
import { d4iXml } from "../../test/uddf-fixtures.ts"
import { setDeleted } from "../apply/dive.ts"
import type { Db } from "../db/open.ts"
import { change } from "../routes/change.ts"
import { applyImport } from "./apply.ts"
import { storePreview } from "./preview.ts"

const now = new Date("2026-11-07T10:00:00Z")

// Uploads the D4i export and applies the review as proposed.
function importD4i(db: Db) {
  const preview = storePreview(db, d4iXml, now)
  const result = applyImport(
    db,
    preview.id,
    {
      revision: preview.revision,
      pairs: preview.pairs.map(({ computerDive, diveId }) => ({
        computerDive: computerDive.ref,
        diveId,
      })),
      add: preview.newDives.map((dive) => dive.ref),
      include: [],
    },
    now
  )
  return { preview, result }
}

const offered = (preview: ImportPreview) =>
  preview.pairs.length + preview.newDives.length + preview.leftOut.length

// Whole exports are imported here, which takes seconds under CI's coverage.
describe("importing the same export again", { timeout: 20_000 }, () => {
  it("skips every dive as already imported", () => {
    const db = testDb()
    expect(importD4i(db).result).toMatchObject({
      added: 42,
      leftOut: 30,
    })
    const dives = db.prepare("SELECT count(*) FROM dives").pluck().get()

    const { preview, result } = importD4i(db)
    expect(preview.alreadyImported).toBe(72)
    expect(offered(preview)).toBe(0)
    expect(result).toMatchObject({
      status: "applied",
      paired: 0,
      added: 0,
      leftOut: 0,
      alreadyImported: 72,
    })
    expect(db.prepare("SELECT count(*) FROM dives").pluck().get()).toBe(dives)
  })

  it("still skips a dive deleted since", () => {
    const db = testDb()
    importD4i(db)
    const id = db
      .prepare("SELECT id FROM dives LIMIT 1")
      .pluck()
      .get() as string
    change(db, (at) => setDeleted(db, id, true, at), {
      type: "deleteDive",
      payload: { diveId: id },
    })

    const { preview } = importD4i(db)
    expect(preview.alreadyImported).toBe(72)
    expect(offered(preview)).toBe(0)
    expect(
      db
        .prepare("SELECT count(*) FROM dives WHERE deleted_at IS NULL")
        .pluck()
        .get()
    ).toBe(41)
  })
})
