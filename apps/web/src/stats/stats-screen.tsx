import { useState, type ComponentType } from "react"
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconArrowWaveRightUp,
  IconArrowsHorizontal,
  IconBarbell,
  IconChartBar,
  IconClock,
  IconCloud,
  IconCloudRain,
  IconEye,
  IconInfoCircle,
  IconMoon,
  IconPlus,
  IconRipple,
  IconSun,
  IconSunHigh,
  IconSunset2,
  IconSunrise,
  IconTemperatureSnow,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

import { IconSurfaceCalm, IconSurfaceStormy } from "@/components/icons"
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
import { Reveal } from "@/dive/form/rows"
import { today } from "@/dive/form/values"
import { hours } from "@/format/figures"

import { cachedStatistics } from "./cache"
import { Bars } from "./charts/bars"
import {
  dives,
  fullMonths,
  monthLetters,
  percent,
  ramp,
  rate,
  Section,
  tint,
  usePainted,
  yearLabels,
} from "./charts/parts"
import { Ranked } from "./charts/ranked"
import { SacTrend } from "./charts/sac-trend"
import { Strip } from "./charts/strip"
import { Tiles, type Tile } from "./charts/tiles"
import { countedDives, statsYears, type Statistics } from "./figures"
import { RecordsCard } from "./records-card"
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
  // Until there is a log, or why there isn't, as the Log tab says it.
  if (!log)
    return (
      <NoLog
        title="Statistics"
        skeleton={
          <div className="flex flex-col gap-6 px-4 pt-3 md:mx-auto md:w-full md:max-w-3xl">
            {/* The header, the bars and the records card, as they will sit. */}
            <div className="flex flex-col gap-2 pt-2">
              <Skeleton className="h-12 w-44" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-96 w-full rounded-xl" />
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
        <PerPeriod stats={stats} year={shown} />
        <Section id="records" title="Records and averages">
          <RecordsCard stats={stats} log={log} />
        </Section>
        {painted ? (
          <>
            <AirConsumption stats={stats} year={shown} />
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
            <Conditions stats={stats} />
            <WeatherAndSurface stats={stats} />
            <Section id="time-of-day" title="Time of day">
              <Card className="py-0">
                <Tiles
                  label="Time of day"
                  tiles={stats.timeOfDay.map((part) => ({
                    label: part.label,
                    count: part.count,
                    icon: timeIcons[part.key],
                  }))}
                />
              </Card>
            </Section>
            <Gas stats={stats} />
            <Entry stats={stats} />
            <Section id="sites" title="Most-dived sites">
              <Ranked
                label="Most-dived sites"
                rows={stats.sites.map((site) => ({
                  ...site,
                  detail: site.place,
                }))}
              />
            </Section>
            {stats.buddies.length > 0 && (
              <Section id="buddies" title="Buddies">
                <Ranked label="Buddies" rows={stats.buddies} avatar />
              </Section>
            )}
            <Section id="regions" title="Regions">
              <Ranked
                label="Regions"
                rows={stats.regions.map((region) => ({
                  ...region,
                  detail: region.country,
                }))}
                stacked
              />
            </Section>
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
      {["h-88", "h-52", "h-[36rem]", "h-96"].map((height) => (
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
      {/* Grouped, as the dive count is: "1,259 hours". */}
      {h.toLocaleString("en-GB")} {h === 1 ? "hour" : "hours"} underwater
    </p>
  )
}

// Dives per month for a year, per year for all time; no card, as the board
// sets it straight under the header.
function PerPeriod({
  stats,
  year,
}: {
  stats: Statistics
  year: string | undefined
}) {
  const years = yearLabels(stats.perPeriod.map((bar) => bar.label))
  return (
    <section aria-labelledby="stats-per-period" className="flex flex-col gap-2">
      <h2 id="stats-per-period" className="text-[13px] text-muted-foreground">
        {year ? "Dives per month" : "Dives per year"}
      </h2>
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
    </section>
  )
}

function AirConsumption({
  stats,
  year,
}: {
  stats: Statistics
  year: string | undefined
}) {
  const { average, trend } = stats.sac
  if (average == null || !trend.length) return null
  const change = trendChange(trend)
  return (
    <Section id="sac" title="Air consumption">
      <Card className="gap-3.5 px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <dl className="flex flex-col-reverse gap-px">
            <dt className="text-xs text-muted-foreground">Average SAC rate</dt>
            <dd className="text-[26px] leading-8 font-semibold tracking-[-0.035em] tabular-nums">
              {rate(average)}
              <span className="ml-0.75 text-sm font-medium tracking-normal text-muted-foreground">
                L/min
              </span>
            </dd>
          </dl>
          {change && Math.abs(change.change) >= 0.05 && (
            // A falling average is the improvement the trend is for.
            <p
              className={cn(
                "mb-1 inline-flex items-center gap-1 text-[13px] font-medium tabular-nums",
                change.change < 0 ? "text-primary" : "text-muted-foreground"
              )}
            >
              {change.change < 0 ? (
                <IconArrowDownRight aria-hidden className="size-4" />
              ) : (
                <IconArrowUpRight aria-hidden className="size-4" />
              )}
              {change.change < 0 ? "−" : "+"}
              {rate(Math.abs(change.change))} L/min
              <span className="font-normal text-muted-foreground">
                since{" "}
                {year
                  ? fullMonths[Number(change.since.slice(5, 7)) - 1]
                  : change.since.slice(0, 4)}
              </span>
            </p>
          )}
        </div>
        <SacTrend trend={trend} year={year} />
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
          <span className="ml-auto tabular-nums">
            {trend.length} of {dives(stats.count)}
          </span>
        </div>
      </Card>
    </Section>
  )
}

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

const conditionIcons: Record<string, IconType> = {
  current: IconArrowWaveRightUp,
  surge: IconArrowsHorizontal,
  visibility: IconEye,
  workload: IconBarbell,
  thermalComfort: IconTemperatureSnow,
}

// Cold to hot in the colours a diver would expect, the rest as accent ramps.
const thermalColours = [
  "var(--stats-very-cold)",
  "var(--stats-cold)",
  "var(--stats-comfortable)",
  "var(--stats-hot)",
]

function Conditions({ stats }: { stats: Statistics }) {
  const [info, setInfo] = useState(false)
  const logged = stats.conditions.filter((c) => c.top)
  if (!logged.length) return null
  return (
    <Section id="conditions" title="Conditions">
      <Card className="gap-0 divide-y px-4 py-0">
        {logged.map((condition) => {
          const Icon = conditionIcons[condition.key]!
          const thermal = condition.key === "thermalComfort"
          const colours = ramp(condition.levels.length)
          return (
            <div key={condition.key} className="flex flex-col gap-2 py-3.5">
              {/* No gap between the title and its info, so the line eases
                  open whole rather than its gap landing first. */}
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-0.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                      <Icon
                        aria-hidden
                        className="size-[1.15em] shrink-0 text-muted-foreground"
                      />
                      {condition.label}
                    </span>
                    {condition.key === "visibility" && (
                      <button
                        type="button"
                        aria-label="How visibility is grouped"
                        aria-expanded={info}
                        onClick={() => setInfo(!info)}
                        className={cn(
                          "relative -my-1.5 inline-flex size-7 items-center justify-center transition-colors duration-150 after:absolute after:-inset-2 active:opacity-60",
                          info ? "text-primary" : "text-muted-foreground/70"
                        )}
                      >
                        <IconInfoCircle aria-hidden className="size-4" />
                      </button>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Mostly {condition.top!.label.toLowerCase()}
                  </span>
                </div>
                {condition.key === "visibility" && info && (
                  // Eases the rows below down rather than jumping them.
                  <Reveal>
                    <p className="pt-1.5 text-xs/[1.45] text-muted-foreground">
                      Dives logged in metres are grouped: under 5&nbsp;m low,{" "}
                      <span className="whitespace-nowrap">5–10&nbsp;m</span>{" "}
                      average, over 10&nbsp;m high.
                    </p>
                  </Reveal>
                )}
              </div>
              <Strip
                caption={condition.label}
                segments={condition.levels.map((level, i) =>
                  thermal
                    ? { ...level, colour: thermalColours[i] }
                    : { ...level, colour: colours[i] }
                )}
                unlogged={condition.notLogged}
              />
            </div>
          )
        })}
      </Card>
    </Section>
  )
}

const weatherIcons: Record<string, IconType> = {
  cloudless: IconSun,
  cloudy: IconCloud,
  rainy: IconCloudRain,
}
const surfaceIcons: Record<string, IconType> = {
  calm: IconSurfaceCalm,
  moving: IconRipple,
  stormy: IconSurfaceStormy,
}
const timeIcons: Record<string, IconType> = {
  morning: IconSunrise,
  midday: IconSunHigh,
  afternoon: IconSunset2,
  night: IconMoon,
}

const tilesOf = (
  breakdown: Statistics["weather"],
  icons: Record<string, IconType>
): Tile[] =>
  breakdown.levels.map((level) => ({
    label: level.label,
    count: level.count,
    icon: icons[level.key]!,
  }))

// Shares of the dives that logged each, as a dive with no weather noted
// says nothing about the weather.
function WeatherAndSurface({ stats }: { stats: Statistics }) {
  const rows = [
    { label: "Weather", breakdown: stats.weather, icons: weatherIcons },
    { label: "Surface", breakdown: stats.surface, icons: surfaceIcons },
  ].filter((row) => row.breakdown.top)
  if (!rows.length) return null
  return (
    <Section id="weather" title="Weather and surface">
      <Card className="gap-0 py-0">
        {rows.map((row) => (
          <Tiles
            key={row.label}
            label={row.label}
            tiles={tilesOf(row.breakdown, row.icons)}
          />
        ))}
      </Card>
    </Section>
  )
}

function Gas({ stats }: { stats: Statistics }) {
  const { air, nitrox, averageOxygen } = stats.gas
  const total = air + nitrox
  return (
    <Section id="gas" title="Gas">
      <Card className="gap-2.5 px-4 py-4">
        <div className="flex items-baseline justify-between gap-3 tabular-nums">
          <span className="text-sm font-medium">
            {!nitrox
              ? "Air on every dive"
              : !air
                ? "Nitrox on every dive"
                : `Nitrox on ${percent(nitrox, total)} of dives`}
          </span>
          {averageOxygen != null && (
            <span className="text-xs text-muted-foreground">
              Average nitrox{" "}
              {(Math.round(averageOxygen) / 10).toLocaleString("en-GB", {
                maximumFractionDigits: 1,
              })}
              % O₂
            </span>
          )}
        </div>
        {/* Blue for air and the yellow-green band nitrox cylinders carry,
            Tailwind's own (the owner's pick over the board's muted pair). */}
        <Strip
          caption="Gas"
          segments={[
            { label: "Air", count: air, className: "bg-sky-300" },
            { label: "Nitrox", count: nitrox, className: "bg-lime-400" },
          ]}
        />
      </Card>
    </Section>
  )
}

function Entry({ stats }: { stats: Statistics }) {
  const { levels, top } = stats.entry
  if (!top) return null
  const logged = levels.reduce((sum, level) => sum + level.count, 0)
  // The most used in the accent, fading down the ranks.
  const colours = ramp(levels.length).reverse()
  return (
    <Section id="entry" title="Entry">
      <Card className="gap-2.5 px-4 py-4">
        <div className="flex items-baseline justify-between gap-3 tabular-nums">
          <span className="text-sm font-medium">
            Mostly {top.label.toLowerCase()}
          </span>
          <span className="text-xs text-muted-foreground">{dives(logged)}</span>
        </div>
        <Strip
          caption="Entry"
          segments={levels.map((level, i) => ({
            label: level.label,
            count: level.count,
            colour: colours[i]!,
          }))}
        />
      </Card>
    </Section>
  )
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
                  {tag.count}
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
