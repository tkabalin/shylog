import { today } from "@/dive/form/values"

import { queue as defaultQueue, type QueuedOp, type QueueDb } from "./drafts"

// The file Save waiting dives writes, a last resort if the phone's storage
// is at risk (see Offline safety in the spec). Each draft's request is the
// /api/ops body its upload would send, so it can be sent back as it is.
export interface WaitingDivesFile {
  format: "shylog-waiting-dives"
  version: 1
  savedAt: string
  deviceId: string | null
  drafts: {
    diveId: string
    loggedAt: string
    // The server's reason, for one it refused.
    rejected?: string
    request: { ops: QueuedOp[] }
  }[]
}

// Every draft, refused ones too, as they are only on this phone as well.
// Read in one transaction, so a draft and its ops are never from two edits.
export async function waitingDives(
  queue: QueueDb = defaultQueue,
  now = new Date()
): Promise<WaitingDivesFile> {
  return queue.transaction(
    "r",
    queue.drafts,
    queue.ops,
    queue.meta,
    async () => {
      const drafts = await queue.drafts.orderBy("createdAt").toArray()
      // Grouped by dive once, rather than searched for each draft.
      const ops = new Map<string, QueuedOp[]>()
      for (const row of await queue.ops.toArray())
        ops.set(row.diveId, [...(ops.get(row.diveId) ?? []), row.op])
      const device = await queue.meta.get("device")
      return {
        format: "shylog-waiting-dives",
        version: 1,
        savedAt: now.toISOString(),
        deviceId: device?.id ?? null,
        drafts: drafts.map((draft) => ({
          diveId: draft.id,
          loggedAt: draft.createdAt,
          ...(draft.rejected ? { rejected: draft.rejected } : {}),
          // Kept as the form gave them, as the upload sends them (see
          // drafts.ts).
          request: { ops: ops.get(draft.id) ?? [] },
        })),
      }
    }
  )
}

// Named with the phone's own day, as a diver would look for it.
export async function waitingDivesFile(
  queue: QueueDb = defaultQueue,
  now = new Date()
) {
  const content = await waitingDives(queue, now)
  return new File(
    [JSON.stringify(content, null, 2)],
    `shylog-waiting-dives-${today(now)}.json`,
    { type: "application/json" }
  )
}
