import type { Migration } from "../migrate.ts"

// The new-dive default for how visibility is entered is gone: new dives
// start in metres. The column's default still names it, which only the
// first migration's insert ever used.
export const dropVisibilityMode: Migration = {
  version: 4,
  name: "drop-visibility-mode",
  up(db) {
    db.exec(
      "UPDATE settings SET new_dive_defaults = json_remove(new_dive_defaults, '$.visibilityMode')"
    )
  },
}
