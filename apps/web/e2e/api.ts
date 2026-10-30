import { test as base, type APIRequestContext } from "@playwright/test"
import { opVersion } from "@shylog/core"

import type { Log } from "../src/api/client"

// Fixture dives by Subsurface's divenumber, as start times (see Conventions
// in docs/PLAN.md); Shylog numbers them differently.
export const fixtureStart = {
  54: "2026-07-18T08:39:26",
  61: "2026-07-21T07:47:42",
  63: "2026-07-22T08:12:19",
} as const

// What the app sends, plus the Origin a browser adds to a write. Requests go
// through the project's own Vite proxy, like the app's.
function headers() {
  return {
    "X-Shylog": "1",
    Origin: new URL(base.info().project.use.baseURL!).origin,
  }
}

// Undoes a test's change to the log once it ends, even after a timeout:
// fixture teardown gets its own time and a fresh request context.
export const test = base.extend<{
  restore: (undo: (request: APIRequestContext) => Promise<void>) => void
}>({
  restore: async ({ playwright, baseURL }, use) => {
    const undos: ((request: APIRequestContext) => Promise<void>)[] = []
    await use((undo) => void undos.push(undo))
    const request = await playwright.request.newContext({ baseURL })
    const failed: unknown[] = []
    for (const undo of undos.reverse()) {
      await undo(request).catch((error: unknown) => failed.push(error))
    }
    await request.dispose()
    if (failed.length)
      throw new AggregateError(failed, "Couldn't undo a test's change")
  },
})

export async function getLog(request: APIRequestContext): Promise<Log> {
  const res = await request.get("/api/log", { headers: headers() })
  if (!res.ok()) throw new Error(`GET /api/log: ${res.status()}`)
  return (await res.json()) as Log
}

export async function diveId(
  request: APIRequestContext,
  n: keyof typeof fixtureStart
) {
  const log = await getLog(request)
  return log.dives.find((dive) => dive.startTime === fixtureStart[n])!.id
}

export async function patchDive(
  request: APIRequestContext,
  id: string,
  fields: Record<string, unknown>
) {
  const res = await request.patch(`/api/dives/${id}`, {
    headers: headers(),
    data: { fields },
  })
  if (!res.ok()) throw new Error(`PATCH: ${res.status()} ${await res.text()}`)
}

// A dive that never reached the server is already gone, as an undo
// registered before its upload may find.
export async function deleteDive(request: APIRequestContext, id: string) {
  const res = await request.delete(`/api/dives/${id}`, {
    headers: headers(),
  })
  if (!res.ok() && res.status() !== 404)
    throw new Error(`DELETE: ${res.status()}`)
}

// Uploads a hand-logged dive as a draft would, so it has no samples.
export async function uploadDive(
  request: APIRequestContext,
  id: string,
  fields: Record<string, unknown>
) {
  const res = await request.post("/api/ops", {
    headers: headers(),
    data: {
      ops: [
        {
          opId: `op-${crypto.randomUUID()}`,
          opVersion,
          deviceId: "device-e2e",
          at: new Date().toISOString(),
          type: "upsertDive",
          diveId: id,
          fields,
        },
      ],
    },
  })
  if (!res.ok())
    throw new Error(`POST /api/ops: ${res.status()} ${await res.text()}`)
}

export async function putSettings(
  request: APIRequestContext,
  settings: Record<string, unknown>
) {
  const res = await request.put("/api/settings", {
    headers: headers(),
    data: settings,
  })
  if (!res.ok()) throw new Error(`PUT: ${res.status()} ${await res.text()}`)
}

export async function restoreDive(request: APIRequestContext, id: string) {
  const res = await request.post(`/api/dives/${id}/restore`, {
    headers: headers(),
  })
  if (!res.ok()) throw new Error(`Restore: ${res.status()}`)
}

export async function putEntity(
  request: APIRequestContext,
  kind: string,
  id: string,
  fields: Record<string, unknown>
) {
  const res = await request.put(`/api/entities/${kind}/${id}`, {
    headers: headers(),
    data: fields,
  })
  if (!res.ok()) throw new Error(`PUT: ${res.status()} ${await res.text()}`)
}

// Gone already, merged or deleted, is fine for an undo.
export async function deleteEntity(
  request: APIRequestContext,
  kind: string,
  id: string
) {
  const res = await request.delete(`/api/entities/${kind}/${id}`, {
    headers: headers(),
  })
  // A 409 also refuses one still in use, which must not pass as undone.
  const text = await res.text()
  if (
    !res.ok() &&
    res.status() !== 404 &&
    !(res.status() === 409 && /was (merged|deleted)/.test(text))
  )
    throw new Error(`DELETE: ${res.status()} ${text}`)
}

// A card with its pages, sent as the app sends one.
export async function putCard(
  request: APIRequestContext,
  id: string,
  name: string,
  images: Buffer[]
) {
  const form = new FormData()
  form.append("name", name)
  for (const image of images)
    form.append(
      "images",
      new Blob([new Uint8Array(image)], { type: "image/png" }),
      "card.png"
    )
  const res = await request.put(`/api/cards/${id}`, {
    headers: headers(),
    multipart: form,
  })
  if (!res.ok()) throw new Error(`PUT: ${res.status()} ${await res.text()}`)
}

// Deleting a card twice changes nothing, so an undo can always ask.
export async function deleteCard(request: APIRequestContext, id: string) {
  const res = await request.delete(`/api/cards/${id}`, { headers: headers() })
  if (!res.ok()) throw new Error(`DELETE: ${res.status()}`)
}
