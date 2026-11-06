import { z } from "zod"

import { idSchema, type DiveId } from "../ids.ts"
import { localDateTime } from "./common.ts"

// A computer dive is referred to by the export's own id, which is
// meaningful only within its preview.
export type ComputerDiveRef = string

// A day's clock offset in whole minutes, in steps of 15, no more than 14
// hours either way, which covers any two time zones a trip spans from home.
export const clockOffset = z.int().multipleOf(15).min(-840).max(840)

const day = z.iso.date()

export const computerDiveSchema = z.strictObject({
  ref: z.string().min(1),
  // The day the dive is reviewed under, fixed when the preview is made, so
  // changing a day's offset never moves a dive to another day.
  day,
  // On the computer's clock, and shifted by the day's offset to site time.
  computerStartTime: localDateTime,
  startTime: localDateTime,
  duration: z.int().positive(),
  maxDepth: z.number().positive(),
  averageDepth: z.number().positive().nullable(),
  minTemperature: z.number().nullable(),
  maxTemperature: z.number().nullable(),
  // The Log's 24-point sparkline, for the review's profile.
  profile: z.array(z.number()).nullable(),
  // Helium or under 20.9 % oxygen: imported on air, which the review says.
  unsupportedGas: z.boolean(),
})
export type ComputerDive = z.output<typeof computerDiveSchema>

export const importDaySchema = z.strictObject({
  date: day,
  // `offset` differs from the estimate only after an override.
  estimatedOffset: clockOffset,
  offset: clockOffset,
})
export type ImportDay = z.output<typeof importDaySchema>

export const importPreviewSchema = z.strictObject({
  id: idSchema("import"),
  basedOnVersion: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  // Null when the export names no computer, or more than one.
  computerModel: z.string().nullable(),
  days: z.array(importDaySchema),
  pairs: z.array(
    z.strictObject({
      computerDive: computerDiveSchema,
      diveId: idSchema("dive"),
    })
  ),
  newDives: z.array(computerDiveSchema),
  // Hand-logged dives on the export's days that no computer dive was paired
  // with, and how far, in seconds, the day's nearest computer dive starts.
  unpaired: z.array(
    z.strictObject({
      diveId: idSchema("dive"),
      day,
      nearestStartGap: z.int().nonnegative().nullable(),
    })
  ),
  // Freedives and dives under a minute, offered only to include.
  leftOut: z.array(
    computerDiveSchema.extend({ reason: z.enum(["freedive", "short"]) })
  ),
  alreadyImported: z.int().nonnegative(),
})
export type ImportPreview = z.output<typeof importPreviewSchema>

// `PATCH /api/import/:id`: null resets the day to the estimate.
export const importOffsetRequest = z.strictObject({
  date: day,
  offset: clockOffset.nullable(),
})
export type ImportOffsetRequest = z.output<typeof importOffsetRequest>

// `POST /api/import/:id/apply`, settled with apply. Computer dives in none
// of these lists are skipped and get no fingerprint.
export type ImportApplyRequest = {
  pairs: { computerDive: ComputerDiveRef; diveId: DiveId }[]
  add: ComputerDiveRef[]
  includeFreedives: ComputerDiveRef[]
}

export type ImportApplyResult =
  | {
      status: "applied"
      paired: number
      added: number
      alreadyImported: number
      freedivesLeftOut: number
      freedivesIncluded: number
      differing: DiveId[]
    }
  // Nothing is committed; the review asks again about these dives.
  | { status: "changed"; diveIds: DiveId[] }
