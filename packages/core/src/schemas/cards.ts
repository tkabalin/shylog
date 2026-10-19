import { z } from "zod"

import { name } from "./common.ts"

// The images travel as multipart files beside these fields, in page order.
export const cardFieldsSchema = z.strictObject({ name })
export type CardFields = z.output<typeof cardFieldsSchema>

export const cardImageTypes = ["image/png", "image/jpeg", "image/webp"] as const
export const cardImageMaxBytes = 10 * 1024 * 1024
