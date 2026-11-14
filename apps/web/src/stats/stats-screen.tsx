import { useState, type ComponentType } from "react"
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconArrowWaveRightUp,
  IconArrowsHorizontal,
  IconBarbell,
  IconChartBar,
  IconChevronDown,
  IconClock,
  IconEye,
  IconPlus,
  IconPool,
  IconRipple,
  IconScubaDivingTank,
  IconSun,
  IconSunrise,
  IconTemperatureSnow,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

import { NoLog } from "@/components/no-log"
import { countText } from "@/components/pickers/match"
import { Progress } from "@/components/progress"
import { RollingNumber, useFrameLater } from "@/components/rolling-number"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useLog, type LogView } from "@/data/log"
import { today } from "@/dive/form/values"
import { months } from "@/format/dates"
import { hours } from "@/format/figures"
import { listRow, pressable } from "@/you/parts"

import { cachedStatistics } from "./cache"
import { Answers, type Answer } from "./charts/answers"
import { Bars } from "./charts/bars"
import {
  dives,
  fullMonths,
  monthLetters,
  Opening,
  percent,
  ramp,
  rate,
  Section,
  tint,
  useKept,
  useKeptScroll,
  usePainted,
  yearLabels,
} from "./charts/parts"
import { Ranked } from "./charts/ranked"
import { SacTrend } from "./charts/sac-trend"
import { Spread } from "./charts/spread"
import type { Segment } from "./charts/strip"
import { countedDives, statsYears, type Statistics } from "./figures"
import { Figure, plural, RecordsCard, where } from "./records-card"
import { trendChange } from "./trend"
import { YearChip } from "./year-chip"

// The charts need this many dives in the whole log.
const earlyDays = 5

// StatsHifi, and StatsEmptyHifi below five dives in the whole log.
export function StatsScreen({
  year,
  onYear,
}: {
  year: string | undefined
  onYear: (year: string | undefined) => void
}) {
  const { log } = useLog()
  // Below the records, the screen renders a painted frame later, so the
  // first screen shows sooner after the tap; placeholders hold its place.
  const painted = usePainted()
  useKeptScroll(painted)
  // Until there is a log, or why there isn't, as the Log tab says it.
  if (!log)
    return (
      <NoLog
        title="Statistics"
        skeleton={
          <div className="flex flex-col gap-6 px-4 pt-3 md:mx-auto md:w-full md:max-w-3xl">
            {/* The header, the SAC card and the records with their
                headings, as they will sit, so nothing jumps when they land. */}
            <div className="flex flex-col gap-2 pt-2">
              <Skeleton className="h-12 w-44" />
              <Skeleton className="h-5 w-48" />
            </div>
            {["h-[23rem]", "h-96"].map((height) => (
              <div key={height} className="flex flex-col gap-2">
                <Skeleton className="mx-1 h-4 w-32" />
                <Skeleton className={cn("w-full rounded-xl", height)} />
              </div>
            ))}
          </div>
        }
      />
    )
  const counted = countedDives(log)
  if (!counted.length) return <NoStats />
  const years = statsYears(counted)
  // A year from an old link with no dives left shows all time, as does
  // any year in early days, which has no year chip to clear it with.
  const shown =
    counted.length >= earlyDays && year && years.includes(year)
      ? year
      : undefined
  const stats = cachedStatistics(log, shown, today())
  if (counted.length < earlyDays) return <EarlyDays stats={stats} log={log} />
  return (
    <Page>
      <header>
        <p className="flex min-h-16 flex-wrap items-baseline gap-x-2 tabular-nums">
          <Count n={stats.count} />
          <Noun n={stats.count}>{shown && " in"}</Noun>
          <YearChip value={shown} years={years} onChange={onYear} />
        </p>
        <Hours seconds={stats.seconds} />
      </header>
      <div className="flex flex-col gap-7">
        <AirConsumption
          stats={stats}
          year={shown}
          log={log}
          painted={painted}
        />
        <Section id="records" title="Records and averages">
          <RecordsCard stats={stats} log={log} />
        </Section>
        {painted ? (
          <>
            <PerPeriod stats={stats} year={shown} />
            <Section id="depth" title="Depth">
              <Card className="px-4 py-4">
                <Bars
                  caption="Dives by maximum depth"
                  bars={stats.depthBands.map((band) => ({
                    label: band.label,
                    name: band.label,
                    count: band.count,
                  }))}
                  colours={ramp(4)}
                  height={78}
                  gap={10}
                />
              </Card>
            </Section>
            <Answers
              id="conditions"
              title="Conditions"
              rows={conditionRows(stats)}
            />
            <Answers id="habits" title="Habits" rows={habitRows(stats)} />
            {stats.sites.length > 0 && (
              <Section id="sites" title="Sites">
                <Ranked
                  label="Sites"
                  kind="site"
                  rows={stats.sites.map((site) => ({
                    ...site,
                    detail: site.place,
                  }))}
                />
              </Section>
            )}
            {stats.buddies.length > 0 && (
              <Section id="buddies" title="Buddies">
                <Ranked
                  label="Buddies"
                  kind="person"
                  rows={stats.buddies}
                  avatar
                />
              </Section>
            )}
            {stats.regions.length > 0 && (
              <Section id="regions" title="Regions">
                <Ranked
                  label="Regions"
                  kind="region"
                  rows={stats.regions.map((region) => ({
                    ...region,
                    detail: region.country,
                  }))}
                />
              </Section>
            )}
            <Tags stats={stats} year={shown} />
          </>
        ) : (
          <BelowPlaceholder />
        )}
      </div>
    </Page>
  )
}

// Where the sections below the records go until they render, about their
// height, so the page's length and a restored scroll position hold.
function BelowPlaceholder() {
  return (
    <div aria-hidden className="flex flex-col gap-7">
      {["h-44", "h-36", "h-96", "h-52"].map((height) => (
        <Skeleton key={height} className={cn("w-full rounded-xl", height)} />
      ))}
    </div>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col gap-6 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-10 md:mx-auto md:w-full md:max-w-3xl">
      <h1 className="sr-only">Statistics</h1>
      {children}
    </div>
  )
}

// The count rolls its changed digits when the year changes it, as the
// Log's does for a filter, so the pick visibly applies. Sized and placed as
// the Log's header is, in a min-h-16 line, so switching tabs moves nothing.
const Count = ({ n }: { n: number }) => (
  <span className="text-[52px] leading-14 font-semibold tracking-[-0.05em]">
    <RollingNumber value={n} text={countText(n)} />
  </span>
)

// "dive" or "dives" in step with the digits, which start a frame later.
function Noun({ n, children }: { n: number; children?: string }) {
  const later = useFrameLater(n)
  return (
    <span className="text-[17px] font-medium text-muted-foreground">
      {later === 1 ? "dive" : "dives"}
      {children}
    </span>
  )
}

function Hours({ seconds }: { seconds: number }) {
  const h = Number(hours(seconds))
  return (
    <p className="mt-0.5 flex items-center gap-1.5 text-base text-muted-foreground tabular-nums">
      <IconClock aria-hidden className="size-[1.15em] shrink-0" />
      <span>
        {/* Grouped, as the dive count is: "1,259 h". */}
        <span className="font-semibold text-foreground">
          {h.toLocaleString("en-GB")} h
        </span>{" "}
        underwater
      </span>
    </p>
  )
}

// Dives per month for a year, per year for all time, with how long you
// have been diving under them.
function PerPeriod({
  stats,
  year,
}: {
  stats: Statistics
  year: string | undefined
}) {
  const years = yearLabels(stats.perPeriod.map((bar) => bar.label))
  const { anniversary } = stats.records
  return (
    <Section
      id="per-period"
      title={year ? "Dives per month" : "Dives per year"}
    >
      <Card className="gap-3 px-4 py-4">
        <Bars
          caption={year ? `Dives per month in ${year}` : "Dives per year"}
          bars={stats.perPeriod.map((bar, i) =>
            year
              ? {
                  label: monthLetters[i]!,
                  name: fullMonths[i]!,
                  count: bar.count,
                }
              : {
                  label: years[i]!,
                  name: bar.label,
                  count: bar.count,
                }
          )}
          height={72}
          gap={year ? 6 : stats.perPeriod.length > 4 ? 8 : 24}
        />
        {anniversary && <Anniversary anniversary={anniversary} />}
      </Card>
    </Section>
  )
}

// The month short, so the line fits a phone with years and months both.
const shortDay = (date: string) =>
  `${Number(date.slice(8, 10))} ${months[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`

// "7 years 3 months diving, since 10 Feb 2019", "… today" on the day
// itself, and under a month before the first one. The whole log's,
// whatever the year.
function Anniversary({
  anniversary,
}: {
  anniversary: NonNullable<Statistics["records"]["anniversary"]>
}) {
  const { years, months: count, onTheDay, first } = anniversary
  const left = count % 12
  const length =
    [
      years && `${years} ${plural(years, "year")}`,
      left && `${left} ${plural(left, "month")}`,
    ]
      .filter(Boolean)
      .join(" ") || "Under a month"
  return (
    <p className="text-[15px] leading-[22px] text-pretty text-muted-foreground tabular-nums">
      <span className="font-semibold text-foreground">{length}</span> diving
      {onTheDay ? " today" : ""}, since{" "}
      <span className="whitespace-nowrap">{shortDay(first)}</span>
    </p>
  )
}

// The trend leads: how far the five-dive average moved, then the chart,
// and the rest of the rates' spread behind a tap.
function AirConsumption({
  stats,
  year,
  log,
  painted,
}: {
  stats: Statistics
  year: string | undefined
  log: LogView
  painted: boolean
}) {
  const [open, setOpen] = useKept("distribution", false)
  // Back restores it open at once; a tap eases it open.
  const [still, setStill] = useState(true)
  const { average, trend } = stats.sac
  if (average == null || !trend.length) return null
  const change = trendChange(trend)
  const moved = change && Math.abs(change.change) >= 0.05 ? change : null
  const latest = trend.at(-1)!.average
  const window = Math.min(5, trend.length)
  const since = moved?.since
  return (
    <Section id="sac" title="Air consumption">
      <Card className="gap-3.5 px-4 pt-4 pb-0">
        <dl className="flex flex-col-reverse gap-px">
          {/* Short, so it stays one line on a narrow phone. */}
          <dt className="text-xs text-muted-foreground">
            {moved
              ? "Change in 5-dive average"
              : window === 1
                ? "SAC rate, latest dive"
                : `${window}-dive average SAC rate`}
          </dt>
          <dd className="flex flex-wrap items-baseline gap-x-1 tabular-nums">
            {moved && (
              <>
                {/* A falling average is the improvement the trend is for. */}
                {moved.change < 0 ? (
                  <IconArrowDownRight
                    aria-hidden
                    className="size-5.5 shrink-0 self-center stroke-[2.25] text-primary"
                  />
                ) : (
                  <IconArrowUpRight
                    aria-hidden
                    className="size-5.5 shrink-0 self-center stroke-[2.25] text-muted-foreground"
                  />
                )}
                {/* The arrow says which way; the word is for screen readers. */}
                <span className="sr-only">
                  {moved.change < 0 ? "Down " : "Up "}
                </span>
              </>
            )}
            <span className="text-[26px] leading-8 font-semibold tracking-[-0.035em]">
              {rate(moved ? Math.abs(moved.change) : latest)}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              L/min
              {since && (
                <>
                  {" "}
                  since{" "}
                  <span className="whitespace-nowrap">
                    {year
                      ? fullMonths[Number(since.slice(5, 7)) - 1]
                      : `${months[Number(since.slice(5, 7)) - 1]} ${since.slice(0, 4)}`}
                  </span>
                </>
              )}
            </span>
            {moved && (
              <span className="ml-auto shrink-0 text-sm font-medium whitespace-nowrap text-muted-foreground">
                now {rate(latest)}
              </span>
            )}
          </dd>
        </dl>
        {/* A painted frame later, as the sections below the records are:
            the chart was most of a big log's first frame. */}
        {painted ? (
          <SacTrend trend={trend} year={year} />
        ) : (
          <Skeleton aria-hidden className="h-42 w-full" />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-muted-foreground opacity-40"
            />
            Each dive
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-primary" />
            Average of last 5
          </span>
        </div>
        <div className="-mx-4 border-t">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setStill(false)
              setOpen(!open)
            }}
            className={cn(listRow, pressable, "font-medium text-primary")}
          >
            <span className="flex-1">Distribution</span>
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
              <Distribution stats={stats} log={log} />
            </Opening>
          )}
        </div>
      </Card>
    </Section>
  )
}

// The average again with its median and spread, the best and worst dive,
// and a histogram of every rate.
function Distribution({ stats, log }: { stats: Statistics; log: LogView }) {
  const { average, median, mean, deviation, best, worst, trend } = stats.sac
  return (
    <>
      <dl className="grid grid-cols-6 gap-px border-t bg-border">
        <Figure
          className="col-span-2"
          // Whole on its line, rather than broken at the hyphen.
          term={
            <span>
              <span className="whitespace-nowrap">Time-weighted</span> average
            </span>
          }
          value={rate(average!)}
          unit="L/min"
        />
        <Figure
          className="col-span-2"
          term="Median"
          value={rate(median!)}
          unit="L/min"
        />
        <Figure
          className="col-span-2"
          term="Standard deviation"
          value={deviation == null ? "–" : `±${rate(deviation)}`}
          unit={deviation == null ? undefined : "L/min"}
        />
        {/* One rated dive is both, so neither shows. */}
        {best && trend.length > 1 && (
          <Figure
            className="col-span-3"
            term="Best"
            value={rate(best.sac)}
            unit="L/min"
            caption={where(best.dive, log)}
            dive={best.dive}
          />
        )}
        {worst && trend.length > 1 && (
          <Figure
            className="col-span-3"
            term="Worst"
            value={rate(worst.sac)}
            unit="L/min"
            caption={where(worst.dive, log)}
            dive={worst.dive}
          />
        )}
      </dl>
      {/* A bell curve over a few dives says nothing, nor over rates that
          only differ in float noise. */}
      {deviation != null && trend.length >= 5 && rate(deviation) !== "0.0" && (
        <div className="flex flex-col gap-2.5 border-t px-4 pt-3.5 pb-4">
          <h3 className="text-[13px] font-medium">Spread</h3>
          <Spread
            rates={trend.map((point) => point.sac)}
            mean={mean!}
            deviation={deviation}
          />
        </div>
      )}
    </>
  )
}

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

// Cold to hot in the colours a diver would expect, the rest as accent ramps.
const thermalColours = [
  "var(--stats-very-cold)",
  "var(--stats-cold)",
  "var(--stats-comfortable)",
  "var(--stats-hot)",
]

// The most common level in the accent, fading down the ranks, for choices
// with no order of their own (weather, entry). Levels no dive logged are
// left out, so the faintest shade goes to one that shows.
function byRank(levels: { label: string; count: number }[]): Segment[] {
  const logged = levels.filter((level) => level.count)
  const shades = ramp(logged.length).reverse()
  const ranks = [...logged].sort((a, b) => b.count - a.count)
  return logged.map((level) => ({
    label: level.label,
    count: level.count,
    colour: shades[ranks.indexOf(level)],
  }))
}

const mostly = (label: string) => `Mostly ${label.toLowerCase()}`

const conditionIcons: Record<string, IconType> = {
  current: IconArrowWaveRightUp,
  surge: IconArrowsHorizontal,
  visibility: IconEye,
  workload: IconBarbell,
  thermalComfort: IconTemperatureSnow,
}

// Above the water, in it, then the diver. Weather and surface are shares of
// the dives that logged them, as a dive with none noted says nothing about
// the weather; the levels in the water count the dives that didn't too.
function conditionRows(stats: Statistics): Answer[] {
  const above = [
    {
      key: "weather",
      label: "Weather",
      icon: IconSun,
      breakdown: stats.weather,
    },
    {
      key: "surface",
      label: "Surface",
      icon: IconRipple,
      breakdown: stats.surface,
    },
  ].flatMap(({ breakdown, ...row }) =>
    breakdown.top
      ? [
          {
            ...row,
            answer: mostly(breakdown.top.label),
            segments: byRank(breakdown.levels),
          },
        ]
      : []
  )
  const below = stats.conditions.flatMap((condition) => {
    if (!condition.top) return []
    const colours =
      condition.key === "thermalComfort"
        ? thermalColours
        : ramp(condition.levels.length)
    return [
      {
        key: condition.key,
        label: condition.label,
        icon: conditionIcons[condition.key]!,
        answer: mostly(condition.top.label),
        segments: condition.levels.map((level, i) => ({
          label: level.label,
          count: level.count,
          colour: colours[i],
        })),
        unlogged: condition.notLogged,
        note:
          condition.key === "visibility" ? (
            <>
              Dives logged in metres are grouped: under 5&nbsp;m low,{" "}
              <span className="whitespace-nowrap">5–10&nbsp;m</span> average,
              over 10&nbsp;m high.
            </>
          ) : undefined,
      },
    ]
  })
  // Thermal comfort before workload: the water, then the diver in it.
  const order = ["current", "surge", "visibility", "thermalComfort", "workload"]
  below.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  return [...above, ...below]
}

// "Mostly mornings", "Mornings and midday" for two levels at the top, and
// no one time once three share it.
const timeWords: Record<string, string> = {
  morning: "Mornings",
  midday: "Midday",
  afternoon: "Afternoons",
  night: "Nights",
}

function timeAnswer(parts: Statistics["timeOfDay"]) {
  const most = Math.max(...parts.map((part) => part.count))
  const top = parts.filter((part) => part.count === most)
  if (top.length === 1) return mostly(timeWords[top[0]!.key]!)
  if (top.length === 2)
    return `${timeWords[top[0]!.key]} and ${timeWords[top[1]!.key]!.toLowerCase()}`
  return "Spread through the day"
}

// The choices the diver makes: when, how they get in, and what they breathe.
function habitRows(stats: Statistics): Answer[] {
  const { air, nitrox } = stats.gas
  const rows: Answer[] = [
    {
      key: "time",
      label: "Time of day",
      icon: IconSunrise,
      answer: timeAnswer(stats.timeOfDay),
      segments: byRank(stats.timeOfDay),
    },
  ]
  if (stats.entry.top)
    rows.push({
      key: "entry",
      label: "Entry",
      icon: IconPool,
      answer: mostly(stats.entry.top.label),
      segments: byRank(stats.entry.levels),
    })
  rows.push({
    key: "gas",
    label: "Gas",
    icon: IconScubaDivingTank,
    answer: !nitrox
      ? "Air on every dive"
      : !air
        ? "Nitrox on every dive"
        : `Nitrox on ${percent(nitrox, air + nitrox)} of dives`,
    // Blue for air and the yellow-green band nitrox cylinders carry,
    // Tailwind's own (the owner's pick over the board's muted pair).
    segments: [
      { label: "Air", count: air, className: "bg-sky-300" },
      { label: "Nitrox", count: nitrox, className: "bg-lime-400" },
    ],
  })
  return rows
}

// Each tag opens the Log filtered by it and the year, so it lists the dives
// counted here. A tab move, so it replaces the entry.
function Tags({
  stats,
  year,
}: {
  stats: Statistics
  year: string | undefined
}) {
  const { tags } = stats
  if (!tags.length) return null
  const max = tags[0]!.count
  return (
    <Section id="tags" title="Tags">
      <Card className="gap-3 px-4 py-4">
        <ul
          aria-label="Tags by number of dives"
          className="flex flex-wrap gap-2"
        >
          {tags.map((tag) => (
            <li key={tag.key}>
              <Link
                to="/"
                search={{
                  tags: tag.key,
                  year: year ? Number(year) : undefined,
                }}
                replace
                aria-label={`${tag.label}, ${dives(tag.count)}. Show in the Log`}
                className="relative inline-flex h-8.5 items-center gap-1.75 rounded-full px-3 text-sm leading-none font-medium transition-[scale,opacity] duration-150 ease-out select-none [-webkit-touch-callout:none] after:absolute after:inset-x-0 after:-inset-y-1 active:scale-[0.97] active:opacity-80 motion-reduce:active:scale-100"
                style={{
                  background: tint(Math.round(6 + 24 * (tag.count / max))),
                }}
              >
                {tag.label}
                <span className="text-[13px] font-medium text-muted-foreground tabular-nums">
                  {tag.count.toLocaleString("en-GB")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  )
}

// StatsEmptyHifi's two dives: totals and records, and how far off the rest
// is. No year chip until the charts come.
function EarlyDays({ stats, log }: { stats: Statistics; log: LogView }) {
  return (
    <Page>
      <header>
        <p className="flex min-h-16 items-baseline gap-2 tabular-nums">
          <Count n={stats.count} />
          <Noun n={stats.count}> logged</Noun>
        </p>
        <Hours seconds={stats.seconds} />
        {/* Under the bars once they come; until then, under the hours. */}
        {stats.records.anniversary && (
          <div className="mt-1">
            <Anniversary anniversary={stats.records.anniversary} />
          </div>
        )}
      </header>
      <div className="flex flex-col gap-7">
        <Section id="records" title="Records and averages">
          <RecordsCard stats={stats} log={log} />
        </Section>
        <section aria-labelledby="stats-more">
          <Card className="gap-3 px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id="stats-more"
                className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em]"
              >
                <IconChartBar
                  aria-hidden
                  className="size-[1.1em] shrink-0 text-muted-foreground"
                />
                More after {earlyDays} dives
              </h2>
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {stats.count} of {earlyDays}
              </span>
            </div>
            <Progress
              label="Dives logged towards more stats"
              value={stats.count / earlyDays}
            />
            <p className="text-sm/normal text-muted-foreground">
              SAC trend, conditions and time of day need a few more dives to say
              anything useful.
            </p>
          </Card>
        </section>
      </div>
    </Page>
  )
}

function NoStats() {
  return (
    <Page>
      {/* StatsEmptyHifi keeps the count above the empty state. */}
      <header>
        <p className="flex min-h-16 items-baseline gap-2 tabular-nums">
          <Count n={0} />
          <span className="text-[17px] font-medium text-muted-foreground">
            dives logged
          </span>
        </p>
      </header>
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="accent">
            <IconChartBar />
          </EmptyMedia>
          <EmptyTitle className="text-lg font-semibold tracking-[-0.015em]">
            No stats yet
          </EmptyTitle>
          <EmptyDescription>
            Records show up after your first dive. Charts follow from five.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* A new dive is one level deeper, as from the Log. */}
          <Link
            to="/dive/new"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-12 w-full rounded-[14px] text-base font-semibold select-none [-webkit-touch-callout:none]"
            )}
          >
            <IconPlus data-icon="inline-start" />
            Log a dive
          </Link>
        </EmptyContent>
      </Empty>
    </Page>
  )
}
