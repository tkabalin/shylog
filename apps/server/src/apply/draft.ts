import { opVersion, type EntityKind, type Op } from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { recalculate } from "../derived.ts"
import { write } from "../journal.ts"
import { createDive, editDive } from "./dive.ts"
import { applyEntityOp, type EntityOp } from "./entity.ts"
import { Rejected } from "./rejected.ts"

type DiveOp = Extract<Op, { type: "upsertDive" }>

// Regions first, as a draft's new site or dive centre may sit in one.
const kindOrder: EntityKind[] = [
  "region",
  "site",
  "diveCentre",
  "person",
  "trip",
]

function check(op: Op, now: Date) {
  // Installed copies running the previous version can still upload.
  if (op.opVersion !== opVersion && op.opVersion !== opVersion - 1) {
    throw new Rejected(
      `This draft was saved by an app version the server doesn't support (op version ${op.opVersion})`
    )
  }
  const limit = new Date(now)
  limit.setUTCFullYear(limit.getUTCFullYear() - 2)
  if (Date.parse(op.at) < limit.getTime()) {
    throw new Rejected("This draft is more than two years old")
  }
}

// Applies one offline draft whole or not at all (see Flow in the spec). Op
// ids already in the journal are skipped, so a resend after a lost reply
// changes nothing; a rejection records none, so a fixed draft can resend.
export function applyDraft(
  db: Db,
  ops: Op[],
  now = new Date()
): "applied" | "alreadyApplied" {
  return write(db, (journal) => {
    const fresh = ops.filter(
      (op) => !prepared(db, "SELECT 1 FROM ops WHERE op_id = ?").get(op.opId)
    )
    if (!fresh.length) return "alreadyApplied"
    for (const op of fresh) check(op, now)

    const entities = fresh
      .filter((op): op is EntityOp => op.type === "upsertEntity")
      .sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind))
    for (const op of entities) applyEntityOp(db, op, journal)

    for (const op of fresh) {
      if (op.type !== "upsertDive") continue
      applyDiveOp(db, op)
      journal({ type: op.type, payload: op, opId: op.opId })
    }
    recalculate(db)
    return "applied"
  })
}

export function applyDiveOp(db: Db, op: DiveOp) {
  // Its first reply was lost and the draft was edited offline since, so
  // the new fields are an edit; anything it leaves out is kept.
  const known = prepared<[string], { deletedAt: string | null }>(
    db,
    "SELECT deleted_at AS deletedAt FROM dives WHERE id = ?"
  ).get(op.diveId)
  // A 422 like every other rejection, so the reason reaches the card.
  if (known?.deletedAt != null) {
    throw new Rejected("This dive is in Recently deleted")
  }
  if (known) editDive(db, op.diveId, { fields: op.fields })
  else createDive(db, op.diveId, op.fields)
}
