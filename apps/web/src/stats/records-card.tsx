import type { ComponentType, ReactNode } from "react"
import {
  IconArrowBarToDown,
  IconCake,
  IconClock,
  IconFlame,
  IconMountain,
  IconTemperature,
  IconTemperatureMinus,
  IconTemperaturePlus,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"
import { months } from "@/format/dates"
import { depth, minutes, temperature } from "@/format/figures"

import type { Statistics } from "./figures"
import { fullMonths } from "./charts/parts"
import type { Streak } from "./records"

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

// A figure as StatsHifi's .fig sets it: a small label over the value, its
// unit muted, and a caption under it.
function Figure({
  term,
  icon: Icon,
  value,
  unit,
  caption,
  dive,
  wide,
}: {
  term: string
  icon: Icon
  value: ReactNode
  unit?: string
  caption?: ReactNode
  // The record's dive, which the whole cell opens.
  dive?: Dive
  wide?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3.5",
        wide && "col-span-2",
        // The caption's link covers the cell, so the whole figure opens
        // the dive and the cell tints while it is held, with no link menu.
        dive &&
          "relative transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-muted/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-focus-visible:ring-inset has-data-press:bg-muted has-data-press:duration-0"
      )}
    >
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-[1.15em] shrink-0" />
        {term}
      </dt>
      {/* Over its label, as the board sets it, while dt comes first. */}
      <dd className="order-first text-lg leading-[22px] font-semibold tracking-[-0.02em] tabular-nums">
        {value}
        {unit && (
          <span className="ml-0.5 text-[13px] font-medium tracking-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </dd>
      {caption && (
        <dd
          className={cn(
            "mt-1 min-w-0 text-xs text-muted-foreground/80",
            // A dive's name is cut short; a date range wraps, so a running
            // streak always says so.
            dive ? "truncate" : "text-pretty"
          )}
        >
          {dive ? (
            // One level deeper, with Statistics behind it for Back.
            <Link
              to="/dive/$diveId"
              params={{ diveId: dive.id }}
              state={{ pushed: true, fromStats: true }}
              className="outline-none after:absolute after:inset-0"
            >
              {caption}
            </Link>
          ) : (
            caption
          )}
        </dd>
      )}
    </div>
  )
}

const shortDate = (date: string) =>
  `${Number(date.slice(8, 10))} ${months[Number(date.slice(5, 7)) - 1]}`

// "17–22 Jul 2026", "28 Jun – 3 Jul 2026", "28 Dec 2025 – 3 Jan 2026".
export function dateRange(first: string, last: string) {
  const year = last.slice(0, 4)
  if (first === last) return `${shortDate(first)} ${year}`
  if (first.slice(0, 7) === last.slice(0, 7))
    return `${Number(first.slice(8, 10))}–${shortDate(last)} ${year}`
  if (first.slice(0, 4) === year)
    return `${shortDate(first)} – ${shortDate(last)} ${year}`
  return `${shortDate(first)} ${first.slice(0, 4)} – ${shortDate(last)} ${year}`
}

const longDay = (date: string) =>
  `${Number(date.slice(8, 10))} ${fullMonths[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`)

function streakFigures(days: Streak | null, weeks: Streak | null) {
  const shown = [
    { streak: days, term: "Days in a row", unit: "day" },
    { streak: weeks, term: "Weeks in a row", unit: "week" },
  ].filter(
    (row): row is typeof row & { streak: Streak } =>
      !!row.streak && row.streak.length > 1
  )
  return shown.map(({ streak, term, unit }) => (
    <Figure
      key={term}
      wide={shown.length === 1}
      term={term}
      icon={IconFlame}
      value={streak.length}
      unit={plural(streak.length, unit)}
      caption={streakCaption(streak)}
    />
  ))
}

function streakCaption(streak: Streak) {
  const range = dateRange(streak.first, streak.last)
  return streak.running ? `${range}, running` : range
}

// "Long Beach · Dive 70": the site, and the number once the server has
// given one.
function where(dive: Dive, log: LogView) {
  const site = log.sites.get(dive.siteId)?.name
  return [site, dive.number != null && `Dive ${dive.number}`]
    .filter(Boolean)
    .join(" · ")
}

// StatsHifi's Records and averages card, with the spec's further records in
// the same figures: coldest and warmest, depth descended, streaks and the
// anniversary.
export function RecordsCard({
  stats,
  log,
}: {
  stats: Statistics
  log: LogView
}) {
  const { records, water } = stats
  const { deepest, longest, coldest, warmest, descended, anniversary } = records
  const range = water && temperatureScale(water.min, water.max)
  return (
    <Card className="py-0">
      {/* Hairlines from the gap, whatever spans two columns. */}
      <dl className="grid grid-cols-2 gap-px bg-border">
        {deepest && (
          <Figure
            term="Deepest"
            icon={IconArrowBarToDown}
            value={depth(deepest.value)}
            unit="m"
            caption={where(deepest.dive, log)}
            dive={deepest.dive}
          />
        )}
        {longest && (
          <Figure
            term="Longest"
            icon={IconClock}
            value={minutes(longest.value)}
            unit="min"
            caption={where(longest.dive, log)}
            dive={longest.dive}
          />
        )}
        {coldest && warmest && (
          <>
            <Figure
              term="Coldest"
              icon={IconTemperatureMinus}
              value={temperature(coldest.value)}
              unit="°C"
              caption={where(coldest.dive, log)}
              dive={coldest.dive}
            />
            <Figure
              term="Warmest"
              icon={IconTemperaturePlus}
              value={temperature(warmest.value)}
              unit="°C"
              caption={where(warmest.dive, log)}
              dive={warmest.dive}
            />
          </>
        )}
        {stats.averageMaxDepth != null && stats.averageDuration != null && (
          <>
            <Figure
              term="Average max depth"
              icon={IconArrowBarToDown}
              value={depth(stats.averageMaxDepth)}
              unit="m"
            />
            <Figure
              term="Average duration"
              icon={IconClock}
              value={minutes(stats.averageDuration)}
              unit="min"
            />
          </>
        )}
        {water && range && (
          <div className="col-span-2 flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconTemperature aria-hidden className="size-[1.15em] shrink-0" />
              Water temperature, lowest to highest reading
            </dt>
            <dd className="order-first text-lg leading-[22px] font-semibold tracking-[-0.02em] tabular-nums">
              {water.min === water.max
                ? temperature(water.min)
                : // Spaced when a minus sign would run into the dash.
                  `${temperature(water.min)}${water.min < 0 ? " – " : "–"}${temperature(water.max)}`}
              <span className="ml-0.5 text-[13px] font-medium tracking-normal text-muted-foreground">
                °C
              </span>
            </dd>
            <dd
              aria-hidden
              className="relative mt-2.5 block h-1.5 rounded-[3px] bg-muted"
            >
              <span
                className="absolute inset-y-0 rounded-[3px] bg-linear-to-r from-(--stats-very-cold) to-(--stats-hot)"
                style={{ left: range.left, width: range.width }}
              />
            </dd>
          </div>
        )}
        {descended && (
          <Figure
            wide
            term="Cumulative depth descended"
            icon={IconMountain}
            value={Math.round(descended.metres).toLocaleString("en-GB")}
            unit="m"
            caption={
              <>
                <span className="block truncate text-[13px] text-foreground">
                  {descended.headline}
                </span>
                {descended.progress && (
                  <span className="block truncate">{descended.progress}</span>
                )}
              </>
            }
          />
        )}
        {/* One day or week in a row isn't a streak yet, and a streak shown
            alone takes the whole row. */}
        {streakFigures(records.days, records.weeks)}
        {anniversary && (
          <Figure
            wide
            term="Diving anniversary"
            icon={IconCake}
            {...anniversaryFigure(anniversary)}
          />
        )}
      </dl>
    </Card>
  )
}

// "7 years diving, since 10 February 2019", "… today" on the day itself,
// months under a year, and under a month before the first one.
function anniversaryFigure(
  anniversary: NonNullable<Statistics["records"]["anniversary"]>
) {
  const { years, months: count, onTheDay, first } = anniversary
  const since = `since ${longDay(first)}`
  if (years)
    return {
      value: years,
      unit: `${plural(years, "year")} diving${onTheDay ? " today" : ""}`,
      caption: since,
    }
  if (count)
    return {
      value: count,
      unit: `${plural(count, "month")} diving`,
      caption: since,
    }
  return { value: "Under a month", unit: "diving", caption: since }
}

// The range's place on a 0 to 30 °C track, widened for colder or warmer
// water so the bar always fits.
function temperatureScale(min: number, max: number) {
  const low = Math.min(0, min)
  const high = Math.max(30, max)
  const at = (t: number) => ((t - low) / (high - low)) * 100
  return {
    left: `${at(min)}%`,
    // A single reading still shows as a sliver.
    width: `${Math.max(2, at(max) - at(min))}%`,
  }
}
