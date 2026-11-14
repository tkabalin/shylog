import { useState, type ComponentType, type ReactNode } from "react"
import {
  IconArrowBarToDown,
  IconAward,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconMountain,
  IconTemperatureMinus,
  IconTemperaturePlus,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

import { Progress } from "@/components/progress"
import { Card } from "@/components/ui/card"
import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"
import { months } from "@/format/dates"
import { depth, minutes, temperature } from "@/format/figures"
import { listRow, pressable } from "@/you/parts"

import { Opening, useKept } from "./charts/parts"

import type { Statistics } from "./figures"
import type { Streak } from "./records"

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

// A figure as StatsHifi's .fig sets it: a small label over the value, its
// unit muted, and a caption under it.
export function Figure({
  term,
  icon: Icon,
  quiet,
  value,
  unit,
  caption,
  dive,
  wide,
  className,
}: {
  term: ReactNode
  icon?: Icon
  // The label for screen readers only, where the unit already says it.
  quiet?: boolean
  value: ReactNode
  unit?: string
  caption?: ReactNode
  // The record's dive, which the whole cell opens.
  dive?: Dive
  wide?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3.5",
        wide && "col-span-2",
        className,
        // The caption's link covers the cell, so the whole figure opens
        // the dive and the cell tints while it is held, with no link menu.
        dive &&
          "relative transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-muted/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-focus-visible:ring-inset has-data-press:bg-muted has-data-press:duration-0"
      )}
    >
      <dt
        className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          quiet && "sr-only"
        )}
      >
        {Icon && <Icon aria-hidden className="size-[1.15em] shrink-0" />}
        {term}
      </dt>
      {/* Over its label, as the board sets it, while dt comes first. The
          unit drops under the value when a narrow cell can't fit both. */}
      <dd className="order-first flex flex-wrap items-baseline gap-x-0.5 text-lg leading-[22px] font-semibold tracking-[-0.02em] tabular-nums">
        {value}
        {unit && (
          <span className="text-[13px] font-medium tracking-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </dd>
      {caption && (
        <dd
          className={cn(
            "min-w-0 text-xs text-muted-foreground",
            // A site's name is cut short; a date range wraps, so a running
            // streak always says so.
            dive ? "mt-1.5 flex items-center gap-0.5" : "mt-1 text-pretty"
          )}
        >
          {dive ? (
            <>
              {/* One level deeper, with Statistics behind it for Back. */}
              <Link
                to="/dive/$diveId"
                params={{ diveId: dive.id }}
                state={{ pushed: true, fromStats: true }}
                className="min-w-0 truncate outline-none after:absolute after:inset-0"
              >
                {caption}
              </Link>
              <IconChevronRight
                aria-hidden
                className="size-3 shrink-0 stroke-[2.25]"
              />
            </>
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

// "22 Aug 2026", for a dive's local start.
const day = (startTime: string) =>
  `${shortDate(startTime)} ${startTime.slice(0, 4)}`

export const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`)

// "6 days in a row" says what it is, so the label is for screen readers.
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
      quiet
      value={streak.length}
      unit={`${plural(streak.length, unit)} in a row`}
      caption={streakCaption(streak)}
    />
  ))
}

function streakCaption(streak: Streak) {
  const range = dateRange(streak.first, streak.last)
  return streak.running ? `${range}, running` : range
}

// The record's site, or its number when it has none.
export function where(dive: Dive, log: LogView) {
  return (
    log.sites.get(dive.siteId)?.name ??
    (dive.number != null ? `Dive ${dive.number}` : "Dive")
  )
}

// The landmark leads, as the sentence is the delight; the total and the
// way to the next rung follow, with a bar for how far.
function Descended({
  descended,
}: {
  descended: NonNullable<Statistics["records"]["descended"]>
}) {
  const { metres, headline, progress, fraction } = descended
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1 bg-card px-4 pt-3.5 pb-4">
      <dt className="flex items-center gap-1.75 text-base leading-[22px] font-semibold tracking-[-0.015em]">
        <IconMountain aria-hidden className="size-4.5 shrink-0 text-primary" />
        {headline}
      </dt>
      <dd className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
        <span className="font-semibold text-foreground">
          {Math.round(metres).toLocaleString("en-GB")} m
        </span>{" "}
        cumulative{progress && `: ${progress}`}
      </dd>
      <dd className="mt-2">
        <Progress
          label="Depth descended towards the next landmark"
          value={fraction}
        />
      </dd>
    </div>
  )
}

// The next dive-number milestone as Depth descended sets its landmark: what
// it is and how far off, what it means, and a bar for the way from the last
// one. The milestones passed open under it, each opening its dive.
function Milestones({
  milestones,
}: {
  milestones: NonNullable<Statistics["records"]["milestones"]>
}) {
  const { next, passed } = milestones
  const last = passed.at(-1)
  const [open, setOpen] = useKept("milestones", false)
  // Back restores the list open at once; a tap eases it open.
  const [still, setStill] = useState(true)
  return (
    // Padded item by item rather than in an inner box, so the term and its
    // details stay the div's own children, as a dl's groups need.
    <div className="col-span-2 flex min-w-0 flex-col bg-card">
      <dt className="flex items-center gap-1.75 px-4 pt-3.5 text-base leading-[22px] font-semibold tracking-[-0.015em] tabular-nums">
        <IconAward aria-hidden className="size-4.5 shrink-0 text-primary" />
        {next
          ? `${next.toGo} ${plural(next.toGo, "dive")} to dive ${next.number}`
          : "Every milestone passed"}
      </dt>
      {/* Past the last, the line says which it was and when. */}
      {!next && last && (
        <dd className="mt-1 px-4 pb-4 text-[13px] leading-[18px] text-pretty text-muted-foreground tabular-nums">
          {last.line}, dive {last.number} on {day(last.dive.startTime)}
        </dd>
      )}
      {next && (
        <>
          <dd className="mt-1 px-4 text-[13px] leading-[18px] text-pretty text-muted-foreground">
            {next.line}
          </dd>
          <dd className="mt-3 px-4 pb-4">
            <Progress
              label={`Dives towards dive ${next.number}`}
              value={next.fraction}
            />
          </dd>
        </>
      )}
      {passed.length > 0 && (
        <dd className="border-t">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setStill(false)
              setOpen(!open)
            }}
            className={cn(listRow, pressable, "font-medium text-primary")}
          >
            <span className="flex-1">Milestones passed</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {passed.length}
            </span>
            <IconChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 transition-transform duration-200 ease-out",
                open && "rotate-180"
              )}
            />
          </button>
          {open && (
            <Opening instant={still}>
              {/* Newest first, as the log lists dives. */}
              <ol aria-label="Milestones passed" className="divide-y border-t">
                {passed.toReversed().map(({ number, line, dive }) => (
                  <li key={number}>
                    {/* One level deeper, with Statistics behind it for Back. */}
                    <Link
                      to="/dive/$diveId"
                      params={{ diveId: dive.id }}
                      state={{ pushed: true, fromStats: true }}
                      className={cn(listRow, pressable, "gap-3 py-3 pr-3.5")}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-medium tabular-nums">
                          Dive {number}
                        </span>
                        <span className="text-[13px] leading-[18px] text-pretty text-muted-foreground">
                          {line}
                        </span>
                      </span>
                      {/* With the chevron, centred on the row, as the ranked
                          lists set a count. */}
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
                        {day(dive.startTime)}
                        <IconChevronRight
                          aria-hidden
                          className="size-3.5 stroke-[2.25]"
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Opening>
          )}
        </dd>
      )}
    </div>
  )
}

// StatsHifi's Records and averages card, with the spec's further records in
// the same figures: the records, the averages, coldest and warmest, the
// streaks and depth descended.
export function RecordsCard({
  stats,
  log,
}: {
  stats: Statistics
  log: LogView
}) {
  const { records } = stats
  const { deepest, longest, coldest, warmest, descended } = records
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
        {/* One day or week in a row isn't a streak yet, and a streak shown
            alone takes the whole row. */}
        {streakFigures(records.days, records.weeks)}
        {descended && <Descended descended={descended} />}
        {records.milestones && <Milestones milestones={records.milestones} />}
      </dl>
    </Card>
  )
}
