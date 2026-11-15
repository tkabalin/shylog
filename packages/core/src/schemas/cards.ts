import { z } from "zod"

import { idSchema } from "../ids.ts"
import { name } from "./common.ts"

// Thumbnails show a card's first page at a bank card's shape, which an
// eCard keeps.
export const cardAspect = 1.586
// Far enough to cut a small card out of a whole phone screenshot.
export const cardCropMaxScale = 8

// Where a thumbnail looks: the centre as fractions of the image's width and
// height, and a zoom where 1 just fills the card's shape. With the page's
// width over its height, so a thumbnail is placed before its image loads.
export const cardCropSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(1).max(cardCropMaxScale),
  // Wide enough for a long scroll capture, which can be 100 times taller.
  aspect: z.number().min(0.0001).max(10000),
})
export type CardCrop = z.output<typeof cardCropSchema>

// As stored, with the hash of the page it was made on.
export type CardThumb = CardCrop & { hash: string }

// A card's crop, or null once another page has become first (a reorder or
// a delete since), so it never frames the wrong image.
export function cardCrop(card: {
  images: readonly string[]
  thumb: CardThumb | null
}): CardCrop | null {
  if (!card.thumb || card.thumb.hash !== card.images[0]) return null
  const { x, y, scale, aspect } = card.thumb
  return { x, y, scale, aspect }
}

// The images travel as multipart files beside these fields, in page order.
// The crop is the first page's as sent, which the server keys to that page:
// null clears it, and none keeps the stored one while that page stays first,
// so a save from an app that never touched the crop can't drop it.
export const cardFieldsSchema = z.strictObject({
  name,
  thumb: cardCropSchema.nullable().optional(),
})
export type CardFields = z.output<typeof cardFieldsSchema>

// Every card's id in the owner's order; the first are the ones You shows.
export const cardOrderSchema = z.strictObject({
  ids: z.array(idSchema("card")),
})
export type CardOrder = z.output<typeof cardOrderSchema>

export const cardImageTypes = ["image/png", "image/jpeg", "image/webp"] as const

// What an image is from its first 12 bytes, never its name or the type a
// browser gives: a type the server stores, HEIC or HEIF (which the phone
// turns into JPEG first), or null. Shared, so the phone refuses what the
// server would.
export function sniffImage(
  head: Uint8Array
): (typeof cardImageTypes)[number] | "heif" | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...head.subarray(from, to))
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png"
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg"
  }
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp"
  if (ascii(4, 8) === "ftyp" && heifBrands.has(ascii(8, 12))) return "heif"
  return null
}

// The major brands of an iPhone's HEIC and of HEIF stills and sequences.
const heifBrands = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
])

// A page's name: the first 16 hex digits of its SHA-256, which the phone
// works out too, to keep a saved page under the name the server gives it.
export const cardHash = (sha256: Uint8Array) =>
  [...sha256.subarray(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
export const cardImageMaxBytes = 10 * 1024 * 1024
// Agency eCards are a page or two; the cap bounds what one upload holds in
// memory.
export const cardMaxPages = 10
