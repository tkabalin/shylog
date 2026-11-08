import { safetyStop, type Sample } from "@shylog/core"

import type { Migration } from "../migrate.ts"

// Each dive's safety stop, found in its samples and stored like the
// sparkline, so the profile card can reserve its row before the samples
// arrive. Filled for dives that already have samples.
export const safetyStopColumns: Migration = {
  version: 8,
  name: "safety-stop",
  up(db) {
    db.exec(`
      ALTER TABLE dives ADD COLUMN safety_stop_start INTEGER CHECK (safety_stop_start >= 0);
      ALTER TABLE dives ADD COLUMN safety_stop_end INTEGER CHECK (safety_stop_end >= safety_stop_start);
      ALTER TABLE dives ADD COLUMN safety_stop_held INTEGER CHECK (safety_stop_held >= 60);
      ALTER TABLE dives ADD COLUMN safety_stop_depth INTEGER CHECK (safety_stop_depth BETWEEN 3000 AND 6000);
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
      if (stop) update.run(stop.start, stop.end, stop.held, stop.depth, id)
    }
  },
}
