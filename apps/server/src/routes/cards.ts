import { createReadStream, fstatSync, openSync } from "node:fs"
import { join } from "node:path"
import { Readable } from "node:stream"

import {
  cardFieldsSchema,
  cardImageMaxBytes,
  cardMaxPages,
  idSchema,
} from "@shylog/core"
import { bodyLimit } from "hono/body-limit"

import { Rejected } from "../apply/rejected.ts"
import {
  cardsDir,
  deleteCard,
  readCards,
  saveCard,
  sniff,
  type Page,
} from "../cards/store.ts"
import { prepared } from "../db/prepared.ts"
import { factory } from "../factory.ts"
import { parse } from "../validate.ts"
import { change } from "./change.ts"

// Every page at its largest, plus the name and multipart framing.
const maxUpload = cardMaxPages * cardImageMaxBytes + 1024 * 1024

async function page(sent: string | File, i: number): Promise<Page> {
  if (typeof sent === "string") return sent
  const path = ["images", i]
  if (sent.size > cardImageMaxBytes) {
    throw new Rejected("An image can be up to 10 MB", 400, path)
  }
  const bytes = new Uint8Array(await sent.arrayBuffer())
  const contentType = sniff(bytes)
  if (!contentType) {
    throw new Rejected("Expected a PNG, JPEG or WebP image", 400, path)
  }
  return { bytes, contentType }
}

export const cards = factory
  .createApp()
  .get("/cards", (c) => c.json(readCards(c.var.deps.db)))
  .put(
    "/cards/:id",
    bodyLimit({
      maxSize: maxUpload,
      onError: (c) => c.json({ error: "The upload is too large" }, 413),
    }),
    async (c) => {
      const { db, env } = c.var.deps
      const id = parse(idSchema("card"), c.req.param("id"))
      const form = await c.req.parseBody({ all: true })
      const { name } = parse(cardFieldsSchema, { name: form.name })
      const pages = await Promise.all(
        [form.images ?? []].flat().map((sent, i) => page(sent, i))
      )
      return c.json(
        saveCard(
          db,
          cardsDir(env.SHYLOG_DATA_DIR),
          id,
          name,
          pages,
          (apply, entry) => change(db, apply, entry, false)
        )
      )
    }
  )
  .delete("/cards/:id", (c) => {
    const { db, env } = c.var.deps
    const id = parse(idSchema("card"), c.req.param("id"))
    return c.json(
      deleteCard(db, cardsDir(env.SHYLOG_DATA_DIR), id, (apply, entry) =>
        change(db, apply, entry, false)
      )
    )
  })
  // Fetched with ?v=<hash>, so the URL changes with the bytes and can be
  // cached for a year. A stale hash is refused rather than answered with
  // the new bytes, which the phone would keep under the old one.
  .get("/cards/:id/images/:n", (c) => {
    const { db, env } = c.var.deps
    const id = c.req.param("id")
    const image = prepared<[string, number], { hash: string; type: string }>(
      db,
      "SELECT hash, content_type AS type FROM certification_images WHERE card_id = ? AND n = ?"
    ).get(id, Number(c.req.param("n")))
    const v = c.req.query("v")
    if (!image || (v !== undefined && v !== image.hash)) {
      return c.json({ error: "No such image" }, 404)
    }
    // Without the hash the URL outlives the bytes, so it is checked each time.
    c.header(
      "Cache-Control",
      v === undefined ? "no-cache" : "private, max-age=31536000, immutable"
    )
    // Opened before replying, so a save that prunes the file meanwhile
    // can't cut the stream short.
    const fd = openSync(
      join(cardsDir(env.SHYLOG_DATA_DIR), id, image.hash),
      "r"
    )
    c.header("Content-Type", image.type)
    c.header("Content-Length", String(fstatSync(fd).size))
    c.header("X-Content-Type-Options", "nosniff")
    return c.body(
      Readable.toWeb(createReadStream("", { fd })) as ReadableStream
    )
  })
