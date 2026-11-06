import { importOffsetRequest } from "@shylog/core"
import { bodyLimit } from "hono/body-limit"

import { Rejected } from "../apply/rejected.ts"
import { factory } from "../factory.ts"
import {
  discardPreview,
  pendingPreview,
  setDayOffset,
  storePreview,
} from "../import/preview.ts"
import { json } from "../validate.ts"

// A Subsurface export of a few hundred dives is a few megabytes.
const maxUpload = 25 * 1024 * 1024

// iOS gives a .uddf file no type, so the app sends it as a byte stream
// with its name, and only an export's name is taken that way.
function namedExport(disposition = "") {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  let name = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? ""
  // The encoded name wins over the plain fallback, as RFC 6266 has it, and
  // a malformed escape names no export rather than failing the request.
  if (encoded) {
    try {
      name = decodeURIComponent(encoded)
    } catch {
      return false
    }
  }
  return /\.(uddf|xml)$/i.test(name.trim())
}

// By the byte order mark, else the XML declaration, else UTF-8, which is
// what Subsurface writes; another tool's export may say otherwise.
function decodeXml(bytes: Uint8Array) {
  const bom =
    bytes[0] === 0xfe && bytes[1] === 0xff
      ? "utf-16be"
      : bytes[0] === 0xff && bytes[1] === 0xfe
        ? "utf-16le"
        : null
  const declared = new TextDecoder("latin1")
    .decode(bytes.subarray(0, 200))
    .match(/<\?xml[^>]*\bencoding=["']([\w.:-]+)["']/)?.[1]
  try {
    return new TextDecoder(bom ?? declared ?? "utf-8").decode(bytes)
  } catch {
    throw new Rejected(`The file's encoding (${declared}) can't be read`, 400)
  }
}

export const imports = factory
  .createApp()
  .post(
    "/import",
    bodyLimit({
      maxSize: maxUpload,
      onError: (c) => c.json({ error: "The file is too large" }, 413),
    }),
    async (c) => {
      const type = c.req.header("Content-Type")?.split(";")[0].trim()
      if (
        type?.toLowerCase() === "application/octet-stream" &&
        !namedExport(c.req.header("Content-Disposition"))
      ) {
        throw new Rejected("Choose a .uddf or .xml file", 415)
      }
      const xml = decodeXml(new Uint8Array(await c.req.arrayBuffer()))
      return c.json(storePreview(c.var.deps.db, xml))
    }
  )
  .get("/import/pending", (c) =>
    c.json({ preview: pendingPreview(c.var.deps.db) })
  )
  .patch("/import/:id", json(importOffsetRequest), (c) =>
    c.json(setDayOffset(c.var.deps.db, c.req.param("id"), c.req.valid("json")))
  )
  .delete("/import/:id", (c) => {
    discardPreview(c.var.deps.db, c.req.param("id"))
    return c.body(null, 204)
  })
