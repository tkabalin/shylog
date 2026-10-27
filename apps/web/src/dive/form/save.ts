import { entityCreateOrder, patchDiveRequest, type DiveId } from "@shylog/core"

import { apiClient } from "@/api/client"
import { editDraft, listDrafts, readDraft, saveDraft } from "@/data/drafts"
import { saveEdit, saveFailure, unreachable } from "@/data/edits"
import { draftChanged } from "@/data/upload"

import {
  changedFields,
  toFields,
  usedEntities,
  type FormValues,
  type NewEntity,
} from "./values"

const ordered = (entities: NewEntity[]) =>
  [...entities].sort(
    (a, b) =>
      entityCreateOrder.indexOf(a.kind) - entityCreateOrder.indexOf(b.kind)
  )

// The entities the dive uses that it must carry: its own new ones, and any
// it picked that another draft created, which the server may not have yet
// (an upsertEntity for an id it has already uses that entity as it is).
async function carried(diveId: string, values: FormValues, own: NewEntity[]) {
  const others = (await listDrafts())
    .filter((draft) => draft.id !== diveId)
    .flatMap((draft) => draft.entities)
    .filter((entity) => !own.some((mine) => mine.id === entity.id))
  return ordered(usedEntities(values, [...own, ...others]))
}

// A new dive is a draft on the phone, with the entities it creates, and
// uploads straight away (D13); it shows at once whether or not that works.
export async function saveNewDive(diveId: DiveId, values: FormValues) {
  // Saved already, by a visit the app was closed after or a Try again
  // after a later step failed: the same draft, rewritten.
  if (await readDraft(diveId)) return saveDraftEdit(diveId, values, values)
  await saveDraft(
    diveId,
    toFields(values).fields,
    await carried(diveId, values, values.created)
  )
  await draftChanged()
}

// Saving the form of a dive that is still a draft rewrites the draft. One
// that uploaded while the form was open is saved as an edit instead.
export async function saveDraftEdit(
  diveId: string,
  before: FormValues,
  values: FormValues
) {
  const draft = await readDraft(diveId)
  if (!draft) return saveSyncedEdit(diveId, before, values)
  const kept = draft.entities.filter(
    (entity) => !values.created.some((made) => made.id === entity.id)
  )
  await editDraft(
    diveId,
    toFields(values).fields,
    await carried(diveId, values, [...kept, ...values.created])
  )
  await draftChanged()
}

// An edit to a synced dive is plain API calls (see Edits to synced data):
// the entities its pickers created, then the dive's changed fields. Each
// is safe to repeat, so Try again simply sends them again.
export async function saveSyncedEdit(
  diveId: string,
  before: FormValues,
  values: FormValues
) {
  const client = apiClient()
  for (const entity of await carried(diveId, values, values.created)) {
    const res = await client.api.entities[":kind"][":id"]
      .$put({
        param: { kind: entity.kind, id: entity.id },
        json: entity.fields,
      })
      .catch(() => {
        throw new Error(unreachable)
      })
    if (!res.ok) throw await saveFailure(res)
  }
  const edit = {
    fields: changedFields(before, values),
    adopt: values.adopt,
    dismiss: values.dismiss,
  }
  const nothing =
    !Object.keys(edit.fields).length &&
    !edit.adopt.length &&
    !edit.dismiss.length
  if (nothing) return
  // The server checks it the same way; checking first keeps a mistake in
  // the form's own conversions from leaving the request half sent.
  await saveEdit(diveId, patchDiveRequest.parse(edit))
}
