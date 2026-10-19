import type { DiveId } from "../ids.ts"

// Types only: the Import step settles and validates these once the server
// builds previews. A computer dive is referred to by the export's own id,
// which is meaningful only within its preview.
export type ComputerDiveRef = string

export type ComputerDive = {
  ref: ComputerDiveRef
  // On the computer's clock, and shifted by the day's offset to site time.
  computerStartTime: string
  startTime: string
  duration: number
  maxDepth: number
  averageDepth: number | null
}

export type ImportDay = {
  date: string
  // Whole minutes in steps of 15; `offset` differs from the estimate only
  // after an override.
  estimatedOffset: number
  offset: number
}

export type ImportPreview = {
  id: string
  basedOnVersion: string
  expiresAt: string
  computerModel: string | null
  days: ImportDay[]
  pairs: { computerDive: ComputerDive; diveId: DiveId }[]
  newDives: ComputerDive[]
  // Hand-logged dives no computer dive was paired with.
  unpaired: { diveId: DiveId; nearestStartGap: number | null }[]
  freedives: ComputerDive[]
  alreadyImported: number
}

// `PATCH /api/import/:id`: null resets the day to the estimate.
export type ImportOffsetRequest = { date: string; offset: number | null }

// `POST /api/import/:id/apply`. Computer dives in none of these lists are
// skipped and get no fingerprint.
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
