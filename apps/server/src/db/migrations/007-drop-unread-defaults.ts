import type { Migration } from "../migrate.ts"

// The new-dive defaults no longer hold a gas or a start pressure, readings
// nobody took: a new dive starts on air with its start pressure empty.
export const dropUnreadDefaults: Migration = {
  version: 7,
  name: "drop-unread-defaults",
  up(db) {
    db.exec(
      "UPDATE settings SET new_dive_defaults = json_remove(new_dive_defaults, '$.nitrox', '$.oxygen', '$.startPressure')"
    )
  },
}
