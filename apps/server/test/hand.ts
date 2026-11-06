import { opVersion, uploadDraftRequest, type DiveFields } from "@shylog/core"

import { applyDraft } from "../src/apply/draft.ts"
import type { Db } from "../src/db/open.ts"

export type Logged = Pick<
  DiveFields,
  "startTime" | "duration" | "maxDepth" | "averageDepth"
> & { id: `dive-${string}` }

let count = 0

// Dives logged by hand on the phone and uploaded as drafts, at one site, so
// the import has something to pair with.
export function logByHand(db: Db, dives: Logged[]) {
  const base = () => ({
    opId: `op-hand-${++count}`,
    opVersion,
    deviceId: "device-phone",
    at: new Date().toISOString(),
  })
  const site = {
    ...base(),
    type: "upsertEntity",
    kind: "site",
    id: "site-reef",
    fields: { name: "Two Mile Reef", countryCode: "ZA" },
  }
  // One draft per dive, parsed as the route does, which fills the defaults.
  for (const { id, ...fields } of dives) {
    const dive = {
      ...base(),
      type: "upsertDive",
      diveId: id,
      fields: { ...fields, siteId: "site-reef" },
    }
    applyDraft(db, uploadDraftRequest.parse({ ops: [site, dive] }).ops)
  }
}
