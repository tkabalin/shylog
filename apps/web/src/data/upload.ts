import { useSyncExternalStore } from "react"
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
import { loadLog, noteReached, noteUnreachable, retryDelay } from "./log"
import { noteSynced } from "./last-sync"
import {
  answered,
  NoAnswer,
  reportError,
  RequestFailed,
  requestIdOf,
} from "./client-log"
import { syncLog } from "./sync"

// The reason a refused request carries (see onError in the server's app),
// or none for a body that isn't one, such as a proxy's error page.
export const reasonIn = (body: unknown) => {
  const error = (body as { error?: unknown } | undefined)?.error
  return typeof error === "string" ? error : undefined
}

export async function serverMessage(res: { json(): Promise<unknown> }) {
  return reasonIn(await res.json().catch(() => undefined))
}

// A request's response, or undefined when the server couldn't be reached.
export const send = (request: () => Promise<Response>) =>
  request().catch(() => undefined)

// The draft on its way to the server, and whether the server answered the
// last upload with an error, for the sync status. A store of its own, so an
// upload doesn't re-render every screen that reads the log.
let sending: string | undefined
let refusing = false
const listeners = new Set<() => void>()

function setSending(next: string | undefined) {
  sending = next
  for (const listener of listeners) listener()
}

function setRefusing(next: boolean) {
  if (refusing === next) return
  refusing = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const useSending = () => useSyncExternalStore(subscribe, () => sending)

export const useServerError = () =>
  useSyncExternalStore(subscribe, () => refusing)

// An upload the server answered with an error. It was reached, so this
// isn't Can't reach the server, whose quick retries would resend the draft
// every few seconds as each sync that gets through restarts them.
class ServerError extends RequestFailed {}

// Its own retries, backing off from 5 s to the five-minute check, which a
// sync that gets through doesn't reset.
let failures = 0
let retry: ReturnType<typeof setTimeout> | undefined

// Sends the drafts one at a time, oldest first, each as one request (Flow
// steps 3 to 6 in the spec). A refused draft keeps the server's reason and
// the next one goes; a network failure or server error throws, leaving the
// queue as it is. Says how the server answered: accepted when it took a
// draft, which fetches the log too, refused when it only refused, or false.
export async function uploadDrafts({
  db = defaultDb,
  queue = defaultQueue,
  fetch: given,
}: { db?: LogDb; queue?: QueueDb; fetch?: typeof globalThis.fetch } = {}) {
  const fetch = answered(given)
  // A server on a newer schema stops syncing, and the queue waits for the
  // app to update (see Client data in the spec).
  const blocked = (await db.meta.get("blocked")) as Blocked | undefined
  if (blocked && blocked.schemaVersion > latestSchemaVersion) return false
  let changed = false
  let accepted = false
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
      setSending(draft.id)
      const res = await apiClient(fetch).api.ops.$post({ json })
      const status: number = res.status
      if (status === 200) {
        // The log first, so the dive never leaves the screen between the two.
        // One the copy still lacks (an app too old for the server's schema)
        // keeps its draft, which a resend finds already applied.
        await syncLog({ db, fetch })
        accepted = true
        await noteSynced(db)
        // A sync already under way may have written an older log first, so
        // one more fetch before keeping the draft.
        if (!(await db.dives.get(draft.id))) await syncLog({ db, fetch })
        if (await db.dives.get(draft.id)) await dropDraft(draft.id, sent, queue)
      } else if (status === 400 || status === 422) {
        const reason = await serverMessage(res)
        // Without the reason, which can name a site or person; the server's
        // line for this request id has it. The id keeps each draft's report.
        void reportError(
          "rejected",
          new RequestFailed(
            `The server refused draft ${draft.id} (${status})`,
            requestIdOf(res)
          )
        )
        await rejectDraft(
          draft.id,
          reason ?? `The server refused this dive (${status})`,
          sent,
          queue
        )
      } else {
        throw new ServerError(`The upload failed: ${status}`, requestIdOf(res))
      }
      changed = true
    }
  } finally {
    setSending(undefined)
    // Memory once for the run, even one a failure stopped part-way.
    if (changed) await loadLog(db, queue)
  }
  return accepted ? "accepted" : changed ? "refused" : false
}

let uploading: Promise<void> | undefined
let again = false

// Runs the queue, once at a time. A call while it runs makes it go round
// again, so a draft saved meanwhile doesn't wait for the next call. No
// answer marks the server unreachable, which retries (see log.ts); a server
// error, or any other failure, retries here.
export function upload() {
  if (uploading) {
    again = true
    return uploading
  }
  uploading = (async () => {
    try {
      do {
        again = false
        const reply = await uploadDrafts()
        if (reply) noteReached(reply === "accepted")
      } while (again)
      // Every draft went, was refused, or is gone.
      failures = 0
      clearTimeout(retry)
      setRefusing(false)
    } catch (error) {
      // Expected offline or from the server, and the draft stays on screen,
      // so not a warning; a failure on the phone is.
      if (error instanceof NoAnswer || error instanceof ServerError)
        console.debug("Upload stopped", error)
      else console.warn("Upload failed", error)
      if (error instanceof NoAnswer) noteUnreachable()
      else {
        void reportError("sync", error)
        setRefusing(true)
        failures += 1
        clearTimeout(retry)
        retry = setTimeout(() => void upload(), retryDelay(failures))
      }
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
