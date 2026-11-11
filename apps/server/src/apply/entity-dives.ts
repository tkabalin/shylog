import type {
  DiveFields,
  DiveRole,
  DiveSetKind,
  SetEntityDivesParsed,
} from "@shylog/core"

import type { Db } from "../db/open.ts"
import { editDiveFrom, type Fields } from "./dive.ts"
import {
  deletedAlong,
  deleteEntity,
  existing,
  inUse,
  nouns,
  putEntity,
  resolve,
} from "./entity.ts"
import { Rejected } from "./rejected.ts"

// One dive to put on the entity, in a role for a person, or to take off,
// with where it was named in the request.
type Edit = { diveId: string; at: ["add" | "remove", number] } & (
  { add: true; role?: DiveRole } | { add: false }
)

const roleFields = {
  buddy: "buddies",
  professional: "diveProfessionals",
} as const satisfies Record<DiveRole, keyof DiveFields>

// The change to one dive's fields. A trip or dive centre replaces the
// dive's own; a person joins in their role and leaves the other one, so an
// add can also switch a role. Taking off an entity the dive isn't on
// changes nothing.
function patchFor(kind: DiveSetKind, id: string, fields: Fields, edit: Edit) {
  if (kind !== "person") {
    const field = kind === "trip" ? "tripId" : "diveCentreId"
    if (edit.add) return { [field]: id }
    return fields[field] === id ? { [field]: null } : {}
  }
  const people = (field: (typeof roleFields)[DiveRole]) =>
    (fields[field] as string[] | undefined) ?? []
  const patch = {
    buddies: people("buddies").filter((person) => person !== id),
    diveProfessionals: people("diveProfessionals").filter(
      (person) => person !== id
    ),
  }
  if (edit.add && edit.role) {
    const field = roleFields[edit.role]
    // Kept in its place when already there, so a resend changes nothing.
    patch[field] = people(field).includes(id)
      ? people(field)
      : [...patch[field], id]
  }
  return patch
}

// `POST /api/entities/:kind/:id/dives`: creates the entity when the request
// carries its fields, then edits each dive as a hand edit would, all inside
// the caller's transaction, so a refused dive leaves nothing half done.
// True when anything changed, so a resend writes nothing.
export function setEntityDives(
  db: Db,
  kind: DiveSetKind,
  id: string,
  { create, add, remove, deleteIfEmpty }: SetEntityDivesParsed
): boolean {
  // A resend after this request deleted it: its dives were already taken
  // off, so there is nothing left to do.
  if (
    !create &&
    !add.length &&
    resolve(db, kind, id) == null &&
    deletedAlong(db, kind, id)
  ) {
    return false
  }
  let changed = create ? putEntity(db, kind, id, create) : false
  const target = existing(db, kind, id, [])
  // Dives added under a merged-away id land on the survivor, as a draft's
  // would. Taking dives off, or deleting, would act on one the diver never
  // saw, so that waits for the screen to catch up.
  if (target !== id && (remove.length || deleteIfEmpty)) {
    throw new Rejected(`This ${nouns[kind]} was merged into another`, 409)
  }
  const edits: Edit[] = [
    ...add.map((item, i): Edit =>
      typeof item === "string"
        ? { diveId: item, at: ["add", i], add: true }
        : { diveId: item.diveId, at: ["add", i], add: true, role: item.role }
    ),
    ...remove.map((diveId, i): Edit => ({
      diveId,
      at: ["remove", i],
      add: false,
    })),
  ]
  for (const edit of edits) {
    try {
      const edited = editDiveFrom(db, edit.diveId, (dive) =>
        // A dive put in Recently deleted since the picker loaded keeps its
        // links, as any dive there does; deleting a trip unlinks it anyway.
        !edit.add && dive.deleted
          ? null
          : { fields: patchFor(kind, target, dive.fields, edit) }
      )
      if (edited) changed = true
    } catch (failure) {
      // Named, so the picker can say which of many dives was refused.
      if (!(failure instanceof Rejected)) throw failure
      throw new Rejected(
        failure.message,
        failure.status,
        edit.at,
        { ...failure.details, diveId: edit.diveId },
        failure.logged
      )
    }
  }
  if (deleteIfEmpty && !inUse(db, kind, target)) {
    changed = deleteEntity(db, kind, target) || changed
  }
  return changed
}
