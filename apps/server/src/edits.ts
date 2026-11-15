import type {
  DiveSetKind,
  EntityKind,
  PatchDiveRequest,
  SetEntityDivesParsed,
} from "@shylog/core"

import { editDive } from "./apply/dive.ts"
import { setEntityDives } from "./apply/entity-dives.ts"
import {
  keepUnknownSite,
  putEntity,
  refuseUnknownSite,
} from "./apply/entity.ts"
import { mergeEntity } from "./apply/merge.ts"
import type { Db } from "./db/open.ts"
import type { Entry } from "./journal.ts"

export type Journal = (entry: Entry) => void

// The edits to synced data that the API and the MCP tools both make. Each
// applies one change with the routes' guards and journals it when anything
// changed, inside the caller's write, so a tool that adds a buddy and edits
// a dive commits both at one time, as replay groups them (see changeBy).

export function applyDiveEdit(
  db: Db,
  journal: Journal,
  diveId: string,
  request: PatchDiveRequest
) {
  if (!editDive(db, diveId, request)) return false
  journal({ type: "editDive", payload: { diveId, ...request } })
  return true
}

// The route's body is checked inside, as which schema applies depends on
// whether the entity exists.
export function applyEntityPut(
  db: Db,
  journal: Journal,
  kind: EntityKind,
  id: string,
  fields: unknown
) {
  refuseUnknownSite(db, kind, [id])
  if (!putEntity(db, kind, id, fields, keepUnknownSite(db, kind, id))) {
    return false
  }
  journal({ type: "putEntity", payload: { kind, id, fields } })
  return true
}

export function applyEntityMerge(
  db: Db,
  journal: Journal,
  kind: EntityKind,
  id: string,
  into: string
) {
  refuseUnknownSite(db, kind, [id, into])
  if (!mergeEntity(db, kind, id, into)) return false
  journal({ type: "mergeEntity", payload: { kind, id, into } })
  return true
}

export function applyEntityDives(
  db: Db,
  journal: Journal,
  kind: DiveSetKind,
  id: string,
  request: SetEntityDivesParsed
) {
  if (!setEntityDives(db, kind, id, request)) return false
  journal({ type: "setEntityDives", payload: { kind, id, ...request } })
  return true
}
