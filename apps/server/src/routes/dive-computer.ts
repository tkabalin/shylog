import type { Context } from "hono"
import { z } from "zod"

import { factory, type Variables } from "../factory.ts"
import { logger } from "../log.ts"
import { forgetComputer, storedComputer } from "../download/computer.ts"
import { DownloadError, type DctoolConfig } from "../download/dctool.ts"
import { detect, downloadDives } from "../download/download.ts"
import type { Env } from "../env.ts"
import { json } from "../validate.ts"

const downloadRequest = z.strictObject({ readAll: z.boolean().default(false) })

const config = (env: Env): DctoolConfig | null =>
  env.SHYLOG_DC_DEVICE
    ? { device: env.SHYLOG_DC_DEVICE, command: env.SHYLOG_DCTOOL }
    : null

// A failure the watch or cable caused, as its reason; anything else goes
// to the app's error handler.
async function answer<T>(
  c: Context<{ Variables: Variables }>,
  work: () => Promise<T>
) {
  try {
    return await work()
  } catch (error) {
    if (!(error instanceof DownloadError)) throw error
    const broke = error.reason === "failed" || error.reason === "stopped"
    c.set("refusal", error.message)
    logger[broke ? "error" : "warn"](
      { event: "dive_computer", reason: error.reason, detail: error.detail },
      error.message
    )
    return c.json(
      { error: error.message, reason: error.reason },
      broke ? 502 : 409
    )
  }
}

// The watch on the home server's cable (see Downloading from the dive
// computer in the spec). Each failure has its reason, for the Import
// screen's state: a missing cable or a silent watch is the diver's to fix,
// a read that broke off is the server's.
export const diveComputer = factory
  .createApp()
  .get("/dive-computer", (c) => {
    const stored = storedComputer(c.var.deps.db)
    return c.json({
      enabled: !!config(c.var.deps.env),
      computer: stored && {
        model: stored.model,
        lastDownloadAt: stored.lastDownloadAt,
      },
    })
  })
  // Forgetting needs no cable, so a watch can be forgotten after the
  // download is turned off: before the check below, as its pattern
  // matches /dive-computer too.
  .delete("/dive-computer", (c) => {
    forgetComputer(c.var.deps.db)
    return c.body(null, 204)
  })
  .use("/dive-computer/*", async (c, next) => {
    if (!config(c.var.deps.env)) {
      const error = "Downloading from a dive computer isn't turned on"
      c.set("refusal", error)
      return c.json({ error }, 404)
    }
    await next()
  })
  .post("/dive-computer/detect", async (c) => {
    const found = await answer(c, () =>
      detect(c.var.deps.db, config(c.var.deps.env)!)
    )
    return found instanceof Response ? found : c.json(found)
  })
  .post("/dive-computer/download", json(downloadRequest), async (c) => {
    const { db, env } = c.var.deps
    const preview = await answer(c, () =>
      downloadDives(db, config(env)!, env.SHYLOG_DATA_DIR, c.req.valid("json"))
    )
    return preview instanceof Response ? preview : c.json({ preview })
  })
