import { useSyncExternalStore } from "react"
import {
  importFile,
  type ImportApplyResult,
  type ImportPreview,
  type ImportSummary,
} from "@shylog/core"
import type { InferResponseType } from "hono/client"

import { apiClient } from "@/api/client"
import type { CompareKey } from "@/import/compare"
import { applyRequest, carryOver, type Overrides } from "@/import/review"

import { unreachable } from "./edits"
import { currentLog, sync } from "./log"
import { reasonIn } from "./upload"

type Pending = InferResponseType<
  ReturnType<typeof apiClient>["api"]["import"]["pending"]["$get"],
  200
>
export type LastImport = NonNullable<Pending["lastImport"]>

// The Import screens' state: the preview waiting for review, the last
// completed import, and the diver's choices in the review, which live on
// the phone until apply sends them (see review.ts).
interface ImportState {
  loaded: boolean
  preview: ImportPreview | null
  lastImport: LastImport | null
  overrides: Overrides
  // The values to take from the computer on every paired dive.
  adopt: CompareKey[]
}

let state: ImportState = {
  loaded: false,
  preview: null,
  lastImport: null,
  overrides: {},
  adopt: [],
}
const listeners = new Set<() => void>()

function set(next: ImportState) {
  const was = state
  state = next
  // Only a change is saved: a failed load before the first answer has no
  // preview yet, and must not wipe the choices a reload is meant to keep.
  if (
    next.preview !== was.preview ||
    next.overrides !== was.overrides ||
    next.adopt !== was.adopt
  )
    saveChoices()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const useImport = () => useSyncExternalStore(subscribe, () => state)
export const currentImport = () => state

// The choices survive a reload, for the preview revision they were made
// on; another phone's change to the preview starts them afresh.
const storageKey = "shylog-import-review"

function saveChoices() {
  try {
    if (!state.preview) sessionStorage.removeItem(storageKey)
    else
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          id: state.preview.id,
          revision: state.preview.revision,
          overrides: state.overrides,
          adopt: state.adopt,
        })
      )
  } catch {
    // Private browsing or storage turned off: the choices last the visit.
  }
}

function storedChoices(
  preview: ImportPreview | null
): Pick<ImportState, "overrides" | "adopt"> {
  const none = { overrides: {}, adopt: [] }
  if (!preview) return none
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as {
      id: string
      revision: number
      overrides: Overrides
      adopt?: CompareKey[]
    } | null
    return stored?.id === preview.id && stored.revision === preview.revision
      ? { overrides: stored.overrides, adopt: stored.adopt ?? [] }
      : none
  } catch {
    return none
  }
}

export const setOverrides = (overrides: Overrides) =>
  set({ ...state, overrides })

export const setAdopt = (adopt: CompareKey[]) => set({ ...state, adopt })

// A dive a pairing can still take: live, with no computer dive of its own.
// The log doesn't say which dives have a fingerprint, so a dive with a
// profile stands for one; the server refuses any it gets wrong.
export function pairable(diveId: string) {
  const dive = currentLog()?.dive.get(diveId)
  return !!dive && !dive.deletedAt && !dive.sparkline
}

// A request that never reached the server, or that it refused.
async function failure(res: Response | undefined) {
  if (!res) return new Error(unreachable)
  const body: unknown = await res.json().catch(() => undefined)
  return new Error(
    reasonIn(body) ??
      (res.status >= 500 ? unreachable : `Something went wrong (${res.status})`)
  )
}

const send = (request: () => Promise<Response>) =>
  request().catch(() => undefined)

// `GET /api/import/pending`, on opening the Import screens. A failure
// leaves what the phone last had and throws for the screen to say.
// `carry` gives the choices for a preview proposed again since, in the same
// update as the preview, so the review never draws a frame without them.
export async function loadPending(
  fetch?: typeof globalThis.fetch,
  carry?: (preview: ImportPreview) => Overrides
) {
  const asked = state.preview
  const res = await send(() => apiClient(fetch).api.import.pending.$get())
  if (!res?.ok) {
    set({ ...state, loaded: true })
    throw await failure(res)
  }
  const { preview, lastImport } = await res.json()
  // An upload, clock change, apply or discard answered meanwhile is newer
  // than this preview, so only the last import is taken from it.
  if (state.preview !== asked) {
    set({ ...state, loaded: true, lastImport })
    return
  }
  const was = state.preview
  // The values to take hold for the whole import, so a day proposed again
  // keeps them.
  const choices =
    preview && was && was.id === preview.id && was.revision === preview.revision
      ? { overrides: state.overrides, adopt: state.adopt }
      : preview && carry
        ? { overrides: carry(preview), adopt: state.adopt }
        : storedChoices(preview)
  set({ loaded: true, preview, lastImport, ...choices })
}

// `POST /api/import` with the chosen file. iOS gives a .uddf file no type,
// so it goes as a byte stream with its name, which the server accepts.
export async function uploadExport(file: File, fetch = globalThis.fetch) {
  const type = /^(application|text)\/xml$/.test(file.type)
    ? file.type
    : "application/octet-stream"
  const res = await send(() =>
    fetch("/api/import", {
      method: "POST",
      headers: {
        "X-Shylog": "1",
        "Content-Type": type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      },
      body: file,
    })
  )
  if (!res?.ok) throw await failure(res)
  const preview = (await res.json()) as ImportPreview
  set({ ...state, loaded: true, preview, overrides: {}, adopt: [] })
  return preview
}

// Clock changes still on their way, which apply waits for, so it never
// imports under a clock the diver has already moved.
let offsets: Promise<unknown> = Promise.resolve()

// `PATCH /api/import/:id`: one day's clock, or null for the estimate.
// That day is proposed again, so the choices made on it give way.
export function setDayOffset(
  date: string,
  offset: number | null,
  fetch?: typeof globalThis.fetch
) {
  const run = offsets.then(() => patchOffset(date, offset, fetch))
  offsets = run.catch(() => {})
  return run
}

async function patchOffset(
  date: string,
  offset: number | null,
  fetch?: typeof globalThis.fetch
) {
  const id = state.preview?.id
  // Discarded while an earlier clock change was on its way.
  if (!id) throw new Error("This import is no longer waiting")
  const res = await send(() =>
    apiClient(fetch).api.import[":id"].$patch({
      param: { id },
      json: { date, offset },
    })
  )
  if (!res?.ok) throw await failure(res)
  const preview = (await res.json()) as ImportPreview
  // A later answer may already have replaced the preview.
  if (state.preview?.id !== id) return
  set({
    ...state,
    preview,
    overrides: carryOver(preview, state.overrides, new Set([date]), pairable),
  })
}

// `DELETE /api/import/:id`, safe to repeat.
export async function discardPreview(fetch?: typeof globalThis.fetch) {
  const id = state.preview?.id
  if (!id) return
  const res = await send(() =>
    apiClient(fetch).api.import[":id"].$delete({ param: { id } })
  )
  if (!res?.ok) throw await failure(res)
  set({ ...state, preview: null, overrides: {}, adopt: [] })
}

export type ApplyOutcome =
  | { status: "applied"; summary: ImportSummary }
  | { status: "changed"; diveIds: string[] }

// The days whose clock or proposal differs between two previews, where
// the choices made on the first no longer hold.
function changedDays(was: ImportPreview, now: ImportPreview) {
  const proposal = (preview: ImportPreview, date: string) =>
    JSON.stringify([
      preview.days.find((day) => day.date === date)?.offset,
      preview.pairs
        .filter(({ computerDive }) => computerDive.day === date)
        .map(({ computerDive, diveId }) => `${computerDive.ref}:${diveId}`)
        .sort(),
      preview.unpaired
        .filter((hand) => hand.day === date)
        .map((hand) => hand.diveId)
        .sort(),
    ])
  return new Set(
    now.days
      .map((day) => day.date)
      .filter((date) => proposal(was, date) !== proposal(now, date))
  )
}

// `POST /api/import/:id/apply` with the review as it stands once any clock
// change has landed. Changed dives fetch the preview again, keeping the
// choices on days the server didn't propose again; a failed chunk throws
// with what was applied, and a retry carries on.
export async function applyReview(
  fetch?: typeof globalThis.fetch
): Promise<ApplyOutcome> {
  await offsets
  const preview = state.preview
  if (!preview) throw new Error("This import is no longer waiting")
  const request = applyRequest(preview, state.overrides, state.adopt)
  const res = await send(() =>
    apiClient(fetch).api.import[":id"].apply.$post({
      param: { id: preview.id },
      json: request,
    })
  )
  const body = (await res
    ?.clone()
    .json()
    .catch(() => undefined)) as ImportApplyResult | undefined
  if (!res || !body || !("status" in body)) {
    // Gone (another phone's upload replaced it), or a dive paired by hand
    // was since deleted or imported: the review shows what is there now.
    if (res?.status === 404 || res?.status === 409) {
      await loadPending(fetch).catch(() => {})
      if (state.preview)
        setOverrides(
          carryOver(state.preview, state.overrides, new Set(), pairable)
        )
    }
    throw await failure(res)
  }
  if (body.status === "failed") {
    // The applied dives now count as imported in the stored preview, and
    // are in the log.
    void sync()
    await loadPending(fetch).catch(() => {})
    throw new AppliedSome(body.error, body.applied)
  }
  // The log now holds the import; a sync under way may predate it.
  void sync().then(() => sync())
  if (body.status === "applied") {
    const { status, ...summary } = body
    void status
    // The summary screen shows this until the server's copy arrives, rather
    // than the import before it.
    const lastImport: LastImport = {
      at: new Date().toISOString(),
      file: importFile(preview),
      ...summary,
    }
    set({ ...state, preview: null, lastImport, overrides: {}, adopt: [] })
    void loadPending(fetch).catch(() => {})
    return { status: "applied", summary }
  }
  const before = state.overrides
  await loadPending(fetch, (next) => {
    // The days the reply names, and any whose proposal moved, as a reply
    // to choices made on an older proposal names none.
    const days = changedDays(preview, next)
    for (const hand of [
      ...next.pairs.map(({ computerDive, diveId }) => ({
        diveId,
        day: computerDive.day,
      })),
      ...next.unpaired,
      ...preview.pairs.map(({ computerDive, diveId }) => ({
        diveId,
        day: computerDive.day,
      })),
      ...preview.unpaired,
    ])
      if (body.diveIds.includes(hand.diveId)) days.add(hand.day)
    return carryOver(next, before, days, pairable)
  }).catch(() => {})
  return { status: "changed", diveIds: body.diveIds }
}

// A chunk failed: the ones before it stay, and Try again carries on.
export class AppliedSome extends Error {
  readonly applied: ImportSummary

  constructor(message: string, applied: ImportSummary) {
    super(message)
    this.applied = applied
  }
}
