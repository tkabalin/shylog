import { packingSchema } from "@shylog/core"

import { putPacking } from "../apply/packing.ts"
import { factory } from "../factory.ts"
import { json } from "../validate.ts"
import { change } from "./change.ts"

export const packing = factory
  .createApp()
  .put("/packing", json(packingSchema), (c) => {
    const { db } = c.var.deps
    const sent = c.req.valid("json")
    return c.json(
      change(
        db,
        () => putPacking(db, sent),
        { type: "putPacking", payload: sent },
        false
      )
    )
  })
