import { latestSchemaVersion } from "@shylog/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Log } from "@/api/client"

import { readPicks, saveCard, sniffImage } from "./card-edits"
import {
  downloadCardImages,
  forgetCardImages,
  forgetCardUrls,
  imageUrl,
  retryCardImage,
} from "./cards"
import { LogDb } from "./db"
import { QueueDb } from "./drafts"
import { readLog } from "./log"
import { syncLog } from "./sync"

const card = (id: string, images: string[], name = "Open Water") => ({
  id,
  name,
  images,
})

const log = (version: string, cards: Log["cards"]): Log => ({
  schemaVersion: latestSchemaVersion,
  version,
  serverTime: "2026-10-30T10:00:00.000Z",
  dives: [],
  sites: [],
  countries: [],
  regions: [],
  people: [],
  diveCentres: [],
  trips: [],
  links: [],
  fieldMeta: [],
  settings: {
    diverName: "",
    maxPo2: 1.4,
    newDiveDefaults: { visibilityMode: "metres" },
  },
  cards,
})

// A stand-in for the server: the log, and each page's bytes as its hash.
// `during` runs while an image request is in flight.
function server(current: () => Log, during?: (path: string) => Promise<void>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://shylog.test")
    expect(new Headers(init?.headers).get("X-Shylog")).toBe("1")
    if (url.pathname === "/api/log") return Response.json(current())
    const [, cardId, n] =
      /^\/api\/cards\/([^/]+)\/images\/(\d+)$/.exec(url.pathname) ?? []
    await during?.(url.pathname)
    const hash = current().cards.find((c) => c.id === cardId)?.images[+n!]
    if (!hash || url.searchParams.get("v") !== hash)
      return Response.json({ error: "No such image" }, { status: 404 })
    return new Response(hash, { headers: { "Content-Type": "image/png" } })
  })
}

const imageRequests = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes("/images/"))

const kept = async (db: LogDb) =>
  (await db.cardImages.toCollection().primaryKeys()).map(String).sort()

// jsdom has no object URLs, so each stands for its blob here.
const blobs = new Map<string, Blob>()
const text = (url: string) => blobs.get(url)!.text()

let db: LogDb
let queue: QueueDb
beforeEach(() => {
  db = new LogDb(`test-${crypto.randomUUID()}`)
  queue = new QueueDb(`test-queue-${crypto.randomUUID()}`)
  forgetCardImages()
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:${blobs.size}`
    blobs.set(url, blob)
    return url
  }
})
afterEach(async () => {
  await db.delete()
  await queue.delete()
})

describe("imageUrl", () => {
  it("fetches a page once, then serves it from the phone", async () => {
    let current = log("v1", [card("card-ow", ["aaaa", "bbbb"])])
    const fetch = server(() => current)
    await syncLog({ db, fetch })
    expect(
      await text(await imageUrl("card-ow", 1, "bbbb", { db, fetch }))
    ).toBe("bbbb")
    expect(imageRequests(fetch)).toEqual(["/api/cards/card-ow/images/1?v=bbbb"])
    await vi.waitFor(async () =>
      expect(await kept(db)).toEqual(["card-ow,bbbb"])
    )

    // A new launch has no object URLs, but the phone still has the page,
    // even with the server gone. (fake-indexeddb's clone of a Blob can't
    // be read back as one, so only the request count is checked.)
    forgetCardImages()
    current = log("v1", [])
    await expect(
      imageUrl("card-ow", 1, "bbbb", { db, fetch })
    ).resolves.toMatch(/^blob:/)
    expect(imageRequests(fetch)).toHaveLength(1)
  })

  it("keeps a failure until it is retried, so a re-render can't loop", async () => {
    const fetch = server(() => log("v1", []))
    const first = imageUrl("card-ow", 0, "aaaa", { db, fetch })
    await expect(first).rejects.toThrow("Couldn’t load the card (404)")
    expect(imageUrl("card-ow", 0, "aaaa", { db, fetch })).toBe(first)
    retryCardImage("card-ow", "aaaa")
    expect(imageUrl("card-ow", 0, "aaaa", { db, fetch })).not.toBe(first)
  })

  it("doesn't keep a page the log stopped naming while it was fetched", async () => {
    let current = log("v1", [card("card-ow", ["aaaa"])])
    const fetch = server(
      () => current,
      async () => {
        current = log("v2", [])
        await syncLog({ db, fetch })
        current = log("v1", [card("card-ow", ["aaaa"])])
      }
    )
    await syncLog({ db, fetch })
    await imageUrl("card-ow", 0, "aaaa", { db, fetch })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await kept(db)).toEqual([])
  })
})

describe("downloadCardImages", () => {
  it("keeps every card's pages after a sync, asking only for the missing", async () => {
    const current = log("v1", [
      card("card-aow", ["aaaa", "bbbb"]),
      card("card-nx", ["cccc"]),
    ])
    const fetch = server(() => current)
    await syncLog({ db, fetch })
    await db.cardImages.put({
      cardId: "card-aow",
      hash: "aaaa",
      blob: new Blob(["aaaa"]),
    })
    await downloadCardImages(current.cards, { db, fetch })
    expect(imageRequests(fetch)).toEqual([
      "/api/cards/card-aow/images/1?v=bbbb",
      "/api/cards/card-nx/images/0?v=cccc",
    ])
    expect(await kept(db)).toEqual([
      "card-aow,aaaa",
      "card-aow,bbbb",
      "card-nx,cccc",
    ])

    await downloadCardImages(current.cards, { db, fetch })
    expect(imageRequests(fetch)).toHaveLength(2)
  })

  it("stops when the server can't be reached, keeping what came before", async () => {
    const current = log("v1", [
      card("card-aow", ["aaaa"]),
      card("card-nx", ["bbbb"]),
      card("card-ow", ["cccc"]),
    ])
    const answer = server(() => current)
    await syncLog({ db, fetch: answer })
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("v=bbbb")) throw new TypeError("offline")
        return answer(input, init)
      }
    )
    await downloadCardImages(current.cards, { db, fetch })
    // Nothing is asked for after the page that failed.
    expect(imageRequests(fetch)).toEqual([
      "/api/cards/card-aow/images/0?v=aaaa",
      "/api/cards/card-nx/images/0?v=bbbb",
    ])
    expect(await kept(db)).toEqual(["card-aow,aaaa"])
  })

  it("stops when the server is down, rather than asking for every page", async () => {
    const current = log("v1", [
      card("card-aow", ["aaaa"]),
      card("card-nx", ["bbbb"]),
    ])
    await syncLog({ db, fetch: server(() => current) })
    const fetch = vi.fn(
      async () => new Response("Bad gateway", { status: 502 })
    )
    await downloadCardImages(current.cards, { db, fetch })
    expect(imageRequests(fetch)).toHaveLength(1)
    expect(await kept(db)).toEqual([])
  })

  it("skips a page the server has since changed and goes on", async () => {
    const synced = log("v1", [
      card("card-aow", ["aaaa"]),
      card("card-nx", ["bbbb"]),
    ])
    // Reordered on another phone after this one synced.
    const now = log("v2", [
      card("card-aow", ["zzzz"]),
      card("card-nx", ["bbbb"]),
    ])
    await syncLog({ db, fetch: server(() => synced) })
    const fetch = server(() => now)
    await downloadCardImages(synced.cards, { db, fetch })
    expect(imageRequests(fetch)).toHaveLength(2)
    expect(await kept(db)).toEqual(["card-nx,bbbb"])
  })

  it("doesn't keep a page a sync pruned while it was fetched", async () => {
    let current = log("v1", [card("card-ow", ["aaaa"])])
    const fetch = server(
      () => current,
      async () => {
        current = log("v2", [])
        await syncLog({ db, fetch })
        current = log("v1", [card("card-ow", ["aaaa"])])
      }
    )
    await syncLog({ db, fetch })
    await downloadCardImages(current.cards, { db, fetch })
    expect(await kept(db)).toEqual([])
  })

  it("lets a page that failed to show load again once it is kept", async () => {
    const current = log("v1", [card("card-ow", ["aaaa"])])
    const answer = server(() => current)
    await syncLog({ db, fetch: answer })
    const offline = vi.fn(async () => {
      throw new TypeError("offline")
    })
    const failed = imageUrl("card-ow", 0, "aaaa", { db, fetch: offline })
    await expect(failed).rejects.toThrow("offline")
    await downloadCardImages(current.cards, { db, fetch: answer })
    const again = imageUrl("card-ow", 0, "aaaa", { db, fetch: offline })
    expect(again).not.toBe(failed)
    await expect(again).resolves.toMatch(/^blob:/)
  })

  it("stops for good once the phone's storage is full", async () => {
    const current = log("v1", [card("card-ow", ["aaaa", "bbbb"])])
    const fetch = server(() => current)
    await syncLog({ db, fetch })
    vi.spyOn(db.cardImages, "put").mockRejectedValue(
      Object.assign(new Error("full"), { name: "QuotaExceededError" })
    )
    await downloadCardImages(current.cards, { db, fetch })
    await downloadCardImages(current.cards, { db, fetch })
    expect(imageRequests(fetch)).toHaveLength(1)
  })
})

describe("the next sync", () => {
  it("drops a card deleted on the server, and a page a card no longer has", async () => {
    let current = log("v1", [
      card("card-aow", ["aaaa", "bbbb"]),
      card("card-nx", ["cccc"]),
    ])
    const fetch = server(() => current)
    await syncLog({ db, fetch })
    await downloadCardImages(current.cards, { db, fetch })

    current = log("v2", [card("card-aow", ["bbbb"])])
    await syncLog({ db, fetch })
    expect(await db.cards.toArray()).toEqual([
      { ...card("card-aow", ["bbbb"]), position: 0 },
    ])
    expect(await kept(db)).toEqual(["card-aow,bbbb"])
  })

  it("leaves a page a save is holding, until its hold runs out", async () => {
    const blob = new Blob()
    await db.cardImages.bulkPut([
      { cardId: "card-ow", hash: "aaaa", blob, heldUntil: Date.now() + 60_000 },
      { cardId: "card-ow", hash: "bbbb", blob, heldUntil: Date.now() - 1 },
    ])
    await syncLog({ db, fetch: server(() => log("v1", [])) })
    expect(await kept(db)).toEqual(["card-ow,aaaa"])
  })

  it("keeps the cards in the server's order for the screens", async () => {
    const fetch = server(() =>
      log("v1", [card("card-z", ["aaaa"]), card("card-a", ["bbbb"])])
    )
    await syncLog({ db, fetch })
    const { log: read } = await readLog(db, queue)
    expect(read!.cards.map((c) => c.id)).toEqual(["card-z", "card-a"])
  })

  it("forgets the shown page of a card that is gone", async () => {
    const current = log("v1", [card("card-ow", ["aaaa"])])
    const fetch = server(() => current)
    await syncLog({ db, fetch })
    const url = imageUrl("card-ow", 0, "aaaa", { db, fetch })
    await url
    forgetCardUrls(current.cards)
    expect(imageUrl("card-ow", 0, "aaaa", { db, fetch })).toBe(url)
    forgetCardUrls([])
    expect(imageUrl("card-ow", 0, "aaaa", { db, fetch })).not.toBe(url)
  })
})

describe("saveCard", () => {
  it("keeps a new page under the server's hash, so it isn't downloaded back", async () => {
    const file = new File(["page one"], "card.png", { type: "image/png" })
    const sent: FormData[] = []
    const fetch = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      sent.push(init!.body as FormData)
      return Response.json({ version: "v2" })
    })
    // The sync after a save is the app's, not this test's.
    await saveCard("card-ow", "Open Water", [file, "aaaa"], {
      db,
      fetch,
      settle: false,
    })
    expect(String(fetch.mock.calls[0]![0])).toBe("/api/cards/card-ow")
    expect(sent[0]!.get("name")).toBe("Open Water")
    expect(sent[0]!.getAll("images")).toHaveLength(2)
    // sha256("page one"), its first 16 hex digits, as the server names it,
    // held from a sync whose log doesn't name it yet.
    expect(await kept(db)).toEqual(["card-ow,08e548c038b16088"])
    const [page] = await db.cardImages.toArray()
    expect(page!.heldUntil).toBeGreaterThan(Date.now())
  })
})

describe("sniffImage", () => {
  const bytes = (...parts: (string | number[])[]) =>
    new Uint8Array(
      parts.flatMap((part) =>
        typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part
      )
    )

  it("knows the stored types and HEIC or HEIF by their first bytes", () => {
    expect(sniffImage(bytes("\x89PNG\r\n\x1a\n"))).toBe("image/png")
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
    expect(sniffImage(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("image/webp")
    for (const brand of ["heic", "heix", "hevc", "mif1", "msf1"]) {
      expect(sniffImage(bytes([0, 0, 0, 24], "ftyp", brand))).toBe("heif")
    }
  })

  it("knows nothing else, an AVIF or MP4 included", () => {
    expect(sniffImage(bytes([0, 0, 0, 24], "ftyp", "avif"))).toBeNull()
    expect(sniffImage(bytes([0, 0, 0, 24], "ftyp", "isom"))).toBeNull()
    expect(sniffImage(bytes("GIF89a"))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})

describe("readPicks", () => {
  const png = (size = 16, name = "card.png") => {
    const body = new Uint8Array(size)
    body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    // No type, as iOS gives some picks: the bytes decide.
    return new File([body], name)
  }
  const heic = new File(
    [
      new Uint8Array([
        0,
        0,
        0,
        24,
        ...[..."ftypheic"].map((c) => c.charCodeAt(0)),
      ]),
    ],
    "card.HEIC",
    { type: "image/heic" }
  )
  const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], "card.jpg", {
    type: "image/jpeg",
  })

  it("keeps the order, turns HEIC into JPEG, and says what it left out", async () => {
    const text = new File(["hello"], "notes.txt", { type: "text/plain" })
    const first = png()
    const { good, problem } = await readPicks([first, heic, text], {
      toJpeg: async () => jpeg,
    })
    expect(good).toEqual([first, jpeg])
    expect(problem).toBe("Choose PNG, JPEG, WebP or HEIC images")
  })

  it("refuses HEIC where the browser can't decode it", async () => {
    const { good, problem } = await readPicks([heic], {
      toJpeg: () => Promise.reject(new Error("no decoder")),
    })
    expect(good).toEqual([])
    expect(problem).toBe(
      "This browser can’t open HEIC. Save it as a JPEG first."
    )
  })

  it("refuses HEIC where the browser's own decoder can't read it", async () => {
    // jsdom decodes no image, as Chrome and Firefox can't decode HEIC.
    const { good, problem } = await readPicks([heic])
    expect(good).toEqual([])
    expect(problem).toBe(
      "This browser can’t open HEIC. Save it as a JPEG first."
    )
  })

  it("refuses an image over 10 MB", async () => {
    const { good, problem } = await readPicks([png(10 * 1024 * 1024 + 1)])
    expect(good).toEqual([])
    expect(problem).toBe("An image can be up to 10 MB")
  })
})
