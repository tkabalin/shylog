import type { Migration } from "../migrate.ts"

// Each dive's safety stop, found in its samples and stored like the
// sparkline, so the profile card can reserve its row before the samples
// arrive. Migration 9 fills them, as the rule changed after this shipped.
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
  },
}
