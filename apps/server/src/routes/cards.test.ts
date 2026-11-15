import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { apiHeaders, origin, testApp } from "../../test/app.ts"
import { testDb } from "../../test/db.ts"
import { hashOf } from "../cards/store.ts"
import type { Db } from "../db/open.ts"

// The first bytes each format starts with, which is all the check reads.
const png = (n: number) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n])
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])
const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")

let dir: string
let db: Db
let app: ReturnType<typeof testApp>
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shylog-cards-"))
  db = testDb()
  app = testApp({ db, env: { SHYLOG_DATA_DIR: dir } })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const files = (id = "card-padi") =>
  existsSync(join(dir, "cards", id))
    ? readdirSync(join(dir, "cards", id)).sort()
    : []

function put(
  name: string,
  images: (Uint8Array<ArrayBuffer> | string)[],
  id = "card-padi",
  thumb?: unknown
) {
  const form = new FormData()
  form.append("name", name)
  if (thumb !== undefined)
    form.append(
      "thumb",
      typeof thumb === "string" ? thumb : JSON.stringify(thumb)
    )
  for (const image of images) {
    if (typeof image === "string") form.append("images", image)
    else form.append("images", new Blob([image]), "card.png")
  }
  return app.request(`/api/cards/${id}`, {
    method: "PUT",
    headers: { ...apiHeaders, Origin: origin },
    body: form,
  })
}

const get = (path: string) => app.request(path, { headers: apiHeaders })
const listed = async () =>
  (await (await get("/api/cards")).json()) as {
    id: string
    name: string
    images: string[]
    thumb: unknown
  }[]
const version = async (res: Response) =>
  ((await res.json()) as { version: string }).version

describe("PUT /api/cards/:id", () => {
  it("stores each image under its hash with a row, and journals", async () => {
    const res = await put("PADI Open Water", [png(1), jpeg])
    expect(res.status).toBe(200)
    const hashes = [hashOf(png(1)), hashOf(jpeg)]
    expect(files()).toEqual([...hashes].sort())
    expect(await listed()).toEqual([
      { id: "card-padi", name: "PADI Open Water", images: hashes, thumb: null },
    ])
    const log = (await (await get("/api/log")).json()) as { cards: unknown }
    expect(log.cards).toEqual(await listed())
    expect(
      db.prepare("SELECT type, payload FROM ops ORDER BY seq DESC").get()
    ).toEqual({
      type: "putCard",
      payload: JSON.stringify({
        id: "card-padi",
        name: "PADI Open Water",
        images: [
          { hash: hashes[0], contentType: "image/png" },
          { hash: hashes[1], contentType: "image/jpeg" },
        ],
        first: true,
        thumb: null,
      }),
    })
  })

  it("keeps a crop under the hash of the first page as sent", async () => {
    const crop = { x: 0.5, y: 0.3, scale: 2.5, aspect: 0.46 }
    await put("PADI", [png(1), jpeg], "card-padi", crop)
    const thumb = { hash: hashOf(png(1)), ...crop }
    expect((await listed())[0].thumb).toEqual(thumb)
    const log = (await (await get("/api/log")).json()) as {
      cards: { thumb: unknown }[]
    }
    expect(log.cards[0].thumb).toEqual(thumb)
    const op = db
      .prepare("SELECT payload FROM ops ORDER BY seq DESC")
      .pluck()
      .get() as string
    expect(JSON.parse(op).thumb).toEqual(thumb)

    // Another page first, the crop sent is that page's.
    await put("PADI", [hashOf(jpeg), hashOf(png(1))], "card-padi", crop)
    expect((await listed())[0].thumb).toEqual({ hash: hashOf(jpeg), ...crop })
  })

  it("keeps the stored crop when none is sent, while its page stays first", async () => {
    const crop = { x: 0.5, y: 0.3, scale: 2.5, aspect: 0.46 }
    const [front, back] = [hashOf(png(1)), hashOf(jpeg)]
    await put("PADI", [png(1), jpeg], "card-padi", crop)
    // A rename from an app that never touched the crop.
    await put("PADI Open Water", [front, back])
    expect((await listed())[0].thumb).toEqual({ hash: front, ...crop })
    // Journalled as stored, so a replay needn't know what was there.
    const op = db
      .prepare("SELECT payload FROM ops ORDER BY seq DESC")
      .pluck()
      .get() as string
    expect(JSON.parse(op).thumb).toEqual({ hash: front, ...crop })
    // Once another page is first it no longer fits, so it goes.
    await put("PADI Open Water", [back, front])
    expect((await listed())[0].thumb).toBeNull()
  })

  it("clears the crop when sent null", async () => {
    const crop = { x: 0.5, y: 0.3, scale: 2.5, aspect: 0.46 }
    await put("PADI", [png(1)], "card-padi", crop)
    await put("PADI", [hashOf(png(1))], "card-padi", null)
    expect((await listed())[0].thumb).toBeNull()
  })

  it("writes nothing for the same crop again, and a new version for a new one", async () => {
    const crop = { x: 0.5, y: 0.3, scale: 2.5, aspect: 0.46 }
    const first = await version(await put("PADI", [png(1)], "card-padi", crop))
    const hash = hashOf(png(1))
    expect(await version(await put("PADI", [hash], "card-padi", crop))).toBe(
      first
    )
    expect(await version(await put("PADI", [hash]))).toBe(first)
    const moved = { ...crop, x: 0.6 }
    expect(
      await version(await put("PADI", [hash], "card-padi", moved))
    ).not.toBe(first)
    expect((await listed())[0].thumb).toEqual({ hash, ...moved })
  })

  it("refuses a crop out of range, not JSON, or sent as a file", async () => {
    const bad: unknown[] = [
      { x: 1.2, y: 0.5, scale: 1, aspect: 1 },
      { x: 0.5, y: 0.5, scale: 0.5, aspect: 1 },
      { x: 0.5, y: 0.5, scale: 2 },
      { x: 0.5, y: 0.5, scale: 2, aspect: 1, hash: "0123456789abcdef" },
      "{",
      "",
    ]
    for (const thumb of bad) {
      expect((await put("PADI", [png(1)], "card-padi", thumb)).status).toBe(400)
    }
    expect(
      await (await put("PADI", [png(1)], "card-padi", "{")).json()
    ).toEqual({ error: "The thumbnail isn’t valid JSON", path: ["thumb"] })
    const form = new FormData()
    form.append("name", "PADI")
    form.append("images", new Blob([png(1)]), "card.png")
    form.append("thumb", new Blob(["{}"]), "thumb.json")
    const res = await app.request("/api/cards/card-padi", {
      method: "PUT",
      headers: { ...apiHeaders, Origin: origin },
      body: form,
    })
    expect(res.status).toBe(400)
    expect(await listed()).toEqual([])
    expect(files()).toEqual([])
  })

  it("reorders by hash without uploading, and replaces an image", async () => {
    await put("PADI", [png(1), jpeg])
    const [front, back] = [hashOf(png(1)), hashOf(jpeg)]
    expect((await put("PADI", [back, front])).status).toBe(200)
    expect((await listed())[0].images).toEqual([back, front])
    expect(files()).toEqual([front, back].sort())

    await put("PADI", [back, webp])
    expect((await listed())[0].images).toEqual([back, hashOf(webp)])
    expect(files()).toEqual([back, hashOf(webp)].sort())
  })

  it("writes nothing when saved again unchanged, and renames", async () => {
    const first = await version(await put("PADI", [png(1)]))
    expect(await version(await put("PADI", [png(1)]))).toBe(first)
    expect(await version(await put("PADI", [hashOf(png(1))]))).toBe(first)
    await put("PADI Open Water", [hashOf(png(1))])
    expect((await listed())[0].name).toBe("PADI Open Water")
  })

  it("puts a new card first, and leaves an edited one in place", async () => {
    await put("PADI", [png(1)], "card-b")
    await put("SSI", [png(2)], "card-a")
    await put("PADI Open Water", [hashOf(png(1))], "card-b")
    expect((await listed()).map((card) => card.id)).toEqual([
      "card-a",
      "card-b",
    ])
  })

  it("rejects a non-image, a hash the card doesn't have, and no images, storing nothing", async () => {
    const text = new TextEncoder().encode("<svg></svg>")
    for (const images of [[png(1), text], [png(1), "0123456789abcdef"], []]) {
      const res = await put("PADI", images)
      expect(res.status).toBe(400)
    }
    expect(await (await put("PADI", [text])).json()).toEqual({
      error: "Expected a PNG, JPEG or WebP image",
      path: ["images", 0],
    })
    expect(await listed()).toEqual([])
    expect(files()).toEqual([])
  })

  it("rejects an image over 10 MB and more than ten pages", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set(png(1))
    expect((await put("PADI", [big])).status).toBe(400)
    const pages = Array.from({ length: 11 }, (_, n) => png(n))
    expect((await put("PADI", pages)).status).toBe(400)
    expect(files()).toEqual([])
  })
})

describe("PUT /api/cards/order", () => {
  const order = (ids: unknown) =>
    app.request("/api/cards/order", {
      method: "PUT",
      headers: {
        ...apiHeaders,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    })
  const ids = async () => (await listed()).map((card) => card.id)

  beforeEach(async () => {
    for (const id of ["card-c", "card-b", "card-a"]) await put(id, [png(1)], id)
  })

  it("keeps the order given, journals it, and writes nothing when unchanged", async () => {
    const res = await order(["card-c", "card-a", "card-b"])
    expect(res.status).toBe(200)
    expect(await ids()).toEqual(["card-c", "card-a", "card-b"])
    expect(
      db.prepare("SELECT type FROM ops ORDER BY seq DESC LIMIT 1").pluck().get()
    ).toBe("orderCards")
    const again = await order(["card-c", "card-a", "card-b"])
    expect(await version(again)).toBe(await version(res))
  })

  it("refuses an order missing a card, naming one twice or one gone", async () => {
    for (const given of [
      ["card-a", "card-b"],
      ["card-a", "card-a", "card-b"],
      ["card-a", "card-b", "card-gone"],
    ]) {
      const res = await order(given)
      expect(res.status).toBe(409)
    }
    expect((await order(["not-a-card"])).status).toBe(400)
    expect(await ids()).toEqual(["card-a", "card-b", "card-c"])
  })
})

describe("DELETE /api/cards/:id", () => {
  it("removes the row and files, and writes nothing when repeated", async () => {
    await put("PADI", [png(1), jpeg])
    const res = await app.request("/api/cards/card-padi", {
      method: "DELETE",
      headers: { ...apiHeaders, Origin: origin },
    })
    expect(res.status).toBe(200)
    expect(await listed()).toEqual([])
    expect(existsSync(join(dir, "cards", "card-padi"))).toBe(false)
    expect(
      db.prepare("SELECT count(*) FROM certification_images").pluck().get()
    ).toBe(0)
    const again = await app.request("/api/cards/card-padi", {
      method: "DELETE",
      headers: { ...apiHeaders, Origin: origin },
    })
    expect(await version(again)).toBe(await version(res.clone()))
  })
})

describe("GET /api/cards/:id/images/:n", () => {
  it("streams the image with a long cache header", async () => {
    await put("PADI", [png(1), jpeg])
    const res = await get(`/api/cards/card-padi/images/1?v=${hashOf(jpeg)}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable"
    )
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg)

    const unversioned = await get("/api/cards/card-padi/images/1")
    expect(unversioned.headers.get("Cache-Control")).toBe("no-cache")
    expect(new Uint8Array(await unversioned.arrayBuffer())).toEqual(jpeg)
  })

  it("refuses a stale hash and a page the card doesn't have", async () => {
    await put("PADI", [png(1)])
    expect((await get("/api/cards/card-padi/images/0?v=stale")).status).toBe(
      404
    )
    expect((await get("/api/cards/card-padi/images/1")).status).toBe(404)
  })
})
