import {
  computerAir,
  gasDiffers,
  type ComparedField,
  type ComputerDive,
} from "@shylog/core"

import type { Dive } from "@/data/db"
import { comparedText } from "@/dive/form/values"
import { clockTime } from "@/format/dates"
import { depth, gasDetail, minutes, temperatureRange } from "@/format/figures"

// One line of ChangePairingHifi's Compare table: the hand value, the
// computer's, and whether they differ as the dive form would flag them.
export interface CompareRow {
  key: "start" | "maxDepth" | "averageDepth" | "duration" | "water" | "gas"
  label: string
  mine: string
  theirs: string
  differs: boolean
}

const none = "—"

const gasOf = (dive: Pick<Dive, "nitrox" | "oxygen">) =>
  dive.nitrox ? gasDetail(dive.oxygen ?? null) : gasDetail(null)

// Differ as the dive form shows them, so the review flags what the form
// will (a hand 32.7 against the computer's 32.66 reads the same).
const formText = (field: ComparedField, value: number | null | undefined) =>
  value == null ? null : comparedText(field, value)

export function compareRows(
  computer: ComputerDive,
  hand: Dive | undefined
): CompareRow[] {
  const row = (
    key: CompareRow["key"],
    label: string,
    mine: string | null,
    theirs: string | null,
    differs: boolean
  ): CompareRow => ({
    key,
    label,
    mine: mine ?? none,
    theirs: theirs ?? none,
    differs,
  })
  // Only where both have a value: an empty hand field is filled, not
  // flagged.
  const differs = (
    field: ComparedField,
    mine: number | null | undefined,
    theirs: number | null | undefined
  ) => {
    const [a, b] = [formText(field, mine), formText(field, theirs)]
    return a != null && b != null && a !== b
  }
  const handDepth = (value: number | null | undefined) =>
    value == null ? null : `${depth(value)} m`
  return [
    row(
      "start",
      "Start",
      hand ? clockTime(hand.startTime) : null,
      clockTime(computer.startTime),
      !!hand && hand.startTime.slice(0, 16) !== computer.startTime.slice(0, 16)
    ),
    row(
      "maxDepth",
      "Max depth",
      handDepth(hand?.maxDepth),
      handDepth(computer.maxDepth),
      differs("maxDepth", hand?.maxDepth, computer.maxDepth)
    ),
    row(
      "averageDepth",
      "Avg depth",
      handDepth(hand?.averageDepth),
      handDepth(computer.averageDepth),
      differs("averageDepth", hand?.averageDepth, computer.averageDepth)
    ),
    row(
      "duration",
      "Duration",
      hand ? `${minutes(hand.duration)} min` : null,
      `${minutes(computer.duration)} min`,
      differs("duration", hand?.duration, computer.duration)
    ),
    row(
      "water",
      "Water",
      hand ? rangeText(hand.minTemperature, hand.maxTemperature) : null,
      rangeText(computer.minTemperature, computer.maxTemperature),
      differs(
        "minTemperature",
        hand?.minTemperature,
        computer.minTemperature
      ) ||
        differs("maxTemperature", hand?.maxTemperature, computer.maxTemperature)
    ),
    row(
      "gas",
      "Gas",
      hand ? gasOf(hand) : null,
      // A preview stored before the review showed the gas doesn't have it.
      computer.oxygen === undefined ? null : gasDetail(computer.oxygen),
      // At the computer's whole per cent, as the import compares it. A
      // hand Nitrox no takes the computer's nitrox instead of being flagged,
      // and an unsupported gas, stored as air, is never compared.
      !!hand &&
        computer.oxygen !== undefined &&
        !computer.unsupportedGas &&
        !takesComputerGas(computer, hand) &&
        gasDiffers(
          { nitrox: hand.nitrox, oxygen: hand.oxygen ?? undefined },
          computer.oxygen ?? computerAir
        )
    ),
  ]
}

const rangeText = (min?: number | null, max?: number | null) => {
  const text = temperatureRange(min ?? null, max ?? null)
  return text && `${text} °C`
}

// The computer's nitrox replaces a hand Nitrox no on import, so the review
// says so rather than "your values are kept".
export const takesComputerGas = (computer: ComputerDive, hand: Dive) =>
  !hand.nitrox && computer.oxygen != null
