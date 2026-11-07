import { opVersion, uploadDraftRequest, type ImportPreview } from "@shylog/core"
import { describe, expect, it } from "vitest"

import { convertSsi } from "../scripts/ssi/convert.ts"
import { boat, csv, extras, shore } from "../scripts/ssi/fixture.ts"
import { applyDraft } from "../src/apply/draft.ts"
import type { Db } from "../src/db/open.ts"
import { applyImport } from "../src/import/apply.ts"
import { pendingPreview, storePreview } from "../src/import/preview.ts"
import { readUddf } from "../src/uddf/reader.ts"
import { testDb } from "./db.ts"
import { byFixtureNumber, d4iXml } from "./uddf-fixtures.ts"

const fixture = byFixtureNumber(d4iXml, readUddf(d4iXml))
const now = new Date("2026-11-07T10:00:00Z")

const proposed = (preview: ImportPreview) => ({
  revision: preview.revision,
  pairs: preview.pairs.map(({ computerDive, diveId }) => ({
    computerDive: computerDive.ref,
    diveId,
  })),
  add: preview.newDives.map((dive) => dive.ref),
  include: [],
})

// Dive 63 logged on the phone at 08:10 for 42 minutes to 32.7 m.
const draft = uploadDraftRequest.parse({
  ops: [
    {
      opId: "op-site",
      opVersion,
      deviceId: "device-phone",
      at: "2026-07-22T12:00:00.000Z",
      type: "upsertEntity",
      kind: "site",
      id: "site-reef",
      fields: { name: "Two Mile Reef", countryCode: "ZA" },
    },
    {
      opId: "op-dive",
      opVersion,
      deviceId: "device-phone",
      at: "2026-07-22T12:00:00.000Z",
      type: "upsertDive",
      diveId: "dive-63",
      fields: {
        startTime: "2026-07-22T08:10:00",
        siteId: "site-reef",
        duration: 2520,
        maxDepth: 32.7,
        notes: "Logged on the boat",
      },
    },
  ],
}).ops

// The log with ids made up by the import left out, in start order.
function data(db: Db) {
  const all = (sql: string) => db.prepare(sql).all()
  return {
    dives: all(
      `SELECT start_time, duration, max_depth, average_depth, min_temperature,
         max_temperature, nitrox, oxygen, notes, computer_model, number,
         surface_interval, cns, otu, sparkline, ascent_alarm_count
       FROM dives ORDER BY start_time`
    ),
    meta: all(
      `SELECT d.start_time, m.field, m.source, m.computer_value, m.dismissed
       FROM field_meta m JOIN dives d ON d.id = m.dive_id
       ORDER BY d.start_time, m.field`
    ),
    samples: all(
      `SELECT d.start_time, s.time, s.depth, s.temperature
       FROM samples s JOIN dives d ON d.id = s.dive_id
       ORDER BY d.start_time, s.time`
    ),
    fingerprints: all(
      `SELECT f.fingerprint, f.reason, d.start_time
       FROM fingerprints f LEFT JOIN dives d ON d.id = f.dive_id
       ORDER BY f.fingerprint`
    ),
  }
}

// Whole exports are imported here, which takes seconds under CI's coverage.
describe("a hand-logged dive matched by an import", { timeout: 20_000 }, () => {
  it("ends the same whether its draft arrived before or after the preview", () => {
    const before = testDb()
    applyDraft(before, draft, now)
    const preview = storePreview(before, d4iXml, now)
    expect(
      applyImport(before, preview.id, proposed(preview), now)
    ).toMatchObject({ status: "applied", paired: 1 })

    const after = testDb()
    const early = storePreview(after, d4iXml, now)
    expect(early.pairs).toEqual([])
    applyDraft(after, draft, now)
    // The review is asked again with the new dive on its day.
    expect(applyImport(after, early.id, proposed(early), now)).toEqual({
      status: "changed",
      diveIds: ["dive-63"],
    })
    const again = pendingPreview(after, now)!
    expect(applyImport(after, again.id, proposed(again), now)).toMatchObject({
      status: "applied",
      paired: 1,
    })

    expect(data(after)).toEqual(data(before))
  })
})

describe(
  "the SSI logbook's drafts, then the D4i export",
  { timeout: 20_000 },
  () => {
    it("pair with the dives the computer logged and keep their hand values", () => {
      // SSI's two test dives moved onto dives 62 and 63 of 22 July 2026,
      // to the minute, as SSI logs them.
      const onto = (row: typeof shore, n: number) => {
        const { startTime, duration, maxDepth, averageDepth } = fixture(n)
        return {
          ...row,
          datetime: startTime.slice(0, 16).replace("T", " "),
          divetime: String(Math.round(duration / 60)),
          depth_m: String(maxDepth),
          avg_depth_m: String(averageDepth),
        }
      }
      const { drafts } = convertSsi(
        csv([onto(shore, 62), onto(boat, 63)]),
        { ...extras, dives: {} },
        "2026-11-05T10:00:00.000Z"
      )
      const db = testDb()
      for (const { ops } of drafts) applyDraft(db, ops, now)
      const ssi = db
        .prepare("SELECT id, notes FROM dives ORDER BY start_time")
        .all() as { id: string; notes: string | null }[]

      const preview = storePreview(db, d4iXml, now)
      expect(preview.pairs.map((pair) => pair.diveId)).toEqual(
        ssi.map((dive) => dive.id)
      )
      const result = applyImport(db, preview.id, proposed(preview), now)
      expect(result).toMatchObject({ status: "applied", paired: 2 })

      for (const { id, notes } of ssi) {
        const dive = db
          .prepare(
            "SELECT min_temperature, max_temperature, notes, weight FROM dives WHERE id = ?"
          )
          .get(id)
        // SSI's 12 and 13 °C stay, with the computer's beside them.
        expect(dive).toEqual({
          min_temperature: 12,
          max_temperature: 13,
          notes,
          weight: 6,
        })
        expect(
          db
            .prepare(
              "SELECT field FROM field_meta WHERE dive_id = ? AND computer_value IS NOT NULL ORDER BY field"
            )
            .pluck()
            .all(id)
        ).toEqual(expect.arrayContaining(["maxTemperature", "minTemperature"]))
        expect(
          db
            .prepare("SELECT count(*) FROM samples WHERE dive_id = ?")
            .pluck()
            .get(id)
        ).toBeGreaterThan(0)
      }
    })
  }
)
