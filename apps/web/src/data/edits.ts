import type { PatchDiveRequest } from "@shylog/core"

import { apiClient } from "@/api/client"

import { currentLog, sync } from "./log"
import { reasonIn } from "./upload"

export const unreachable = "Couldn’t reach Shylog. Check your connection."

// A request the server refused, with what else it said, such as the entity
// a rename collides with.
export class Refused extends Error {
  readonly details: Record<string, unknown>

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.details = details
  }
}

// The message for a refused request. Tailscale Serve, or Vite's proxy,
// answers for a server that is down.
export async function saveFailure(res: {
  status: number
  json(): Promise<unknown>
}) {
  const body = (await res.json().catch(() => undefined)) as
    Record<string, unknown> | undefined
  const message =
    reasonIn(body) ??
    (res.status >= 500 ? unreachable : `Couldn’t save (${res.status})`)
  return new Refused(message, body ?? {})
}

// One change to synced data, never queued: a failure throws the screen's
// message. Resolves once the log holds it, or with `settle: false` once the
// server does, for a screen that leaves before the sync empties it.
export async function commit(
  request: Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>,
  { settle = true }: { settle?: boolean } = {}
) {
  const res = await request.catch(() => {
    throw new Error(unreachable)
  })
  if (!res.ok) throw await saveFailure(res)
  const { version } = (await res.json()) as { version: string }
  const synced = (async () => {
    await sync()
    // A sync already under way may have fetched the log before the change.
    if (currentLog()?.version !== version) await sync()
  })()
  if (settle) await synced
}

// `PATCH /api/dives/:id` with only what changed.
export const saveEdit = (
  diveId: string,
  edit: PatchDiveRequest,
  fetch?: typeof globalThis.fetch
) =>
  commit(
    apiClient(fetch).api.dives[":id"].$patch({
      param: { id: diveId },
      json: edit,
    })
  )

// Into Recently deleted and back. Both are safe to repeat.
export const deleteDive = (
  diveId: string,
  fetch?: typeof globalThis.fetch,
  options?: { settle?: boolean }
) =>
  commit(
    apiClient(fetch).api.dives[":id"].$delete({ param: { id: diveId } }),
    options
  )

export const restoreDive = (diveId: string, fetch?: typeof globalThis.fetch) =>
  commit(
    apiClient(fetch).api.dives[":id"].restore.$post({ param: { id: diveId } })
  )
