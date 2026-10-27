import type { PatchDiveRequest } from "@shylog/core"

import { apiClient } from "@/api/client"

import { currentLog, sync } from "./log"
import { serverMessage } from "./upload"

export const unreachable = "Couldn't reach Shylog. Check your connection."

// The message for a refused request. Tailscale Serve, or Vite's proxy,
// answers for a server that is down.
export async function saveFailure(res: {
  status: number
  json(): Promise<unknown>
}) {
  return new Error(
    (await serverMessage(res)) ??
      (res.status >= 500 ? unreachable : `Couldn't save (${res.status})`)
  )
}

// `PATCH /api/dives/:id` with only what changed (see Edits to synced data).
// Nothing is queued: a failure throws the message for the form, which keeps
// its values and offers Try again.
export async function saveEdit(
  diveId: string,
  edit: PatchDiveRequest,
  fetch?: typeof globalThis.fetch
) {
  const res = await apiClient(fetch)
    .api.dives[":id"].$patch({ param: { id: diveId }, json: edit })
    .catch(() => {
      throw new Error(unreachable)
    })
  if (!res.ok) throw await saveFailure(res)
  const { version } = await res.json()
  await sync()
  // A sync already under way may have fetched the log before the edit.
  if (currentLog()?.version !== version) await sync()
}
