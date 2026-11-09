import { uploadDraftRequest } from "@shylog/core"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  editDraft,
  QueueDb,
  rejectDraft,
  saveDraft,
  type DraftFields,
  type NewEntity,
} from "./drafts"
import { waitingDives, waitingDivesFile } from "./export-queue"

const queue = new QueueDb("export-queue-test")
// Only Date, as fake-indexeddb runs on the real timers.
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }))
afterEach(async () => {
  vi.useRealTimers()
  await queue.delete({ disableAutoOpen: false })
})

// A minute apart, so the order never falls back to the ids.
const at = (minute: number) =>
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 9, 8, minute)))

const fields = (overrides: Partial<DraftFields> = {}): DraftFields => ({
  startTime: "2026-11-08T09:00:00",
  siteId: "site-new",
  duration: 2700,
  maxDepth: 18.4,
  buddies: ["person-sam"],
  ...overrides,
})

const entities: NewEntity[] = [
  {
    kind: "site",
    id: "site-new",
    fields: {
      name: "Two-mile Reef",
      countryCode: "ZA",
      bodyOfWater: "oceanSea",
    },
  },
  { kind: "person", id: "person-sam", fields: { name: "Sam Naidoo" } },
]

async function threeDrafts() {
  at(0)
  await saveDraft("dive-first", fields(), entities, queue)
  at(1)
  await saveDraft(
    "dive-refused",
    fields({ startTime: "2026-11-08T14:00:00", siteId: "site-a", buddies: [] }),
    [],
    queue
  )
  const sent = await queue.ops
    .where("diveId")
    .equals("dive-refused")
    .primaryKeys()
  await rejectDraft("dive-refused", "The site was deleted", sent, queue)
  at(2)
  await saveDraft(
    "dive-edited",
    fields({ startTime: "2026-11-09T07:00:00", siteId: "site-a", buddies: [] }),
    [],
    queue
  )
  // Its ops are rewritten, so only the new ones are queued.
  at(3)
  await editDraft(
    "dive-edited",
    fields({
      startTime: "2026-11-09T07:00:00",
      siteId: "site-a",
      buddies: [],
      maxDepth: 21,
    }),
    [],
    queue
  )
}

it("holds every queued op, each draft's as a valid upload", async () => {
  await threeDrafts()
  const file = await waitingDives(queue)

  const queued = (await queue.ops.toArray()).map((row) => row.opId).sort()
  const written = file.drafts
    .flatMap((draft) => draft.request.ops.map((op) => op.opId))
    .sort()
  expect(written).toEqual(queued)
  expect(queued).toHaveLength(5)

  for (const draft of file.drafts) {
    // As the server parses an upload's body.
    expect(() => uploadDraftRequest.parse(draft.request)).not.toThrow()
    expect(
      draft.request.ops.every(
        (op) => op.type !== "upsertDive" || op.diveId === draft.diveId
      )
    ).toBe(true)
  }
})

it("lists the drafts oldest first, with a refused one's reason", async () => {
  await threeDrafts()
  const { drafts, deviceId, format, version } = await waitingDives(queue)
  expect({ format, version }).toEqual({
    format: "shylog-waiting-dives",
    version: 1,
  })
  expect(deviceId).toMatch(/^device-/)
  expect(drafts.map(({ diveId, rejected }) => ({ diveId, rejected }))).toEqual([
    { diveId: "dive-first", rejected: undefined },
    { diveId: "dive-refused", rejected: "The site was deleted" },
    { diveId: "dive-edited", rejected: undefined },
  ])
  // The edit's own values, not the first save's.
  const edited = drafts[2]!.request.ops.find((op) => op.type === "upsertDive")
  expect(edited).toMatchObject({ fields: { maxDepth: 21 } })
})

it("names the file with the phone's day, as JSON that reads back", async () => {
  await threeDrafts()
  const now = new Date(2026, 10, 9, 23, 30)
  const file = await waitingDivesFile(queue, now)
  expect(file.name).toBe("shylog-waiting-dives-2026-11-09.json")
  expect(file.type).toBe("application/json")
  expect(JSON.parse(await file.text())).toEqual(
    JSON.parse(JSON.stringify(await waitingDives(queue, now)))
  )
})

it("writes an empty list with no drafts", async () => {
  expect((await waitingDives(queue)).drafts).toEqual([])
})
