import type { Db } from "../db/open.ts"
import { recalculate } from "../derived.ts"
import { currentVersion, write, type Entry } from "../journal.ts"

// An edit to synced data: one journalled transaction followed by the derived
// pass, and one that changes nothing writes nothing. Edits no dive figure
// depends on, such as settings and cards, skip the pass, which reads samples.
export function change(
  db: Db,
  apply: (now: Date) => boolean,
  entry: Entry,
  derived = true
) {
  write(db, (journal, now) => {
    if (!apply(now)) return
    if (derived) recalculate(db)
    journal(entry)
  })
  return { version: currentVersion(db)! }
}
