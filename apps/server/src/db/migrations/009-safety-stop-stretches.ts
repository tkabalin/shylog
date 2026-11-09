import { safetyStop, type Sample } from "@shylog/core"

import type { Migration } from "../migrate.ts"

// The stop is now the stretch of the final ascent spent in its band, with
// short drifts out of it bridged, so every dive's stop is found again. The
// band's depths are still being fitted, so the mean depth is only held to
// 10 m, above which the stop's window always is.
export const safetyStopStretches: Migration = {
  version: 9,
  name: "safety-stop-stretches",
  up(db) {
    db.exec(`
      ALTER TABLE dives DROP COLUMN safety_stop_depth;
      ALTER TABLE dives ADD COLUMN safety_stop_depth INTEGER CHECK (safety_stop_depth BETWEEN 0 AND 10000);
    `)
    const samples = db.prepare<[string], Sample>(
      "SELECT time, depth, temperature, pressure FROM samples WHERE dive_id = ? ORDER BY time"
    )
    const update = db.prepare(
      "UPDATE dives SET safety_stop_start = ?, safety_stop_end = ?, safety_stop_held = ?, safety_stop_depth = ? WHERE id = ?"
    )
    const ids = db
      .prepare("SELECT DISTINCT dive_id FROM samples")
      .pluck()
      .all() as string[]
    for (const id of ids) {
      const stop = safetyStop(samples.all(id))
      update.run(stop?.start, stop?.end, stop?.held, stop?.depth, id)
    }
  },
}
