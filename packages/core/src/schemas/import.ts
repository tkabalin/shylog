import { z } from "zod"

import { idSchema, type DiveId } from "../ids.ts"
import { localDateTime } from "./common.ts"
import { comparedFields } from "./dive.ts"

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
  // Tenths of a per cent of a nitrox mix, null for air, for the review's
  // comparison, and the site the file names, null for the Unknown site.
  // Absent from previews stored before the review showed them.
  oxygen: z.int().nullable().optional(),
  site: z.string().nullable().optional(),
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

export const leftOutReason = z.enum(["freedive", "short", "earlier"])
export type LeftOutReason = z.output<typeof leftOutReason>

// Under five minutes is a blip, such as a weight check or the swim back:
// the owner's shortest real dive is 15 minutes, the longest blip 3.
export const isShort = (duration: number) => duration < 5 * 60

// Why a computer dive that isn't a freedive is left out unless paired:
// from before the last download, or a blip.
export function unpairedReason(
  dive: Pick<ComputerDive, "computerStartTime" | "duration">,
  earlierThan: string | null | undefined
): LeftOutReason | null {
  if (earlierThan && dive.computerStartTime < earlierThan) return "earlier"
  return isShort(dive.duration) ? "short" : null
}

// "Suunto D4i" → "D4i": screens name the computer by its model (see For a
// matched dive), or "dive computer" when the export gives none.
export const computerName = (model: string | null) =>
  model ? model.replace(/^Suunto\s+/i, "") : "dive computer"

export const importPreviewSchema = z.strictObject({
  id: idSchema("import"),
  basedOnVersion: z.string(),
  // Counts each time days are proposed again, so apply can tell choices made
  // on an earlier proposal.
  revision: z.int().nonnegative(),
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
  // Freedives, dives under five minutes and, from a download that read
  // every dive, those before the last one, offered only to include.
  leftOut: z.array(computerDiveSchema.extend({ reason: leftOutReason })),
  alreadyImported: z.int().nonnegative(),
  // From a download: the start, on the watch's clock, of the newest dive
  // an earlier download (or import) brought in, or null for none. Dives
  // before it are left out, as they are someone else's or were skipped.
  earlierThan: localDateTime.nullable().optional(),
})
export type ImportPreview = z.output<typeof importPreviewSchema>

// Every computer dive the file held, imported before or not.
export const fileDives = (
  preview: Pick<
    ImportPreview,
    "pairs" | "newDives" | "leftOut" | "alreadyImported"
  >
) =>
  preview.pairs.length +
  preview.newDives.length +
  preview.leftOut.length +
  preview.alreadyImported

// What an applied file held, for the Import screen: its computer dives, the
// days they span (null when every one was imported before), and its model.
export function importFile(
  preview: Pick<
    ImportPreview,
    | "pairs"
    | "newDives"
    | "leftOut"
    | "alreadyImported"
    | "days"
    | "computerModel"
  >
) {
  const days = preview.days.map((day) => day.date).sort()
  return {
    dives: fileDives(preview),
    from: days[0] ?? null,
    to: days.at(-1) ?? null,
    computerModel: preview.computerModel,
  }
}

// `PATCH /api/import/:id`: null resets the day to the estimate.
export const importOffsetRequest = z.strictObject({
  date: day,
  offset: clockOffset.nullable(),
})
export type ImportOffsetRequest = z.output<typeof importOffsetRequest>

// `POST /api/import/:id/apply`. Computer dives in none of these lists are
// skipped and get no fingerprint; `include` takes left-out dives (freedives
// and dives under five minutes) as new dives. A dive is named once.
export const importApplyRequest = z
  .strictObject({
    // The preview's revision the choices were made on.
    revision: z.int().nonnegative(),
    pairs: z.array(
      z.strictObject({
        computerDive: z.string().min(1),
        diveId: idSchema("dive"),
      })
    ),
    add: z.array(z.string().min(1)),
    include: z.array(z.string().min(1)),
    // Values to take from the computer on every paired dive where they
    // differ. An app from before the review offered this sends none.
    adopt: z.array(z.enum(comparedFields)).default([]),
  })
  .superRefine((request, ctx) => {
    if (new Set(request.adopt).size !== request.adopt.length) {
      ctx.addIssue({
        code: "custom",
        message: "A value to adopt is named more than once",
        path: ["adopt"],
      })
    }
    const refs = [
      ...request.pairs.map((pair) => pair.computerDive),
      ...request.add,
      ...request.include,
    ]
    if (new Set(refs).size !== refs.length) {
      ctx.addIssue({
        code: "custom",
        message: "A computer dive is named more than once",
      })
    }
    const dives = request.pairs.map((pair) => pair.diveId)
    if (new Set(dives).size !== dives.length) {
      ctx.addIssue({
        code: "custom",
        message: "A logged dive is paired more than once",
        path: ["pairs"],
      })
    }
  })
export type ImportApplyRequest = z.output<typeof importApplyRequest>

// What an import did (see Summary in the spec), and the paired dives whose
// computer values differ from the hand ones.
export interface ImportSummary {
  paired: number
  added: number
  alreadyImported: number
  leftOut: number
  included: number
  differing: DiveId[]
}

export type ImportApplyResult =
  | ({ status: "applied" } & ImportSummary)
  // Nothing is committed; those days were proposed again, so the review
  // asks about these dives once more. None are named when the choices were
  // made on an older proposal, such as before a day's clock was moved.
  | { status: "changed"; diveIds: DiveId[] }
  // A chunk failed: the ones before it stay, and a retry carries on.
  | { status: "failed"; error: string; applied: ImportSummary }
