import type { ComparedField } from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { Rejected } from "./rejected.ts"

export interface Meta {
  field: string
  source: "hand" | "computer"
  computerValue: string | number | null
  dismissed: number
}

export const metaOf = (db: Db, diveId: string) =>
  new Map(
    prepared<[string], Meta>(
      db,
      "SELECT field, source, computer_value AS computerValue, dismissed FROM field_meta WHERE dive_id = ?"
    )
      .all(diveId)
      .map((row) => [row.field, row])
  )

// SQLite has no booleans, and nitrox is a computer value on an import.
export const sqlValue = (value: unknown) =>
  typeof value === "boolean" ? Number(value) : value

const upsert = (
  db: Db,
  diveId: string,
  field: string,
  source: Meta["source"],
  computerValue: unknown,
  dismissed: number
) =>
  prepared(
    db,
    `INSERT INTO field_meta (dive_id, field, source, computer_value, dismissed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (dive_id, field) DO UPDATE SET source = excluded.source,
       computer_value = excluded.computer_value, dismissed = excluded.dismissed`
  ).run(diveId, field, source, sqlValue(computerValue), dismissed)

export const recordHand = (db: Db, diveId: string, field: string) =>
  upsert(db, diveId, field, "hand", null, 0)

// A hand edit, `after` undefined when cleared. The computer's value and a
// dismissal stay until adopted; a cleared computer value stays an empty hand
// value no import refills, and any other cleared field forgets its source so
// the samples fill average depth and temperatures again.
export function handEdit(
  db: Db,
  diveId: string,
  field: string,
  before: unknown,
  after: unknown,
  meta: Meta | undefined
) {
  if (meta?.source === "computer") {
    upsert(db, diveId, field, "hand", before, meta.dismissed)
  } else if (after !== undefined && !meta) {
    recordHand(db, diveId, field)
  } else if (after === undefined && meta && meta.computerValue == null) {
    prepared(db, "DELETE FROM field_meta WHERE dive_id = ? AND field = ?").run(
      diveId,
      field
    )
  }
}

export function computerValue(
  meta: Meta | undefined,
  path: PropertyKey[]
): string | number {
  if (meta?.computerValue == null) {
    throw new Rejected("There is no dive computer value for this", 422, path)
  }
  return meta.computerValue
}

export const adopted = (db: Db, diveId: string, field: ComparedField) =>
  upsert(db, diveId, field, "computer", null, 0)

// True when this changed anything.
export function dismiss(
  db: Db,
  diveId: string,
  field: ComparedField,
  meta: Meta | undefined
) {
  const value = computerValue(meta, ["dismiss"])
  if (meta!.dismissed) return false
  upsert(db, diveId, field, meta!.source, value, 1)
  return true
}
