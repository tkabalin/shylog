import { underwater, type Sample } from "@shylog/core"

import type { Migration } from "../migrate.ts"

// SAC's time under water and mean depth from the samples (D27), stored like
// the sparkline so the phone needs no samples. Filled for dives that
// already have samples.
export const sampleFigures: Migration = {
  version: 3,
  name: "sample-figures",
  up(db) {
    db.exec(`
      ALTER TABLE dives ADD COLUMN sample_duration INTEGER CHECK (sample_duration > 0);
      ALTER TABLE dives ADD COLUMN sample_average_depth REAL CHECK (sample_average_depth >= 0);
    `)
    const samples = db.prepare<[string], Sample>(
      "SELECT time, depth, temperature, pressure FROM samples WHERE dive_id = ? ORDER BY time"
    )
    const update = db.prepare(
      "UPDATE dives SET sample_duration = ?, sample_average_depth = ? WHERE id = ?"
    )
    const ids = db
      .prepare("SELECT DISTINCT dive_id FROM samples")
      .pluck()
      .all() as string[]
    for (const id of ids) {
      const figures = underwater(samples.all(id))
      update.run(figures?.duration ?? null, figures?.averageDepth ?? null, id)
    }
  },
}
