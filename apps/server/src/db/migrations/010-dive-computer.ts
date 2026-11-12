import type { Migration } from "../migrate.ts"

// The watch this instance downloads from: its serial, so another diver's
// watch is refused, and the newest dive applied from it, from which the
// next download reads. One row at most; Forget deletes it. Each dive also
// counts the Events rows its mandatory stops take, as it counts its alarms,
// so the profile card reserves them before the samples arrive.
export const diveComputer: Migration = {
  version: 10,
  name: "dive-computer",
  up(db) {
    db.exec(`
      CREATE TABLE dive_computer (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        serial TEXT NOT NULL,
        model TEXT NOT NULL,
        -- The newest applied dive's start on the watch's clock.
        marker TEXT CHECK (
          marker GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'
        ),
        last_download_at TEXT
      ) STRICT;
      ALTER TABLE dives ADD COLUMN mandatory_stop_events INTEGER NOT NULL DEFAULT 0 CHECK (mandatory_stop_events >= 0);
    `)
  },
}
