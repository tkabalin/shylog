import { importPreviewSchema } from "@shylog/core"
import { describe, expect, it } from "vitest"

import { apiHeaders, origin, send, testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import { logByHand } from "../../test/hand.ts"
import { d4iXml, syntheticXml } from "../../test/uddf-fixtures.ts"
import { currentVersion } from "../journal.ts"

const abroad = syntheticXml("abroad.uddf")

function setup() {
  const db = testDb()
  logByHand(db, [
    {
      id: "dive-63",
      startTime: "2026-07-22T08:10:00",
      duration: 2520,
      maxDepth: 32.7,
    },
  ])
  return { db, app: testApp({ db }) }
}

const upload = (
  app: ReturnType<typeof testApp>,
  body: string,
  headers: Record<string, string> = { "Content-Type": "application/xml" }
) =>
  app.request("/api/import", {
    method: "POST",
    headers: { ...apiHeaders, Origin: origin, ...headers },
    body,
  })

describe("POST /api/import", () => {
  it("returns the preview in core's schema and writes nothing to the log", async () => {
    const { db, app } = setup()
    const before = {
      version: currentVersion(db),
      dives: db.prepare("SELECT count(*) FROM dives").pluck().get(),
    }
    const res = await upload(app, abroad)
    expect(res.status).toBe(200)
    const preview = importPreviewSchema.parse(await res.json())
    expect(preview.computerModel).toBe("Suunto D4i")
    expect(preview.pairs.map((pair) => pair.diveId)).toEqual(["dive-63"])
    expect(preview.newDives).toHaveLength(15)
    expect(currentVersion(db)).toBe(before.version)
    expect(db.prepare("SELECT count(*) FROM dives").pluck().get()).toBe(
      before.dives
    )
  })

  it.each(["application/xml", "text/xml; charset=utf-8"])(
    "takes %s",
    async (type) => {
      const { app } = setup()
      expect((await upload(app, abroad, { "Content-Type": type })).status).toBe(
        200
      )
    }
  )

  it.each([
    'attachment; filename="Subsurface export.UDDF"',
    "attachment; filename=dives.xml",
    "attachment; filename*=UTF-8''Duik%20log.uddf",
    "attachment; filename=\"Duik log\"; filename*=UTF-8''Duik%20log.uddf",
  ])("takes a byte stream named as an export: %s", async (disposition) => {
    const { app } = setup()
    const res = await upload(app, abroad, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": disposition,
    })
    expect(res.status).toBe(200)
  })

  it("refuses a byte stream with another name, or none", async () => {
    const { app } = setup()
    for (const disposition of [
      'attachment; filename="dives.csv"',
      "attachment; filename*=UTF-8''dives%E0.uddf",
      undefined,
    ]) {
      const res = await upload(app, abroad, {
        "Content-Type": "application/octet-stream",
        ...(disposition ? { "Content-Disposition": disposition } : {}),
      })
      expect(res.status).toBe(415)
      expect(await res.json()).toMatchObject({
        error: "Choose a .uddf or .xml file",
      })
    }
  })

  it("reads a file in the encoding it declares, or by its byte order mark", async () => {
    const { db, app } = setup()
    const withNote = abroad.replace("<notes>", "<notes><para>Rëef</para>")
    const stored = () =>
      db.prepare("SELECT uddf FROM import_previews").pluck().get() as string
    const latin1 = withNote.replace('encoding="utf-8"', 'encoding="ISO-8859-1"')
    const send = (bytes: Uint8Array) =>
      app.request("/api/import", {
        method: "POST",
        headers: { ...apiHeaders, Origin: origin, "Content-Type": "text/xml" },
        body: bytes,
      })
    expect((await send(Buffer.from(latin1, "latin1"))).status).toBe(200)
    expect(stored()).toContain("Rëef")
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(withNote, "utf16le"),
    ])
    expect((await send(utf16)).status).toBe(200)
    expect(stored()).toContain("Rëef")
    const unknown = await send(
      Buffer.from(withNote.replace('encoding="utf-8"', 'encoding="klingon"'))
    )
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toMatchObject({
      error: "The file's encoding (klingon) can't be read",
    })
  })

  it("refuses any other content type", async () => {
    const { app } = setup()
    const res = await upload(app, abroad, {
      "Content-Type": "application/json",
    })
    expect(res.status).toBe(403)
  })

  it("refuses a file over 25 MB", async () => {
    const { app } = setup()
    const res = await upload(app, " ".repeat(25 * 1024 * 1024 + 1))
    expect(res.status).toBe(413)
  })

  it.each([
    ["isn't XML", "not a file", "Not an XML document"],
    ["has no dives", "<uddf/>", "There are no dives in this file"],
    [
      "has a dive the log can't take",
      d4iXml.replace("<greatestdepth>", "<greatestdepth>-"),
      "Dive 1 in the file has no valid depth",
    ],
  ])("refuses a file that %s, saying why", async (_, file, error) => {
    const { db, app } = setup()
    const res = await upload(app, file)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error })
    expect(
      db.prepare("SELECT count(*) FROM import_previews").pluck().get()
    ).toBe(0)
  })
})

describe("the preview's other routes", () => {
  it("returns the preview waiting, adjusts a day, and discards it", async () => {
    const { app } = setup()
    const empty = await send(app, "GET", "/api/import/pending")
    expect(await empty.json()).toEqual({ preview: null })

    const { id } = importPreviewSchema.parse(
      await (await upload(app, abroad)).json()
    )
    const pending = await send(app, "GET", "/api/import/pending")
    expect(await pending.json()).toMatchObject({ preview: { id } })

    const res = await send(app, "PATCH", `/api/import/${id}`, {
      date: "2026-07-22",
      offset: 0,
    })
    expect(res.status).toBe(200)
    const moved = importPreviewSchema.parse(await res.json())
    expect(moved.pairs).toEqual([])
    expect(moved.unpaired.map((dive) => dive.diveId)).toEqual(["dive-63"])

    expect(
      (
        await send(app, "PATCH", `/api/import/${id}`, {
          date: "2026-07-22",
          offset: 10,
        })
      ).status
    ).toBe(400)
    expect(
      (
        await send(app, "PATCH", "/api/import/import-gone", {
          date: "2026-07-22",
          offset: 0,
        })
      ).status
    ).toBe(404)

    expect((await send(app, "DELETE", `/api/import/${id}`)).status).toBe(204)
    expect((await send(app, "DELETE", `/api/import/${id}`)).status).toBe(204)
    expect(
      await (await send(app, "GET", "/api/import/pending")).json()
    ).toEqual({ preview: null })
  })
})
