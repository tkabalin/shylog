import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { listDrafts, queue, readDraft, saveDraft } from "@/data/drafts"
import { saveEdit } from "@/data/edits"
import { draftChanged } from "@/data/upload"

import { saveDraftEdit, saveNewDive, saveSyncedEdit } from "./save"
import { emptyValues, type FormValues, type NewEntity } from "./values"

vi.mock("@/data/upload", async (original) => ({
  ...(await original<typeof import("@/data/upload")>()),
  draftChanged: vi.fn(async () => {}),
}))
vi.mock("@/data/edits", async (original) => ({
  ...(await original<typeof import("@/data/edits")>()),
  saveEdit: vi.fn(async () => {}),
}))

// The entity PUTs a synced edit sends, answered with `status`.
let puts: string[]
function server(status = 200, body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      puts.push(`${init?.method} ${new URL(String(input)).pathname}`)
      return Response.json(body, { status })
    })
  )
}
beforeEach(() => {
  puts = []
  server()
  vi.mocked(saveEdit).mockClear()
  vi.mocked(draftChanged).mockClear()
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await queue.delete({ disableAutoOpen: false })
})

const values = (overrides: Partial<FormValues> = {}): FormValues => ({
  ...emptyValues("2026-10-20"),
  time: "09:00",
  siteId: "site-a",
  duration: "45",
  maxDepth: "18.4",
  ...overrides,
})

const region: NewEntity = {
  kind: "region",
  id: "region-new",
  fields: { name: "Aliwal Shoal", countryCode: "ZA" },
}
const site: NewEntity = {
  kind: "site",
  id: "site-new",
  fields: {
    name: "North Plateau",
    countryCode: "ZA",
    regionId: "region-new",
  },
}
const sam: NewEntity = {
  kind: "person",
  id: "person-new",
  fields: { name: "Sam Naidoo" },
}

const kept = async (id: `dive-${string}`) =>
  (await readDraft(id))?.entities.map((entity) => entity.id)

describe("saveNewDive", () => {
  it("carries its own new entities and those another draft made, regions first", async () => {
    await saveDraft(
      "dive-other",
      {
        startTime: "2026-10-19T09:00:00",
        siteId: "site-a",
        duration: 2700,
        maxDepth: 12,
      },
      [sam],
      queue
    )
    await saveNewDive(
      "dive-new",
      values({
        siteId: "site-new",
        buddies: ["person-new"],
        created: [site, region],
      })
    )
    expect(await kept("dive-new")).toEqual([
      "region-new",
      "site-new",
      "person-new",
    ])
    expect(draftChanged).toHaveBeenCalledOnce()
  })

  it("leaves out a new entity the form no longer uses", async () => {
    await saveNewDive("dive-new", values({ buddies: [], created: [sam] }))
    expect(await kept("dive-new")).toEqual([])
  })

  it("rewrites the draft a closed visit already saved", async () => {
    await saveNewDive("dive-new", values())
    await saveNewDive("dive-new", values({ maxDepth: "21" }))
    expect(await listDrafts(queue)).toHaveLength(1)
    expect((await readDraft("dive-new"))?.fields.maxDepth).toBe(21)
  })
})

describe("saveDraftEdit", () => {
  it("keeps the entities the draft made that it still uses", async () => {
    await saveNewDive(
      "dive-new",
      values({ siteId: "site-new", created: [site, region] })
    )
    const opened = values({ siteId: "site-new" })
    await saveDraftEdit(
      "dive-new",
      opened,
      values({ siteId: "site-new", buddies: ["person-new"], created: [sam] })
    )
    expect(await kept("dive-new")).toEqual([
      "region-new",
      "site-new",
      "person-new",
    ])
  })

  it("drops a site the edit replaced", async () => {
    await saveNewDive(
      "dive-new",
      values({ siteId: "site-new", created: [site, region] })
    )
    await saveDraftEdit("dive-new", values({ siteId: "site-new" }), values())
    expect(await kept("dive-new")).toEqual([])
  })

  it("saves as an edit, with only what changed, once the draft has uploaded", async () => {
    const opened = values()
    await saveDraftEdit(
      "dive-new",
      opened,
      values({ notes: "Turtle", buddies: ["person-new"], created: [sam] })
    )
    expect(puts).toEqual(["PUT /api/entities/person/person-new"])
    expect(saveEdit).toHaveBeenCalledWith("dive-new", {
      fields: { notes: "Turtle", buddies: ["person-new"] },
      adopt: [],
      dismiss: [],
    })
    expect(await readDraft("dive-new")).toBeUndefined()
  })
})

describe("saveSyncedEdit", () => {
  it("sends nothing when nothing changed", async () => {
    await saveSyncedEdit("dive-a", values(), values())
    expect(puts).toEqual([])
    expect(saveEdit).not.toHaveBeenCalled()
  })

  it("stops before the dive when the server refuses a new entity", async () => {
    server(400, { error: "Name is required" })
    await expect(
      saveSyncedEdit(
        "dive-a",
        values(),
        values({ buddies: ["person-new"], created: [sam] })
      )
    ).rejects.toThrow("Name is required")
    expect(saveEdit).not.toHaveBeenCalled()
  })
})
