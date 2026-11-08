import {
  likelySame,
  type ComputerDive,
  type DiveId,
  type ImportApplyRequest,
  type ImportPreview,
} from "@shylog/core"

import type { Dive } from "@/data/db"
import { computerName } from "@/dive/form/values"

import { keyFields, type CompareKey } from "./compare"

// The review of a preview (ImportReviewHifi): the choices the diver makes
// on the phone, sent with apply, over what the server proposed.

// What happens to one computer dive. For a left-out dive (a freedive or a
// dive under five minutes) add means include it, and skip leaves it out,
// which the server fingerprints so it isn't offered again.
export type Choice =
  { kind: "pair"; diveId: DiveId } | { kind: "add" } | { kind: "skip" }

export type Overrides = Record<string, Choice>

export type LeftOutReason = "freedive" | "short"

export interface Entry {
  dive: ComputerDive
  reason: LeftOutReason | null
}

// A paired computer dive under five minutes is a blip again once unpaired,
// as the server treats it.
const shortDive = 5 * 60

// Every computer dive the review offers, by its ref, newest first, as the
// Log lists dives.
export function entries(preview: ImportPreview) {
  const all: Entry[] = [
    ...preview.pairs.map(({ computerDive }) => ({
      dive: computerDive,
      reason: computerDive.duration < shortDive ? ("short" as const) : null,
    })),
    ...preview.newDives.map((dive) => ({ dive, reason: null })),
    ...preview.leftOut.map(({ reason, ...dive }) => ({ dive, reason })),
  ].sort((a, b) => b.dive.startTime.localeCompare(a.dive.startTime))
  return new Map(all.map((entry) => [entry.dive.ref, entry]))
}

function proposed(preview: ImportPreview) {
  const choices = new Map<string, Choice>()
  for (const { computerDive, diveId } of preview.pairs)
    choices.set(computerDive.ref, { kind: "pair", diveId })
  for (const dive of preview.newDives) choices.set(dive.ref, { kind: "add" })
  for (const dive of preview.leftOut) choices.set(dive.ref, { kind: "skip" })
  return choices
}

// The proposal with the diver's changes over it. A hand dive the diver
// paired wins over a proposed pair with it, whichever way the proposal
// changed since, so no dive is ever paired twice.
export function choicesOf(preview: ImportPreview, overrides: Overrides) {
  const choices = proposed(preview)
  const picked = new Set<string>()
  for (const [ref, choice] of Object.entries(overrides))
    if (choices.has(ref)) {
      choices.set(ref, choice)
      if (choice.kind === "pair") picked.add(choice.diveId)
    }
  const all = entries(preview)
  for (const [ref, choice] of choices)
    if (
      choice.kind === "pair" &&
      !(ref in overrides) &&
      picked.has(choice.diveId)
    )
      choices.set(ref, unpairedChoice(all.get(ref)!))
  return choices
}

// What a computer dive does once it no longer pairs: a scuba dive is added,
// as the review ticks new dives, and a blip is left out.
function unpairedChoice(entry: Entry): Choice {
  return entry.reason ? { kind: "skip" } : { kind: "add" }
}

// Sets one computer dive's choice. Pairing it with a dive another computer
// dive had takes that dive from it, as Change pairing warns.
export function choose(
  preview: ImportPreview,
  overrides: Overrides,
  ref: string,
  choice: Choice
): Overrides {
  const all = entries(preview)
  const next = { ...overrides, [ref]: choice }
  if (choice.kind === "pair") {
    for (const [other, current] of choicesOf(preview, overrides)) {
      if (
        other !== ref &&
        current.kind === "pair" &&
        current.diveId === choice.diveId
      )
        next[other] = unpairedChoice(all.get(other)!)
    }
  }
  return next
}

// Pairs a hand-logged dive from its own pairing screen, or with null
// leaves it unpaired, its computer dive added as new or left out.
export function chooseFor(
  preview: ImportPreview,
  overrides: Overrides,
  diveId: DiveId,
  ref: string | null
): Overrides {
  if (ref) return choose(preview, overrides, ref, { kind: "pair", diveId })
  const current = pairedWith(preview, overrides, diveId)
  if (!current) return overrides
  return {
    ...overrides,
    [current]: unpairedChoice(entries(preview).get(current)!),
  }
}

// The computer dive a hand-logged dive is paired with now, if any.
export function pairedWith(
  preview: ImportPreview,
  overrides: Overrides,
  diveId: string
) {
  for (const [ref, choice] of choicesOf(preview, overrides))
    if (choice.kind === "pair" && choice.diveId === diveId) return ref
  return null
}

// The hand-logged dives the preview read on the export's days (paired or
// listed), by the day each is reviewed under.
export function handDays(preview: ImportPreview) {
  const days = new Map<DiveId, string>()
  for (const { computerDive, diveId } of preview.pairs)
    days.set(diveId, computerDive.day)
  for (const { diveId, day } of preview.unpaired) days.set(diveId, day)
  return days
}

const seconds = (time: string) => Date.parse(`${time}Z`) / 1000

// How far apart two starts are: "12 min", "3 h", "3 h 24 min".
export function gapText(gap: number) {
  const minutes = Math.round(gap / 60)
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`
}

export interface Review {
  // Hand-logged dives no computer dive pairs with, and how far the day's
  // nearest computer dive starts from each.
  notPaired: { diveId: DiveId; day: string; gap: number | null }[]
  newDives: { entry: Entry; added: boolean }[]
  paired: { entry: Entry; diveId: DiveId }[]
  leftOut: { entry: Entry; included: boolean }[]
  counts: {
    paired: number
    added: number
    included: number
    skipped: number
    // What the button imports: paired, added and included dives.
    total: number
  }
}

export function review(
  preview: ImportPreview,
  overrides: Overrides,
  hands: ReadonlyMap<string, Pick<Dive, "startTime">>
): Review {
  const all = entries(preview)
  const choices = choicesOf(preview, overrides)
  const result: Review = {
    notPaired: [],
    newDives: [],
    paired: [],
    leftOut: [],
    counts: { paired: 0, added: 0, included: 0, skipped: 0, total: 0 },
  }
  const taken = new Set<string>()
  for (const [ref, entry] of all) {
    const choice = choices.get(ref)!
    if (choice.kind === "pair") {
      result.paired.push({ entry, diveId: choice.diveId })
      taken.add(choice.diveId)
      result.counts.paired++
    } else if (entry.reason) {
      const included = choice.kind === "add"
      result.leftOut.push({ entry, included })
      if (included) result.counts.included++
    } else {
      const added = choice.kind === "add"
      result.newDives.push({ entry, added })
      if (added) result.counts.added++
      else result.counts.skipped++
    }
  }
  const counts = result.counts
  counts.total = counts.paired + counts.added + counts.included

  for (const [diveId, day] of handDays(preview)) {
    if (taken.has(diveId)) continue
    const start = hands.get(diveId)?.startTime
    const gaps = [...all.values()]
      .filter((entry) => entry.dive.day === day)
      .map((entry) =>
        start == null
          ? Infinity
          : Math.abs(seconds(entry.dive.startTime) - seconds(start))
      )
    const gap = Math.min(...gaps)
    result.notPaired.push({
      diveId,
      day,
      gap: Number.isFinite(gap) ? gap : null,
    })
  }
  result.notPaired.sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      (hands.get(b.diveId)?.startTime ?? "").localeCompare(
        hands.get(a.diveId)?.startTime ?? ""
      )
  )
  return result
}

// `POST /api/import/:id/apply`'s body for the review as it stands.
export function applyRequest(
  preview: ImportPreview,
  overrides: Overrides,
  adopt: readonly CompareKey[] = []
): ImportApplyRequest {
  const request: ImportApplyRequest = {
    revision: preview.revision,
    pairs: [],
    add: [],
    include: [],
    adopt: adopt.flatMap((key) => keyFields[key]),
  }
  const all = entries(preview)
  for (const [ref, choice] of choicesOf(preview, overrides)) {
    if (choice.kind === "pair")
      request.pairs.push({ computerDive: ref, diveId: choice.diveId })
    else if (choice.kind === "add")
      (all.get(ref)!.reason ? request.include : request.add).push(ref)
  }
  return request
}

// Why a pairing made by hand may be wrong: dives on different days, or
// two that fail Subsurface's same-dive test once the clock is shifted.
export function pairWarning(
  entry: Entry,
  hand: Pick<Dive, "startTime" | "duration" | "maxDepth" | "averageDepth">
) {
  const kept = "Your values are kept either way."
  if (hand.startTime.slice(0, 10) !== entry.dive.day)
    return `These are on different days. ${kept}`
  const { startTime, duration, maxDepth, averageDepth } = entry.dive
  if (
    likelySame(
      { startTime, duration, maxDepth, averageDepth },
      {
        startTime: hand.startTime,
        duration: hand.duration,
        maxDepth: hand.maxDepth,
        averageDepth: hand.averageDepth ?? null,
      }
    )
  )
    return null
  const gap = Math.abs(seconds(startTime) - seconds(hand.startTime))
  return gap >= 60 * 60
    ? `These start ${gapText(gap)} apart and look like different dives. ${kept}`
    : `These look like different dives. ${kept}`
}

// "your D4i", "your Zoop Novo", or "your dive computer" when the export
// names none (see For a matched dive).
export const yourComputer = (preview: Pick<ImportPreview, "computerModel">) =>
  `your ${computerName(preview.computerModel)}`

// A computer's name opening a line or heading: "D4i", "Dive computer".
export const capital = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

// The clock sheet's steps: 15 minutes, no more than 14 hours either way.
const step = 15
const limit = 14 * 60

export const stepOffset = (offset: number, direction: 1 | -1) =>
  Math.max(-limit, Math.min(limit, offset + direction * step))

// "+5:00", "−1:15", "0:00".
export function offsetText(offset: number) {
  if (offset === 0) return "0:00"
  const size = Math.abs(offset)
  const minutes = String(size % 60).padStart(2, "0")
  return `${offset < 0 ? "−" : "+"}${Math.floor(size / 60)}:${minutes}`
}

// The clock sheet's line for one day: how many of its hand-logged dives
// pair now, and its reset, back to the estimate.
export function clockDay(
  preview: ImportPreview,
  overrides: Overrides,
  date: string
) {
  const day = preview.days.find((found) => found.date === date)!
  const hands = [...handDays(preview)]
    .filter(([, handDay]) => handDay === date)
    .map(([diveId]) => diveId)
  const pairedIds = new Set<string>()
  for (const choice of choicesOf(preview, overrides).values())
    if (choice.kind === "pair") pairedIds.add(choice.diveId)
  const paired = hands.filter((diveId) => pairedIds.has(diveId)).length
  return {
    offset: day.offset,
    pairLine: hands.length
      ? `${paired} of ${hands.length} logged ${hands.length === 1 ? "dive" : "dives"} paired`
      : "No logged dives this day",
    allPaired: paired === hands.length,
    reset:
      day.offset === day.estimatedOffset
        ? null
        : day.estimatedOffset
          ? `Use ${offsetText(day.estimatedOffset)}`
          : "Reset",
  }
}

// The day the review's clock link opens: the newest whose logged dives
// didn't all pair, else the newest with logged dives, as the clock only
// matters for pairing, else the newest. Newest is the top of every list.
export function firstDayToCheck(preview: ImportPreview, current: Review) {
  const unpaired = current.notPaired.map((hand) => hand.day).sort()
  const logged = [...handDays(preview).values()].sort()
  return unpaired.at(-1) ?? logged.at(-1) ?? preview.days.at(-1)?.date ?? null
}

// After the server proposes some days again (a clock change, or dives
// changed since the preview), the diver's choices on those days give way
// to the new proposal; the rest stay.
export function carryOver(
  preview: ImportPreview,
  overrides: Overrides,
  days: ReadonlySet<string>,
  pairable: (diveId: string) => boolean
): Overrides {
  const all = entries(preview)
  // A hand dive the new proposal pairs gives way too, even to a pick made
  // on another day, or apply would get it paired twice.
  const proposedHands = new Set(
    preview.pairs
      .filter(({ computerDive }) => days.has(computerDive.day))
      .map(({ diveId }) => diveId as string)
  )
  return Object.fromEntries(
    Object.entries(overrides).filter(([ref, choice]) => {
      const entry = all.get(ref)
      if (!entry || days.has(entry.dive.day)) return false
      if (choice.kind !== "pair") return true
      // A pair with a dive since deleted or given a computer dive goes too.
      return pairable(choice.diveId) && !proposedHands.has(choice.diveId)
    })
  )
}
