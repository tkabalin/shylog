import { months } from "@/format/dates"
import { depth, minutes, temperature } from "@/format/figures"

import { dives, fullMonths, percent, rate } from "../charts/parts"
import { plural } from "../records-card"
import type { Group, MeasureKey, Named, Words } from "./catalogue"

// Findings describe what the log shows, never why: "is higher in", never
// "because of". Figures are rounded as the rest of the app rounds them.

export type Averaged = "sac" | "maxDepth" | "duration" | "ascentAlarms"

// A measure's figure and unit, as a group's row shows it.
export function figure(measure: MeasureKey, value: number) {
  switch (measure) {
    case "sac":
      return { value: rate(value), unit: "L/min" }
    case "maxDepth":
      return { value: depth(value), unit: "m" }
    case "duration":
      return { value: minutes(value), unit: "min" }
    // "None" rather than "0.0 a dive".
    case "ascentAlarms":
      return value < 0.05
        ? { value: "none", unit: undefined }
        : { value: value.toFixed(1), unit: "a dive" }
    case "waterTemperature":
      return { value: temperature(value), unit: "°C" }
    default:
      throw new Error(`${measure} is a share`)
  }
}

// A figure as the groups show it, so a sentence's difference is the one
// between the figures under it: 20.4 against 16.1 is 4.3 m, not 4.4.
const shown = (measure: MeasureKey, value: number) =>
  Number(
    measure === "duration"
      ? minutes(value)
      : measure === "waterTemperature"
        ? Math.round(value * 10) / 10
        : value.toFixed(1)
  )

// A dive's value in the unit a chart's axis shows: minutes, not seconds.
export const inUnits = (measure: MeasureKey, value: number) =>
  measure === "duration" ? value / 60 : value

// The unit under a chart's axis.
export const axisUnit = (measure: Averaged) =>
  measure === "ascentAlarms" ? "alarms a dive" : figure(measure, 1).unit!

// A difference between two shown figures, in their units: minutes are
// already whole minutes here.
const amount = (measure: Averaged, difference: number) =>
  measure === "duration"
    ? `${Math.round(difference)} min`
    : `${difference.toFixed(1)} ${figure(measure, 1).unit}`

const compared: Record<Averaged, [string, string, string]> = {
  sac: ["Your SAC rate is ", "higher", "lower"],
  maxDepth: ["You dive ", "deeper", "shallower"],
  duration: ["Your dives are ", "longer", "shorter"],
  ascentAlarms: ["You get ", "more", "fewer"],
}

// "Your SAC rate is 3.9 L/min higher in moderate or stronger current."
export function differenceWords(
  measure: Averaged,
  [a, b]: [number, number],
  group: Named
): Words {
  const difference = shown(measure, a) - shown(measure, b)
  const [subject, more, less] = compared[measure]
  const size =
    measure === "ascentAlarms"
      ? `${Math.abs(difference).toFixed(1)} ${difference > 0 ? more : less} ascent alarms a dive`
      : `${amount(measure, Math.abs(difference))} ${difference > 0 ? more : less}`
  return [subject, size, ` ${group.phrase}.`]
}

// Each share's subject and the outcome it counts, which leads the bold:
// "You felt " "cold on all 6 dives".
const outcomes: Partial<Record<MeasureKey, [string, string]>> = {
  cold: ["You felt ", "cold"],
  lowVisibility: ["Visibility was ", "low"],
  highVisibility: ["Visibility was ", "high"],
  strongCurrent: ["The current was ", "moderate or stronger"],
  strongSurge: ["The surge was ", "moderate or stronger"],
  hardWorkload: ["Your workload was ", "moderate or harder"],
}

// A share as a sentence says it: "all 6", "none of the 6", "70%".
const portion = ({ count, total }: Share) =>
  count === total
    ? `all ${total}`
    : count
      ? percent(count, total)
      : `none of the ${total}`

// "You felt cold on 70% of dives in Simon's Town, against 20% elsewhere",
// "on all 6 dives in August", and "on 70% of dry suit dives, against 20%
// of other dives". The bold is the outcome with its share, so it reads on
// its own: "cold on all 6 dives".
export function shareWords(
  measure: MeasureKey,
  [a, b]: [Share, Share],
  [one, other]: [Named, Named]
): Words {
  const some = (share: Share) => share.count && share.count < share.total
  const versus = other.dives
    ? `${portion(b)} ${some(b) ? "of " : ""}${other.dives}`
    : `${b.count === b.total ? "all" : b.count ? percent(b.count, b.total) : "none"} ${other.phrase}`
  const [subject, outcome] = outcomes[measure]!
  return [
    subject,
    `${outcome} on ${portion(a)} ${some(a) ? "of " : ""}${one.dives ?? "dives"}`,
    `${one.dives ? "" : ` ${one.phrase}`}, against ${versus}.`,
  ]
}

export interface Share {
  count: number
  total: number
}

// "All 5 dives", "4 of 5 dives".
const of = (count: number, total: number) =>
  count === total ? `all ${total} dives` : `${count} of ${total} dives`

// "You felt cold on all 5 dives below 16 °C, and on none above 20 °C",
// the outcome with its cut-off in bold, as that is the finding.
export function thresholdWords(
  below: Share,
  above: Share,
  low: number,
  high: number
): Words {
  return [
    "You felt ",
    `cold on ${of(below.count, below.total)} below ${temperature(low)} °C`,
    `, and on ${
      above.count ? `${above.count} of ${above.total}` : "none"
    } above ${temperature(high)} °C.`,
  ]
}

const averaged: Record<Averaged, string> = {
  sac: "Your average SAC rate ",
  maxDepth: "Your average max depth ",
  duration: "Your average dive time ",
  ascentAlarms: "Ascent alarms ",
}

// The two periods a change compares: a year and the one before, or the
// later and earlier halves of the log.
export type Periods =
  { year: string; before: string } | { later: number; earlier: number }

// "Ascent alarms rose from 0.5 to 2.3 a dive over your last 21 dives
// against the 21 before", "Nitrox rose from none to 52% of dives in 2026
// against 2025": both figures in the bold, so it reads on its own.
export function changeWords(
  measure: MeasureKey,
  now: number,
  then: number,
  periods: Periods,
  shares?: [Share, Share]
): Words {
  const way = now > then ? "rose" : "fell"
  // Every or no dive says "all" or "none", as the other sentences do.
  const from = (s: Share) =>
    s.count === s.total ? "all" : s.count ? percent(s.count, s.total) : "none"
  const to = (s: Share) =>
    s.count === s.total
      ? "all dives"
      : s.count
        ? `${percent(s.count, s.total)} of dives`
        : "none"
  const span = shares
    ? `${way} from ${from(shares[1])} to ${to(shares[0])}`
    : `${way} from ${figure(measure, then).value} to ${unit(figure(measure, now))}`
  const subject = shares ? "Nitrox " : averaged[measure as Averaged]
  const tail =
    "year" in periods
      ? ` in ${periods.year} against ${periods.before}.`
      : ` over your last ${periods.later} dives against the ${periods.earlier} before.`
  return [subject, span, tail]
}

// A figure with its unit, or "none" alone.
const unit = ({ value, unit }: { value: string; unit?: string }) =>
  unit ? `${value} ${unit}` : value

const trended: Record<Averaged, string> = {
  sac: "Your SAC rate is ",
  maxDepth: "Your max depth is ",
  duration: "Your dive time is ",
  ascentAlarms: "Ascent alarms are ",
}

// "Your SAC rate is down 2.9 L/min since January", from the line's two
// ends as the groups show them, so the figures agree. The month alone in a
// year, as the year is on the screen; with its year for all time.
export function trendWords(
  measure: Averaged,
  start: number,
  end: number,
  since: string,
  year: string | undefined
): Words {
  const change = shown(measure, end) - shown(measure, start)
  const size = amount(measure, Math.abs(change))
  const month = Number(since.slice(5, 7)) - 1
  return [
    trended[measure],
    `${change > 0 ? "up" : "down"} ${size}`,
    ` since ${year ? fullMonths[month] : `${months[month]} ${since.slice(0, 4)}`}.`,
  ]
}

// "70% of your dives are at Castle Rock", "Sam is on 60% of your dives".
export function habitWords(field: string, value: string, share: Share): Words {
  const part = `${percent(share.count, share.total)} of your dives`
  switch (field) {
    case "site":
      return ["", part, ` are at ${value}.`]
    case "region":
      return ["", part, ` are in ${value}.`]
    case "diveCentre":
      return ["", part, ` are with ${value}.`]
    default:
      return [`${value} is on `, part, "."]
  }
}

// "Simon's Town is 4 °C warmer in March than in August."
export function seasonWords(
  region: string,
  [high, low]: [number, number],
  warm: string,
  cold: string
): Words {
  const difference =
    shown("waterTemperature", high) - shown("waterTemperature", low)
  return [
    `${region} is `,
    `${temperature(difference)} °C warmer`,
    ` in ${warm} than in ${cold}.`,
  ]
}

// "3 Feb 2020", the month short as the anniversary has it.
export const shortDay = (date: string) =>
  `${Number(date.slice(8, 10))} ${months[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`

// A group's row: its name, how many dives, and its figure.
export const groupRow = (
  label: string,
  count: number,
  value: string,
  unit?: string
): Group => ({ label, detail: dives(count), value, unit })

// The records All patterns lists, which never reach the top three: only
// those the Records and averages card doesn't already show.
export const recordWords = {
  // A month as YYYY-MM.
  month: (month: string, count: number): Words => [
    "Your busiest month was ",
    `${fullMonths[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`,
    `, with ${dives(count)}.`,
  ],
  gap: (days: number, from: string, to: string): Words => [
    "Your longest gap between dives was ",
    gapLength(days, from, to),
    `, from ${shortDay(from)} to ${shortDay(to)}.`,
  ],
}

const counted = (n: number, word: string) => `${n} ${plural(n, word)}`

// Days up to about two months, then whole months and years by the calendar,
// as the anniversary counts them: "12 days", "5 months", "6 years 2 months".
function gapLength(days: number, from: string, to: string) {
  if (days < 60) return counted(days, "day")
  const [y0, m0, d0] = from.split("-").map(Number) as [number, number, number]
  const [y1, m1, d1] = to.split("-").map(Number) as [number, number, number]
  const months = (y1 - y0) * 12 + (m1 - m0) - (d1 < d0 ? 1 : 0)
  const years = Math.floor(months / 12)
  return [
    years && counted(years, "year"),
    months % 12 && counted(months % 12, "month"),
  ]
    .filter(Boolean)
    .join(" ")
}
