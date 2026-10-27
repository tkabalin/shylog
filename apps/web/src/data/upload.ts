import { latestSchemaVersion, type UploadDraftRequest } from "@shylog/core"

import { apiClient } from "@/api/client"

import { db as defaultDb, type Blocked, type LogDb } from "./db"
import {
  draftOps,
  dropDraft,
  listDrafts,
  queue as defaultQueue,
  rejectDraft,
  type QueueDb,
} from "./drafts"
import { loadLog } from "./log"
import { syncLog } from "./sync"

// The reason a refused request carries (see onError in the server's app),
// or none for a body that isn't one, such as a proxy's error page.
export async function serverMessage(res: { json(): Promise<unknown> }) {
  const body = (await res.json().catch(() => undefined)) as
    { error?: unknown } | undefined
  return typeof body?.error === "string" ? body.error : undefined
}

// Sends the drafts one at a time, oldest first, each as one request (Flow
// steps 3 to 6 in the spec). A refused draft keeps the server's reason and
// the next one goes; a network failure or server error throws, leaving the
// queue as it is.
export async function uploadDrafts({
  db = defaultDb,
  queue = defaultQueue,
  fetch,
}: { db?: LogDb; queue?: QueueDb; fetch?: typeof globalThis.fetch } = {}) {
  // A server on a newer schema stops syncing, and the queue waits for the
  // app to update (see Client data in the spec).
  const blocked = (await db.meta.get("blocked")) as Blocked | undefined
  if (blocked && blocked.schemaVersion > latestSchemaVersion) return
  let changed = false
  try {
    for (const draft of await listDrafts(queue)) {
      // Not again until it is edited, which clears the reason.
      if (draft.rejected) continue
      // Read now, as an edit since the list was read rewrote them.
      const ops = await draftOps(draft.id, queue)
      if (!ops.length) continue
      const sent = ops.map((op) => op.opId)
      // The client types the body as the schema's output, but the server
      // parses it, so it is sent as the form gave it (see drafts.ts).
      const json = { ops } as unknown as UploadDraftRequest
      const res = await apiClient(fetch).api.ops.$post({ json })
      const status: number = res.status
      if (status === 200) {
        // The log first, so the dive never leaves the screen between the two.
        // One the copy still lacks (an app too old for the server's schema)
        // keeps its draft, which a resend finds already applied.
        await syncLog({ db, fetch })
        // A sync already under way may have written an older log first, so
        // one more fetch before keeping the draft.
        if (!(await db.dives.get(draft.id))) await syncLog({ db, fetch })
        if (await db.dives.get(draft.id)) await dropDraft(draft.id, sent, queue)
      } else if (status === 400 || status === 422) {
        const reason = await serverMessage(res)
        await rejectDraft(
          draft.id,
          reason ?? `The server refused this dive (${status})`,
          sent,
          queue
        )
      } else {
        throw new Error(`The upload failed: ${status}`)
      }
      changed = true
    }
  } finally {
    // Memory once for the run, even one a failure stopped part-way.
    if (changed) await loadLog(db, queue)
  }
}

let uploading: Promise<void> | undefined
let again = false

// Runs the queue, once at a time. A call while it runs makes it go round
// again, so a draft saved meanwhile doesn't wait for the next call. Retry
// on failure comes with the offline work; for now the next save tries.
export function upload() {
  if (uploading) {
    again = true
    return uploading
  }
  uploading = (async () => {
    try {
      do {
        again = false
        await uploadDrafts()
      } while (again)
    } catch (error) {
      // Expected offline, and the draft stays on screen, so not a warning.
      console.debug("Upload stopped", error)
    } finally {
      // In the same step as the last check of `again`, so a later call
      // starts a new run rather than joining one that has ended.
      uploading = undefined
    }
  })()
  return uploading
}

// For the form, right after it saves, edits or deletes a draft: memory
// shows the change before the form closes, then the queue uploads.
export async function draftChanged() {
  await loadLog()
  void upload()
}
