import type { Db } from "../db/open.ts"
import { recalculate } from "../derived.ts"
import type { Journal } from "../edits.ts"
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
  return changeBy(
    db,
    (journal, now) => {
      if (!apply(now)) return false
      journal(entry)
      return true
    },
    derived
  )
}

// The same for steps that journal themselves (see edits.ts), so several
// share one transaction, one version and one derived pass.
export function changeBy(
  db: Db,
  steps: (journal: Journal, now: Date) => boolean,
  derived = true
) {
  write(db, (journal, now) => {
    if (steps(journal, now) && derived) recalculate(db)
  })
  return { version: currentVersion(db)! }
}
