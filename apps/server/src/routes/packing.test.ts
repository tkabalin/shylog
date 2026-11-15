import type { Packing } from "@shylog/core"
import { beforeEach, describe, expect, it } from "vitest"

import { apiHeaders, send, testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import type { Db } from "../db/open.ts"

let db: Db
let app: ReturnType<typeof testApp>
beforeEach(() => {
  db = testDb()
  app = testApp({ db })
})

const getPacking = async () =>
  (
    (await (await app.request("/api/log", { headers: apiHeaders })).json()) as {
      packing: Packing
    }
  ).packing
const put = (body: unknown) => send(app, "PUT", "/api/packing", body)
const journalled = () =>
  db.prepare("SELECT type FROM ops WHERE type = 'putPacking'").pluck().all()

const list: Packing = {
  sections: [
    {
      id: "section-boat",
      name: "Boat",
      items: [
        { id: "item-mask", name: "Mask" },
        { id: "item-seasick", name: "Seasickness tablets" },
      ],
    },
    { id: "section-empty", name: "Later", items: [] },
  ],
}

describe("the packing checklist", () => {
  it("starts from the default list, in its four sections, in the log", async () => {
    const { sections } = await getPacking()
    expect(sections.map((section) => section.name)).toEqual([
      "Hard gear",
      "Soft gear",
      "Accessories",
      "Personal",
    ])
    expect(sections.flatMap((section) => section.items)).toHaveLength(25)
    expect(sections[2].items).toEqual([
      { id: "item-smb", name: "SMB" },
      { id: "item-dive-light-charged", name: "Dive light (charged)" },
      { id: "item-cutting-tool", name: "Cutting tool" },
      { id: "item-defog", name: "Defog" },
    ])
  })

  it("replaces the whole list, journalled, and writes nothing when repeated", async () => {
    const res = await put(list)
    expect(res.status).toBe(200)
    const { version } = (await res.json()) as { version: string }
    expect(await getPacking()).toEqual(list)
    // The defaults' other items and sections went with their sections.
    expect(db.prepare("SELECT count(*) FROM packing_items").pluck().get()).toBe(
      2
    )
    const again = await put(list)
    expect(((await again.json()) as { version: string }).version).toBe(version)
    expect(journalled()).toHaveLength(1)
  })

  it("keeps an item's id when it moves to another section", async () => {
    await put(list)
    const moved: Packing = {
      sections: [
        { ...list.sections[0], items: [list.sections[0].items[1]] },
        { ...list.sections[1], items: [list.sections[0].items[0]] },
      ],
    }
    expect((await put(moved)).status).toBe(200)
    expect(await getPacking()).toEqual(moved)
  })

  it("validates with core's schema, leaving the list as it was", async () => {
    const before = await getPacking()
    for (const body of [
      {},
      { sections: [{ id: "section-a", name: "", items: [] }] },
      { sections: [{ id: "item-a", name: "A", items: [] }] },
      {
        sections: [
          { id: "section-a", name: "A", items: [{ id: "item-a", name: "A" }] },
          { id: "section-b", name: "B", items: [{ id: "item-a", name: "A" }] },
        ],
      },
    ]) {
      expect((await put(body)).status).toBe(400)
    }
    expect(await getPacking()).toEqual(before)
    expect(journalled()).toEqual([])
  })
})
