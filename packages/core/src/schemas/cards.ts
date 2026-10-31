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
export const cardImageMaxBytes = 10 * 1024 * 1024
// Agency eCards are a page or two; the cap bounds what one upload holds in
// memory.
export const cardMaxPages = 10
