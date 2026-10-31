import {
  cardHash,
  cardImageMaxBytes,
  sniffImage,
  type CardOrder,
} from "@shylog/core"

import { apiClient } from "@/api/client"

import type { Options } from "./cards"
import { db as defaultDb } from "./db"
import { commit } from "./edits"

// Apart from cards.ts, which the log's sync uses: these go through commit,
// which syncs the log, so keeping them there would make an import cycle.

// The server's name for a page (see hashOf in its card store).
async function hashOf(file: Blob) {
  return cardHash(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
    )
  )
}

// A phone photo is far more than a card needs, and a 48 MP one could come
// out over the 10 MB cap, so the long edge is kept to 4096 px.
const maxEdge = 4096

// HEIC, which iOS keeps from Files and a Mac picks as is, made a JPEG by
// the browser's own decoder: Safari's can, Chrome's and Firefox's can't.
// Drawing it also leaves its EXIF, and so where it was taken, behind.
async function heicToJpeg(file: File) {
  const url = URL.createObjectURL(file)
  const canvas = document.createElement("canvas")
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(
      1,
      maxEdge / Math.max(image.naturalWidth, image.naturalHeight)
    )
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height)
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    )
    if (!jpeg) throw new Error("No JPEG")
    return new File([jpeg], file.name.replace(/\.[^.]*$/, "") + ".jpg", {
      type: "image/jpeg",
    })
  } finally {
    URL.revokeObjectURL(url)
    // iOS caps all canvases' memory together and frees one's only once
    // it has no size, so a few photos in a row don't run out.
    canvas.width = canvas.height = 0
  }
}

// A picked file the server will take, with HEIC turned into JPEG, or what
// is wrong with it, worded for the sheet.
async function readPick(
  file: File,
  toJpeg: (file: File) => Promise<File>
): Promise<File | string> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const kind = sniffImage(head)
  if (!kind) return "Choose PNG, JPEG, WebP or HEIC images"
  let image = file
  if (kind === "heif") {
    try {
      image = await toJpeg(file)
    } catch {
      return "This browser can’t open HEIC. Save it as a JPEG first."
    }
  }
  if (image.size > cardImageMaxBytes) return "An image can be up to 10 MB"
  return image
}

// The picked files the server will take, in order, and the first problem
// with the rest. One at a time, so one full-size photo is decoded at once.
export async function readPicks(
  files: readonly File[],
  { toJpeg = heicToJpeg }: { toJpeg?: (file: File) => Promise<File> } = {}
) {
  const read: (File | string)[] = []
  for (const file of files) read.push(await readPick(file, toJpeg))
  return {
    good: read.filter((one) => typeof one !== "string"),
    problem: read.find((one) => typeof one === "string"),
  }
}

export type Picks = Awaited<ReturnType<typeof readPicks>>

// A page as saved: a new file, or the hash of one the card already has, so
// reordering uploads nothing.
export type SavedPage = File | string

// Long enough for a slow upload of ten pages and the sync after it.
const holdMs = 10 * 60 * 1000

// Creates or changes a card. New pages are kept on the phone under their
// hash, held from pruning until the log names them, so they aren't
// downloaded back. `settle: false` resolves once the server has it.
export async function saveCard(
  cardId: string,
  name: string,
  pages: readonly SavedPage[],
  {
    db = defaultDb,
    fetch = globalThis.fetch,
    settle = true,
  }: Options & { settle?: boolean } = {}
) {
  await Promise.all(
    pages.map(async (page) => {
      if (typeof page === "string") return
      try {
        await db.cardImages.put({
          cardId,
          hash: await hashOf(page),
          blob: page,
          heldUntil: Date.now() + holdMs,
        })
      } catch {
        // Without Web Crypto or storage the sync downloads it instead.
      }
    })
  )
  const form = new FormData()
  form.append("name", name)
  for (const page of pages) form.append("images", page)
  // Built by hand, as Hono's client can't type a form the route doesn't
  // validate.
  // Refused, a page the server never stored goes once its hold runs out.
  await commit(
    fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
      method: "PUT",
      headers: { "X-Shylog": "1" },
      body: form,
    }),
    { settle }
  )
}

// Resolves once the server has it, before the sync drops it from the log,
// so the viewer can leave first.
export const deleteCard = (cardId: string, fetch?: typeof globalThis.fetch) =>
  commit(apiClient(fetch).api.cards[":id"].$delete({ param: { id: cardId } }), {
    settle: false,
  })

// The cards in the owner's order, every card named once. Resolves once the
// log has it, so the list can let go of the order it shows meanwhile.
export const orderCards = (ids: string[], fetch?: typeof globalThis.fetch) =>
  // The log's ids, which the server only ever stores as card ids.
  commit(
    apiClient(fetch).api.cards.order.$put({
      json: { ids: ids as CardOrder["ids"] },
    })
  )
