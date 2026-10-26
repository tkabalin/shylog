import { sampleIdsSchema } from "@shylog/core"
import { validator } from "hono/validator"

import { diveExists } from "../apply/dive.ts"
import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { factory } from "../factory.ts"
import { selectSamples } from "../profile.ts"
import type { ProfileEvent } from "../uddf/sample-reader.ts"
import { parse } from "../validate.ts"

// A dive's samples and events as the chart reads them.
function readProfile(db: Db, id: string) {
  const rows = selectSamples(db).all(id)
  // The D4i records temperature only when it changes, so each value is
  // carried forward to the samples after it.
  let temperature: number | null = null
  for (const row of rows) {
    temperature = row.temperature ??= temperature
  }
  const events = prepared<[string], ProfileEvent>(
    db,
    "SELECT type, start_seconds AS start, end_seconds AS end FROM events WHERE dive_id = ? ORDER BY start_seconds, id"
  ).all(id)
  return { samples: rows, events }
}

// `?ids=a,b,c`: dive ids, each checkable by its prefix, without repeats.
const batch = validator("query", (value: Record<string, string | string[]>) => {
  const ids = [
    ...new Set(
      String(value.ids ?? "")
        .split(",")
        .filter(Boolean)
    ),
  ]
  return {
    ids: parse(sampleIdsSchema, ids),
  }
})

export const samples = factory
  .createApp()
  .get("/dives/:id/samples", (c) => {
    const { db } = c.var.deps
    const id = c.req.param("id")
    if (!diveExists(db, id)) {
      return c.json({ error: "No such dive" }, 404)
    }
    return c.json(readProfile(db, id))
  })
  // The phone's background download after a sync: every dive asked for
  // that has samples, read in one transaction so they match one version.
  // Dives with none, or no longer there, are left out.
  .get("/samples", batch, (c) => {
    const { db } = c.var.deps
    const { ids } = c.req.valid("query")
    const profiles = db.transaction(() => {
      const found: Record<string, ReturnType<typeof readProfile>> = {}
      for (const id of ids) {
        const profile = readProfile(db, id)
        if (profile.samples.length) found[id] = profile
      }
      return found
    })()
    return c.json({ profiles })
  })
