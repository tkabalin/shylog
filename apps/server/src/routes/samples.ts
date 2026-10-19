import { factory } from "../factory.ts"
import { selectSamples } from "../profile.ts"

export const samples = factory.createApp().get("/dives/:id/samples", (c) => {
  const { db } = c.var.deps
  const id = c.req.param("id")
  if (!db.prepare("SELECT 1 FROM dives WHERE id = ?").get(id)) {
    return c.json({ error: "No such dive" }, 404)
  }
  const rows = selectSamples(db).all(id)
  // The D4i records temperature only when it changes, so each value is
  // carried forward to the samples after it.
  let temperature: number | null = null
  for (const row of rows) {
    temperature = row.temperature ??= temperature
  }
  const events = db
    .prepare(
      "SELECT type, start_seconds AS start, end_seconds AS end FROM events WHERE dive_id = ? ORDER BY start_seconds, id"
    )
    .all(id) as { type: string; start: number; end: number | null }[]
  return c.json({ samples: rows, events })
})
