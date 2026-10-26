import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import {
  currents,
  cylinderMaterials,
  diveTypes,
  entries,
  surges,
  tags,
  thermalComforts,
  visibilityRatings,
  weathers,
  workloads,
  surfaces,
  type Tag,
} from "@shylog/core"
import {
  IconAlertTriangle,
  IconArrowBarToDown,
  IconArrowBarToDownDashed,
  IconArrowsHorizontal,
  IconArrowWaveRightUp,
  IconBarbell,
  IconBuildingStore,
  IconCalendar,
  IconChevronLeft,
  IconClock,
  IconCloud,
  IconCloudRain,
  IconEye,
  IconEyeOff,
  IconFish,
  IconHourglass,
  IconMap,
  IconNotes,
  IconPool,
  IconRipple,
  IconScubaMask,
  IconSun,
  IconTemperatureSnow,
  IconUsers,
  IconUserStar,
  type IconProps,
} from "@tabler/icons-react"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { cn } from "cn"

import { loadChart, retryChart } from "@/chart/load"
import { backToLog } from "@/components/app-nav"
import { IconSurfaceCalm, IconSurfaceStormy } from "@/components/icons"
import { ProfileCard } from "@/components/profile-card"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { Dive } from "@/data/db"
import { currentLog, useLog, type LogView } from "@/data/log"
import { loadProfile, retryProfile } from "@/data/samples"
import { diveFigures } from "@/dive/figures"
import { clockTime, longDate } from "@/format/dates"
import {
  bar,
  depth,
  gasDetail,
  gasName,
  interval,
  litres,
  minutes,
  temperatureRange,
} from "@/format/figures"
import { fullPlace } from "@/format/place"

export const Route = createFileRoute("/dive/$diveId")({
  component: DivePage,
  // Runs on intent too (a touch or hover on the card), so the samples and
  // the chart's chunk are on their way before the tap ends. It never waits:
  // the detail renders from the log copy at once.
  loader: ({ params }) => {
    const dive = currentLog()?.dive.get(params.diveId)
    if (dive?.sparkline) {
      // Opening the dive again is a fresh try after a failure.
      retryProfile(dive)
      retryChart()
      loadProfile(dive).catch(() => {})
      loadChart().catch(() => {})
    }
  },
})

type Icon = ComponentType<IconProps>
const label = <K extends string>(
  options: Record<K, { label: string }>,
  key: string | null
) => (key && key in options ? options[key as K].label : null)
const none = "—"

function DivePage() {
  const { diveId } = Route.useParams()
  const { log, loaded } = useLog()
  const dive = log?.dive.get(diveId)
  if (!loaded) return null
  // The copy keeps deleted dives for Recently deleted, not for this page.
  if (!log || !dive || dive.deletedAt) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <BackLink />
        <h1 className="text-xl font-semibold">Dive not found</h1>
        <p className="text-muted-foreground">
          It may have been deleted, or the log on this phone is out of date.
        </p>
      </div>
    )
  }
  return <DiveDetail dive={dive} log={log} />
}

function BackLink() {
  const router = useRouter()
  return (
    // With no Log behind it, a fresh Log takes the dive's place, so swiping
    // back doesn't reopen it.
    <Link
      to="/"
      replace
      onClick={(event) => backToLog(router, event)}
      className="inline-flex h-11 items-center gap-0.5 justify-self-start pr-2 pl-1 text-base font-medium text-primary transition-opacity duration-150 select-none [-webkit-touch-callout:none] active:opacity-50"
    >
      <IconChevronLeft aria-hidden className="size-5.5 stroke-[2.25]" />
      Log
    </Link>
  )
}

// The bar is always solid, so a quick flick never shows text through it
// before a scroll frame has run. It takes its line once the content's first
// line reaches it (not at the first pixel of scroll, while the gap above
// the content passes), and the site's name once the title has passed under
// it. Read from layout, so the safe-area inset above the bar counts.
function useBar() {
  const barRef = useRef<HTMLElement>(null)
  const content = useRef<HTMLElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const [state, setState] = useState({ scrolled: false, titled: false })
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("#main")
    if (!main) return
    let frame = 0
    const update = () => {
      frame = 0
      const bar = barRef.current?.getBoundingClientRect().bottom
      const scrolled =
        bar != null &&
        !!content.current &&
        content.current.getBoundingClientRect().top < bar
      const titled =
        bar != null &&
        !!title.current &&
        title.current.getBoundingClientRect().bottom <= bar
      setState((was) =>
        was.scrolled === scrolled && was.titled === titled
          ? was
          : { scrolled, titled }
      )
    }
    const onScroll = () => {
      frame ||= requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    main.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      main.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  return { barRef, content, title, ...state }
}

function DiveDetail({ dive, log }: { dive: Dive; log: LogView }) {
  const site = log.sites.get(dive.siteId)
  const region = site?.regionId ? log.regions.get(site.regionId) : undefined
  const links = log.links.get(dive.id)
  const names = (ids: string[] | undefined) =>
    ids
      ?.map((id) => log.people.get(id)?.name)
      .filter(Boolean)
      .join(", ") || null
  const figures = diveFigures(dive, log)
  const { barRef, content, title, scrolled, titled } = useBar()

  const visibility =
    dive.visibility != null
      ? `${dive.visibility} m`
      : label(visibilityRatings, dive.visibilityRating)

  return (
    <div className="flex flex-col">
      <header
        ref={barRef}
        data-scrolled={scrolled ? "" : undefined}
        data-titled={titled ? "" : undefined}
        className="sticky top-0 z-10 grid h-[calc(3.25rem+env(safe-area-inset-top))] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-transparent bg-background px-2 pt-[env(safe-area-inset-top)] transition-[border-color] duration-200 data-scrolled:border-border"
      >
        <BackLink />
        {/* A visual echo of the h1, which screen readers already have. */}
        <span
          aria-hidden
          className="max-w-50 translate-y-1 truncate text-base font-semibold tracking-[-0.015em] opacity-0 transition-[opacity,translate] duration-200 ease-out in-data-titled:translate-y-0 in-data-titled:opacity-100 motion-reduce:translate-y-0"
        >
          {site?.name}
        </span>
      </header>

      <div className="flex flex-col gap-6 px-4 pt-5 pb-8">
        <section ref={content} className="flex flex-col gap-1 px-1">
          <p className="flex min-h-5.5 items-center text-sm font-medium text-muted-foreground tabular-nums">
            {dive.ignored ? (
              <>
                <IconEyeOff aria-hidden className="size-4" />
                <span className="sr-only">Ignored</span>
              </>
            ) : (
              dive.number != null && `Dive ${dive.number}`
            )}
          </p>
          <h1
            ref={title}
            className="text-[30px] leading-9 font-semibold tracking-[-0.035em] [overflow-wrap:anywhere]"
          >
            {site?.name}
          </h1>
          <p className="flex items-center gap-1.5 text-[15px] [overflow-wrap:anywhere] text-muted-foreground">
            <IconMap aria-hidden className="size-[1.15em] shrink-0" />
            {fullPlace(site, region)}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3.5 text-[13px] text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <IconCalendar aria-hidden className="size-[1.15em]" />
              {longDate(dive.startTime)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconClock aria-hidden className="size-[1.15em]" />
              {clockTime(dive.startTime)}
            </span>
          </p>
        </section>

        <dl aria-label="Headline figures" className="grid grid-cols-3 px-1">
          <Headline
            icon={IconArrowBarToDown}
            term="Max depth"
            value={depth(dive.maxDepth)}
            unit="m"
          />
          <Headline
            icon={IconHourglass}
            term="Duration"
            value={minutes(dive.duration)}
            unit="min"
          />
          <Headline
            icon={IconArrowBarToDownDashed}
            term="Avg depth"
            value={dive.averageDepth != null ? depth(dive.averageDepth) : none}
            unit={dive.averageDepth != null ? "m" : undefined}
          />
        </dl>

        <ProfileCard dive={dive} mod={figures.mod} />

        <Section title="Figures">
          <Card className="gap-0 py-0">
            <dl className="grid grid-cols-2 *:border-border *:even:border-l *:nth-[n+3]:border-t">
              <Figure
                term="Water temperature"
                value={temperatureRange(
                  dive.minTemperature,
                  dive.maxTemperature
                )}
                unit="°C"
              />
              <Figure
                term="SAC rate"
                value={figures.sac != null ? figures.sac.toFixed(1) : null}
                unit="L/min"
              />
              <Figure
                term="Surface interval"
                // "2 h 10" with "min" in the unit's smaller size, as on the board.
                value={
                  dive.surfaceInterval === "none"
                    ? null
                    : interval(dive.surfaceInterval).replace(/ min$/, "")
                }
                unit="min"
              />
              <Figure
                term="Gas"
                value={gasName(dive.nitrox ? dive.oxygen : null)}
              />
              <Figure
                term="Max PO₂"
                value={figures.maxPo2 != null ? bar(figures.maxPo2) : null}
                unit="bar"
                warn={figures.po2Over}
              />
              <Figure
                term={`MOD at ${figures.limit} bar`}
                value={figures.mod != null ? depth(figures.mod) : null}
                unit="m"
              />
              <Figure
                term="CNS at end"
                value={dive.cns != null ? String(dive.cns) : null}
                unit="%"
              />
              <Figure
                term="OTU"
                value={dive.otu != null ? String(dive.otu) : null}
              />
            </dl>
          </Card>
        </Section>

        <RowsSection
          title="Dive"
          rows={[
            { term: "Type", value: label(diveTypes, dive.diveType) },
            ...(dive.diveType === "training"
              ? [
                  { term: "Training agency", value: dive.trainingAgency },
                  { term: "Course", value: dive.trainingCourse },
                ]
              : []),
            {
              term: "Trip",
              value: dive.tripId ? log.trips.get(dive.tripId)?.name : null,
            },
            {
              term: "Tags",
              value: links?.tags.length ? (
                <span className="flex flex-wrap justify-end gap-1.5">
                  {links.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tags[tag as Tag]?.label ?? tag}
                    </Badge>
                  ))}
                </span>
              ) : null,
            },
            {
              term: "Weight",
              value: dive.weight != null ? `${dive.weight} kg` : null,
            },
          ]}
        />

        <RowsSection
          title="Cylinder and gas"
          rows={[
            {
              term: "Cylinder material",
              value: label(cylinderMaterials, dive.cylinderMaterial),
            },
            {
              term: "Cylinder volume",
              value:
                dive.cylinderVolume != null
                  ? `${litres(dive.cylinderVolume)} L`
                  : null,
            },
            { term: "Gas", value: gasDetail(dive.nitrox ? dive.oxygen : null) },
            {
              term: "Pressure",
              value:
                dive.startPressure != null || dive.endPressure != null
                  ? `${dive.startPressure ?? none} → ${dive.endPressure ?? none} bar`
                  : null,
            },
          ]}
        />

        <Section title="Conditions">
          <Card className="gap-0 py-0">
            <dl className="grid grid-cols-3 *:not-first:border-l not-last:border-b">
              <Tile
                term="Weather"
                value={label(weathers, dive.weather)}
                icon={weatherIcon(dive.weather)}
              />
              <Tile
                term="Surface"
                value={label(surfaces, dive.surface)}
                icon={surfaceIcon(dive.surface)}
              />
              <Tile term="Visibility" value={visibility} icon={IconEye} />
            </dl>
            <Rows
              rows={[
                {
                  icon: IconPool,
                  term: "Entry",
                  value: label(entries, dive.entry),
                },
                {
                  icon: IconArrowWaveRightUp,
                  term: "Current",
                  value: label(currents, dive.current),
                },
                {
                  icon: IconArrowsHorizontal,
                  term: "Surge",
                  value: label(surges, dive.surge),
                },
                {
                  icon: IconBarbell,
                  term: "Workload",
                  value: label(workloads, dive.workload),
                },
                {
                  icon: IconTemperatureSnow,
                  term: "Thermal comfort",
                  value: label(thermalComforts, dive.thermalComfort),
                },
              ]}
            />
          </Card>
        </Section>

        <RowsSection
          title="People"
          rows={[
            { icon: IconUsers, term: "Buddies", value: names(links?.buddies) },
            {
              icon: IconUserStar,
              term: "Dive professionals",
              value: names(links?.professionals),
            },
            {
              icon: IconBuildingStore,
              term: "Dive centre",
              value: dive.diveCentreId
                ? log.diveCentres.get(dive.diveCentreId)?.name
                : null,
            },
          ]}
        />

        <NotesSection
          notes={[
            {
              icon: IconFish,
              term: "Notable animals",
              value: dive.notableAnimals,
            },
            { icon: IconScubaMask, term: "Gear", value: dive.gearDetails },
            { icon: IconNotes, term: "General", value: dive.notes },
          ]}
        />
      </div>
    </div>
  )
}

function Headline({
  icon: Icon,
  term,
  value,
  unit,
}: {
  icon: Icon
  term: string
  value: string
  unit?: string
}) {
  return (
    <div className="flex flex-col-reverse gap-px border-border px-3 not-first:border-l first:pl-0 last:pr-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-[1.15em] shrink-0" />
        {term}
      </dt>
      <dd className="text-[28px] leading-8.5 font-semibold tracking-[-0.04em] tabular-nums">
        {value}
        {unit && (
          <span className="ml-0.5 text-[15px] font-medium tracking-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/\W+/g, "-")}`
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground"
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function Figure({
  term,
  value,
  unit,
  warn,
}: {
  term: string
  value: string | null
  unit?: string
  warn?: boolean
}) {
  return (
    <div className="flex flex-col-reverse gap-px px-4 py-3">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd
        className={cn(
          "text-lg leading-6 font-semibold tracking-[-0.02em] tabular-nums",
          warn && "text-destructive"
        )}
      >
        {value ?? none}
        {value != null && unit && (
          <span className="ml-0.5 text-[13px] font-medium tracking-normal text-muted-foreground">
            {unit}
          </span>
        )}
        {warn && (
          <>
            <IconAlertTriangle
              aria-hidden
              className="ml-1.5 inline size-4 align-[-0.125em]"
            />
            <span className="sr-only"> (over the limit)</span>
          </>
        )}
      </dd>
    </div>
  )
}

interface Row {
  icon?: Icon
  term: string
  value: ReactNode
}

// Rows with no value are left out, so a hand-logged dive shows only what
// was logged.
function Rows({ rows }: { rows: Row[] }) {
  const shown = rows.filter((row) => row.value != null && row.value !== "")
  if (!shown.length) return null
  return (
    <dl className="flex flex-col divide-y">
      {shown.map(({ icon: Icon, term, value }) => (
        <div
          key={term}
          className="flex min-h-11.5 items-center justify-between gap-4 px-4 py-2.5"
        >
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {Icon && <Icon aria-hidden className="size-[1.15em] shrink-0" />}
            {term}
          </dt>
          <dd className="text-right text-[15px] font-medium [overflow-wrap:anywhere] tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function RowsSection({ title, rows }: { title: string; rows: Row[] }) {
  if (!rows.some((row) => row.value != null && row.value !== "")) return null
  return (
    <Section title={title}>
      <Card className="gap-0 py-0">
        <Rows rows={rows} />
      </Card>
    </Section>
  )
}

function Tile({
  term,
  value,
  icon: Icon,
}: {
  term: string
  value: string | null
  icon: Icon
}) {
  return (
    <div className="flex flex-col-reverse items-center gap-0.5 px-1 pt-3.5 pb-3 text-center">
      <dt className="text-[11px] text-muted-foreground">{term}</dt>
      <dd className="flex flex-col items-center gap-1.5 text-sm font-medium tabular-nums">
        <Icon
          aria-hidden
          className={cn(
            "size-5 stroke-[1.75] text-muted-foreground",
            value == null && "opacity-50"
          )}
        />
        {value ?? none}
      </dd>
    </div>
  )
}

function weatherIcon(weather: string | null): Icon {
  if (weather === "cloudy") return IconCloud
  if (weather === "rainy") return IconCloudRain
  // Not logged shows the sun faded, as the board does.
  return IconSun
}

function surfaceIcon(surface: string | null): Icon {
  if (surface === "calm") return IconSurfaceCalm
  if (surface === "stormy") return IconSurfaceStormy
  return IconRipple
}

function NotesSection({
  notes,
}: {
  notes: (Row & { value: string | null })[]
}) {
  const shown = notes.filter((note) => note.value)
  if (!shown.length) return null
  return (
    <Section title="Notes">
      <Card className="gap-0 py-0">
        <dl className="flex flex-col divide-y">
          {shown.map(({ icon: Icon, term, value }) => (
            <div key={term} className="flex flex-col gap-1 px-4 py-3.5">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {Icon && (
                  <Icon aria-hidden className="size-[1.15em] shrink-0" />
                )}
                {term}
              </dt>
              <dd className="text-[15px] leading-[1.45] [overflow-wrap:anywhere] whitespace-pre-line">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </Section>
  )
}
