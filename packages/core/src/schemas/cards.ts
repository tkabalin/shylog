import { z } from "zod"

import { idSchema } from "../ids.ts"
import { name } from "./common.ts"

// The images travel as multipart files beside these fields, in page order.
export const cardFieldsSchema = z.strictObject({ name })
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
