import { toMillimetres } from "@shylog/core"

import type { Dive } from "@/data/db"

// The spec's ladder (Records and milestones), ascending, so a rung can be
// added without touching the logic. Names read after "You've descended".
export const landmarks = [
  { name: "the Leaning Tower of Pisa", height: 56 },
  { name: "the Statue of Liberty", height: 93 },
  { name: "the Great Pyramid of Giza", height: 139 },
  { name: "the Eiffel Tower", height: 330 },
  { name: "Lion's Head", height: 669 },
  { name: "the Burj Khalifa", height: 828 },
  { name: "Table Mountain", height: 1085 },
  { name: "Boskloof Pinnacle", height: 1159 },
  { name: "Middelberg-Noord", height: 1516 },
  { name: "Klein Krakadouw", height: 1619 },
  { name: "Middle Krakadouw", height: 1650 },
  { name: "Groot Krakadouw", height: 1744 },
  { name: "Sneeukop", height: 1929 },
  { name: "Tafelberg", height: 1969 },
  { name: "Sneeuberg", height: 2026 },
  { name: "Matroosberg", height: 2249 },
  { name: "Seweweekspoort Peak", height: 2325 },
  { name: "Mafadi", height: 3450 },
  { name: "Kilimanjaro", height: 5895 },
  { name: "Mount Everest", height: 8849 },
  { name: "the Mariana Trench", height: 10935 },
  { name: "Olympus Mons", height: 21900 },
  { name: "the Kármán line", height: 100000 },
] as const

const timesText = (times: number) =>
  times === 1 ? "" : times === 2 ? " twice" : ` ${times} times`

// At most 99 %, so it never says 100 % before the rung is passed.
const share = (part: number, whole: number) =>
  `${Math.min(99, Math.round((part / whole) * 100))}%`

// Total depth descended in metres, worded against the ladder: the tallest
// rung passed in whole times, then progress to the next. Past the last rung
// the progress is to its next whole time, so something is always ahead.
export function descended(metres: number) {
  const passed = landmarks.findLast((rung) => metres >= rung.height)
  if (!passed) {
    const first = landmarks[0]
    return {
      headline: `You've descended ${share(metres, first.height)} of ${first.name}`,
      progress: null,
    }
  }
  const times = Math.floor(metres / passed.height)
  const next = landmarks[landmarks.indexOf(passed) + 1]
  return {
    headline: `You've descended ${passed.name}${timesText(times)}`,
    progress: next
      ? `${share(metres, next.height)} of the way to ${next.name}`
      : `${share(metres - times * passed.height, passed.height)} of the way to${timesText(times + 1)}`,
  }
}

// Summed in whole mm, so a long log's total has no float noise.
export const depthDescended = (dives: readonly Dive[]) =>
  dives.reduce((sum, dive) => sum + toMillimetres(dive.maxDepth), 0) / 1000

// Days since 1970-01-01 for a local date, with no time zone involved.
const dayNumber = (date: string) =>
  Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10))
  ) / 86_400_000

// Weeks run Monday to Sunday; 1 January 1970 was a Thursday.
const weekNumber = (day: number) => Math.floor((day + 3) / 7)

export interface Streak {
  length: number
  // Local dates of its first and last dive.
  first: string
  last: string
  // It can still grow: the last diving day was today or yesterday, or the
  // last week this one or the one before.
  running: boolean
}

function longestRun(
  units: { unit: number; date: string }[],
  current: number
): Streak | null {
  let best: Streak | null = null
  let start = 0
  for (let i = 0; i < units.length; i++) {
    if (i > 0 && units[i]!.unit !== units[i - 1]!.unit + 1) start = i
    const length = i - start + 1
    // Strictly longer, so on a tie the earlier streak holds the record.
    if (!best || length > best.length)
      best = {
        length,
        first: units[start]!.date,
        last: units[i]!.date,
        running: units[i]!.unit >= current - 1,
      }
  }
  return best
}

// Several dives on one day count once, by local start date.
export function streaks(dives: readonly Dive[], today: string) {
  const days = [...new Set(dives.map((dive) => dive.startTime.slice(0, 10)))]
    .sort()
    .map((date) => ({ date, day: dayNumber(date) }))
  const weeks: { unit: number; first: string; date: string }[] = []
  for (const { date, day } of days) {
    const week = weekNumber(day)
    const last = weeks.at(-1)
    if (last?.unit === week) last.date = date
    else weeks.push({ unit: week, first: date, date })
  }
  const weekRun = longestRun(weeks, weekNumber(dayNumber(today)))
  return {
    days: longestRun(
      days.map(({ date, day }) => ({ unit: day, date })),
      dayNumber(today)
    ),
    // From the first dive of its first week, not that week's last.
    weeks: weekRun && {
      ...weekRun,
      first: weeks.find((week) => week.date === weekRun.first)!.first,
    },
  }
}

// Whole years since the first dive, or months under a year, from the whole
// log whatever the year filter. Dates are compared as local dates.
export function anniversary(dives: readonly Dive[], today: string) {
  const first = dives.reduce<string | null>(
    (min, dive) =>
      min == null || dive.startTime < min ? dive.startTime.slice(0, 10) : min,
    null
  )
  if (!first) return null
  const [y0, m0, d0] = first.split("-").map(Number) as [number, number, number]
  const [y1, m1, d1] = today.split("-").map(Number) as [number, number, number]
  // A phone clock behind the first dive reads as no time at all.
  const months = Math.max(0, (y1 - y0) * 12 + (m1 - m0) - (d1 < d0 ? 1 : 0))
  const years = Math.floor(months / 12)
  const onTheDay = years > 0 && m0 === m1 && d0 === d1
  return { first, years, months, onTheDay }
}
