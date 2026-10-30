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
  IconArrowDown,
  IconArrowsDiff,
  IconArrowUp,
  IconArrowWaveRightUp,
  IconBarbell,
  IconBuildingStore,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconCloud,
  IconCloudRain,
  IconEye,
  IconEyeOff,
  IconFish,
  IconHourglass,
  IconInfoCircle,
  IconMap,
  IconNotes,
  IconPencil,
  IconPool,
  IconRestore,
  IconRipple,
  IconScubaDivingTank,
  IconSun,
  IconTrash,
  IconTemperatureSnow,
  IconUsers,
  IconUserStar,
  type IconProps,
} from "@tabler/icons-react"
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useRouter,
} from "@tanstack/react-router"
import { cn } from "cn"

import { loadChart, retryChart } from "@/chart/load"
import { backToLog, closeToLog } from "@/components/app-nav"
import { IconSurfaceCalm, IconSurfaceStormy } from "@/components/icons"
import { ProfileCard } from "@/components/profile-card"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { DeleteSheet, takeLeave } from "@/dive/delete-sheet"
import { useBack } from "@/you/bar"
import { restore } from "@/dive/restore"
import type { Dive } from "@/data/db"
import { currentLog, useLog, type LogView } from "@/data/log"
import { loadProfile, retryProfile } from "@/data/samples"
import { useSaveCelebration } from "@/dive/celebration"
import { diveFigures, recentSac } from "@/dive/figures"
import { computerName, differences } from "@/dive/form/values"
import { clockTime, deletedDay, longDate } from "@/format/dates"
import {
  bar,
  depth,
  gasDetail,
  interval,
  litres,
  minutes,
  temperatureRange,
} from "@/format/figures"
import { fullPlace } from "@/format/place"
import { useDesk } from "@/hooks/use-desk"

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
  const router = useRouter()
  const goBack = useBack()
  // Deleted from its form, which came back here: on to whatever opened
  // the dive, as a delete from this page does. A draft is gone by now.
  useEffect(() => {
    if (takeLeave(diveId) && !goBack()) closeToLog(router)
    // Once, as the form hands back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const dive = log?.dive.get(diveId)
  // Nothing until the first sync has filled the log, so a fresh phone
  // doesn't say the dive is missing.
  if (!loaded || !log) return null
  // A deleted dive still opens, from Recently deleted, to be restored.
  if (!dive) {
    return (
      <div className="flex flex-col gap-2 p-4 pt-[calc(1rem+env(safe-area-inset-top))] md:mx-auto md:w-full md:max-w-3xl">
        <BackLink />
        <h1 className="text-xl font-semibold">Dive not found</h1>
        <p className="text-muted-foreground">
          It may have been deleted, or the log on this device is out of date.
        </p>
      </div>
    )
  }
  // The full-screen profile opens over the detail, which stays put
  // underneath, so closing it lands where the dive was scrolled to.
  return (
    <>
      <DiveDetail dive={dive} log={log} />
      <Outlet />
    </>
  )
}

// On a desktop (desk:) the bar reads as shadcn's page headers do: where
// the dive sits as a breadcrumb, and Edit as an outline button.
function DeskBar({ dive, site }: { dive: Dive; site: string | undefined }) {
  const router = useRouter()
  const goBack = useBack()
  const parent = useParent()
  return (
    <>
      <Breadcrumb className="min-w-0 pl-4">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem>
            <BreadcrumbLink
              className="-mx-1 rounded-sm px-1 outline-offset-2"
              render={
                parent ? (
                  <Link
                    to={parent.to}
                    replace
                    onClick={(event) => void goBack(event)}
                  />
                ) : (
                  <Link
                    to="/"
                    replace
                    onClick={(event) => backToLog(router, event)}
                  />
                )
              }
            >
              {parent?.desk ?? "Log"}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            {/* Under an entity that may be the site itself, so the dive
                is named by its number or date. */}
            <BreadcrumbPage className="truncate">
              {parent?.to === "/you"
                ? dive.number != null
                  ? `Dive ${dive.number}`
                  : longDate(dive.startTime)
                : site}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {/* A link styled as shadcn's button, so it's still read as a link.
          A deleted dive is restored before it can be edited. */}
      {!dive.deletedAt && (
        <Link
          to="/dive/$diveId/edit"
          params={{ diveId: dive.id }}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "mr-4 justify-self-end"
          )}
        >
          <IconPencil data-icon="inline-start" />
          Edit
        </Link>
      )}
    </>
  )
}

const backLink =
  "inline-flex h-11 items-center gap-0.5 justify-self-start pr-2 pl-1 text-base font-medium text-primary transition-opacity duration-150 select-none [-webkit-touch-callout:none] hover:opacity-70 active:opacity-50 active:duration-0"

// A screen inside You the dive was pushed from: Recently deleted, or an
// entity's detail, which Back returns to; with nothing behind, a fresh
// list or You takes the dive's place.
function useParent() {
  const { fromDeleted, parent } = useRouter().state.location.state
  if (fromDeleted)
    return {
      label: "Deleted",
      desk: "Recently deleted",
      to: "/you/deleted" as const,
    }
  if (parent) return { label: parent, desk: parent, to: "/you" as const }
  return null
}

function BackLink() {
  const router = useRouter()
  const goBack = useBack()
  const parent = useParent()
  if (parent)
    return (
      <Link
        to={parent.to}
        replace
        onClick={(event) => void goBack(event)}
        className={cn(backLink, "min-w-0")}
      >
        <IconChevronLeft
          aria-hidden
          className="size-5.5 shrink-0 stroke-[2.25]"
        />
        <span className="truncate">{parent.label}</span>
      </Link>
    )
  return (
    // With no Log behind it, a fresh Log takes the dive's place, so swiping
    // back doesn't reopen it.
    <Link
      to="/"
      replace
      onClick={(event) => backToLog(router, event)}
      className={backLink}
    >
      <IconChevronLeft aria-hidden className="size-5.5 stroke-[2.25]" />
      Log
    </Link>
  )
}

// The bar is always solid, so a quick flick never shows text through it
// before a scroll frame has run. It takes its line as soon as anything
// scrolls under it, and the site's name once the title has passed under it.
// Read from layout, so the safe-area inset above the bar counts.
function useBar() {
  const barRef = useRef<HTMLElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const [state, setState] = useState({ scrolled: false, titled: false })
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("#main")
    if (!main) return
    let frame = 0
    const update = () => {
      frame = 0
      const scrolled = main.scrollTop > 0
      const titled =
        !!barRef.current &&
        !!title.current &&
        title.current.getBoundingClientRect().bottom <=
          barRef.current.getBoundingClientRect().bottom
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
  return { barRef, title, ...state }
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
  const differing = differences(dive, log.fieldMeta.get(dive.id))
  const { barRef, title, scrolled, titled } = useBar()
  const desk = useDesk()
  const saved = useLocation({ select: (location) => !!location.state.saved })
  const headline = useRef<HTMLDListElement>(null)
  useSaveCelebration(dive, saved, headline)
  // A reload keeps history state, so the entry drops saved once read, or
  // every refresh of the dive would celebrate it again.
  const router = useRouter()
  useEffect(() => {
    if (!saved) return
    router.history.replace(router.state.location.href, {
      ...router.state.location.state,
      saved: undefined,
    })
  }, [saved, router])
  const goBack = useBack()
  const [deleting, setDeleting] = useState(false)
  // Back to the entity it was opened from, or its Log, or a fresh Log
  // takes its place.
  const leave = () => goBack() || closeToLog(router)
  const [restoring, setRestoring] = useState(false)

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
        className="sticky top-0 z-30 grid h-[calc(3.25rem+env(safe-area-inset-top))] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-transparent bg-background px-2 pt-[env(safe-area-inset-top)] transition-[border-color] duration-200 data-scrolled:border-border md:px-[max(0.5rem,calc((100%-48rem)/2))] desk:grid-cols-[minmax(0,1fr)_auto] desk:gap-x-4"
      >
        {desk ? (
          <DeskBar dive={dive} site={site?.name} />
        ) : (
          <>
            <BackLink />
            {/* A visual echo of the h1, which screen readers already have. */}
            <span
              aria-hidden
              className="max-w-50 translate-y-1 truncate text-base font-semibold tracking-[-0.015em] opacity-0 transition-[opacity,translate] duration-200 ease-out in-data-titled:translate-y-0 in-data-titled:opacity-100 motion-reduce:translate-y-0"
            >
              {site?.name}
            </span>
            {!dive.deletedAt && (
              <Link
                to="/dive/$diveId/edit"
                params={{ diveId: dive.id }}
                className="inline-flex h-11 items-center gap-1 justify-self-end px-2.5 text-base font-medium text-primary transition-opacity duration-150 select-none [-webkit-touch-callout:none] hover:opacity-70 active:opacity-50 active:duration-0"
              >
                <IconPencil aria-hidden className="size-[1.15em]" />
                Edit
              </Link>
            )}
          </>
        )}
      </header>

      {/* Wide screens keep the dive to a column, with the bar's actions
          over it, as the form does. */}
      <div className="flex flex-col gap-6 px-4 pt-5 pb-8 md:mx-auto md:w-full md:max-w-3xl">
        <section className="flex flex-col gap-1 px-1">
          <p className="flex min-h-5.5 items-center text-sm font-medium text-muted-foreground tabular-nums">
            {dive.deletedAt ? (
              <span className="inline-flex h-5.5 items-center gap-1 rounded-full bg-muted pr-2 pl-1.5 text-xs font-medium">
                <IconTrash aria-hidden className="size-3.5" />
                Deleted {deletedDay(dive.deletedAt)}
              </span>
            ) : dive.ignored ? (
              <>
                <IconEyeOff aria-hidden className="size-4" />
                <span className="sr-only">Ignored</span>
              </>
            ) : (
              dive.number != null && (
                <span className="inline-flex h-5.5 items-center rounded-full bg-primary/12 px-2.5 text-[13px] font-semibold text-primary">
                  Dive {dive.number}
                </span>
              )
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

        <dl
          ref={headline}
          aria-label="Headline figures"
          className="grid grid-cols-3 px-1"
        >
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

        {dive.deletedAt || restoring ? (
          // Once restored it folds away, margin and all, rather than the
          // page jumping up under the thumb that tapped Restore.
          <div
            onTransitionEnd={(event) => {
              if (event.target === event.currentTarget && !dive.deletedAt)
                setRestoring(false)
            }}
            className={cn(
              "-mt-2 grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-opacity",
              !dive.deletedAt && "-mt-6 grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex min-h-12 items-center gap-2.5 rounded-xl bg-muted py-1.5 pr-1.5 pl-3.5 text-sm">
                <span className="flex-1 text-muted-foreground">
                  Not in your log, stats or export
                </span>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={async () => {
                    setRestoring(true)
                    // Kept until the fold ends. A failure, or a sync that
                    // didn't land, leaves it as it was to try again.
                    const back = await restore(dive.id, site?.name)
                    if (!back || currentLog()?.dive.get(dive.id)?.deletedAt)
                      setRestoring(false)
                  }}
                  // Reaches 44px tall, as the cards' Restore does.
                  className="relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary/12 pr-3 pl-2.5 font-medium text-primary transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-inset-y-1 hover:opacity-70 active:opacity-50 active:duration-0 disabled:opacity-50"
                >
                  <IconRestore aria-hidden className="size-4" />
                  Restore
                </button>
              </div>
            </div>
          </div>
        ) : (
          differing.length > 0 && (
            // Leads to the form, where each value can be used or dismissed.
            <Link
              to="/dive/$diveId/edit"
              params={{ diveId: dive.id }}
              className="-mt-2 flex min-h-11 items-center gap-2.5 rounded-xl bg-primary/8 px-3.5 text-sm transition-colors duration-150 hover:bg-primary/11 active:bg-primary/14 active:duration-0"
            >
              <IconArrowsDiff
                aria-hidden
                className="size-4.5 shrink-0 text-primary"
              />
              <span className="flex-1">
                {differing.length}{" "}
                {differing.length === 1 ? "value differs" : "values differ"}{" "}
                from{" "}
                {/* Kept together, so the model never sits alone on a line. */}
                <span className="whitespace-nowrap">
                  the {computerName(dive.computerModel)}
                </span>
              </span>
              <span className="inline-flex items-center gap-0.5 font-medium text-primary">
                Review
                <IconChevronRight aria-hidden className="size-4" />
              </span>
            </Link>
          )
        )}

        <ProfileCard dive={dive} mod={figures.mod} />

        <Section title="Figures">
          <Card className="gap-0 py-0">
            {/* A row of its own, for the width its comparison needs. The
                gas the board shows here is under Cylinder and gas. */}
            {figures.sac != null && (
              <dl className="border-b">
                <SacFigure sac={figures.sac} rates={recentSac(dive, log)} />
              </dl>
            )}
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
                term="Max PO₂"
                value={figures.maxPo2 != null ? bar(figures.maxPo2) : null}
                unit="bar"
                warn={figures.po2Over}
                // Up to just past the setting, so its mark sits near the end.
                meter={
                  figures.maxPo2 != null && (
                    <Meter
                      value={figures.maxPo2}
                      max={figures.limit + 0.2}
                      mark={figures.limit}
                      over={figures.po2Over}
                    />
                  )
                }
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
                warn={dive.cns != null && dive.cns > 100}
                info={
                  <Info term="CNS" title="CNS oxygen clock">
                    Shown against NOAA’s 100% limit. It carries over between
                    dives and halves every 90 minutes at the surface.
                  </Info>
                }
                meter={
                  dive.cns != null && (
                    <Meter value={dive.cns} max={100} over={dive.cns > 100} />
                  )
                }
              />
              <Figure
                term="OTU"
                value={dive.otu != null ? String(dive.otu) : null}
                // No bar: NOAA's limit is per day, and a bar for one dive
                // would look safe on a day that went past it.
                info={
                  <Info term="OTU" title="Oxygen tolerance units">
                    NOAA’s limit for repeated days of diving is 300 OTU a day,
                    across all the day’s dives. A single day allows up to 850.
                  </Info>
                }
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
            {
              icon: IconScubaDivingTank,
              term: "Gear",
              value: dive.gearDetails,
            },
            { icon: IconNotes, term: "General", value: dive.notes },
          ]}
        />

        {!dive.deletedAt && (
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="inline-flex h-11 items-center gap-1.5 self-center px-4 text-[15px] font-medium text-destructive transition-opacity duration-150 select-none hover:opacity-70 active:opacity-50 active:duration-0"
          >
            <IconTrash aria-hidden className="size-[1.15em]" />
            Delete dive
          </button>
        )}
        {/* Mounted whatever the dive's state, so the sync that marks it
            deleted doesn't tear the sheet away before the page closes. */}
        <DeleteSheet
          open={deleting}
          onOpenChange={setDeleting}
          diveId={dive.id}
          draft={!!dive.draft}
          onDeleted={leave}
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

// Bars sit on the label's line rather than under it, so a cell with one is
// no taller than its neighbour.
function Figure({
  term,
  value,
  unit,
  warn,
  info,
  meter,
}: {
  term: string
  value: string | null
  unit?: string
  warn?: boolean
  info?: ReactNode
  meter?: ReactNode
}) {
  return (
    <div className="flex flex-col-reverse gap-px px-4 py-3">
      <dt className="flex min-h-4 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
        {term}
        {info}
        {meter}
      </dt>
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

// How far a figure is towards its limit. The number beside it says it all
// for a screen reader, so the bar is hidden from one. It fills the line
// after the label, so the bars in a column end together.
function Meter({
  value,
  max,
  mark,
  over,
}: {
  value: number
  max: number
  mark?: number
  over?: boolean
}) {
  return (
    <span aria-hidden className="flex min-w-11 flex-1 pl-2">
      <span className="relative h-1 w-full rounded-full bg-foreground/8">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            over ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${Math.min(value / max, 1) * 100}%` }}
        />
        {mark != null && (
          <span
            className="absolute -inset-y-0.75 -ml-px w-0.5 rounded-[1px] bg-foreground/55"
            style={{ left: `${(mark / max) * 100}%` }}
          />
        )}
      </span>
    </span>
  )
}

// Tapped, not hovered, so it works on a phone. The icon's hit area reaches
// 44px around it.
function Info({
  term,
  title,
  children,
}: {
  term: string
  title: string
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${term}`}
        className="relative inline-grid size-4 shrink-0 place-items-center rounded-full outline-offset-2 transition-opacity duration-150 after:absolute after:-inset-3.5 hover:opacity-70 active:opacity-50 active:duration-0"
      >
        <IconInfoCircle aria-hidden className="size-[15px]" />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  )
}

// SAC means little alone, since it's personal, so it's set against the
// diver's recent dives: how far from their average, and where it falls in
// their range. Without five earlier rates it shows alone.
function SacFigure({ sac, rates }: { sac: number; rates: number[] | null }) {
  const average = rates && rates.reduce((a, b) => a + b, 0) / rates.length
  // Rounded as shown, so a difference that shows as 0.0 has no arrow.
  const difference = average != null ? Number((sac - average).toFixed(1)) : 0
  const Arrow = difference < 0 ? IconArrowDown : IconArrowUp
  const away =
    difference === 0
      ? "the same as"
      : `${Math.abs(difference).toFixed(1)} ${difference < 0 ? "lower" : "higher"} than`
  return (
    <div className="flex flex-col-reverse gap-px px-4 py-3">
      <dt className="flex min-h-4 items-center gap-1 text-xs text-muted-foreground">
        SAC rate
        {rates && average != null && (
          <>
            <Info term="the SAC comparison" title="Against your recent dives">
              The band is the range of your 5 dives with a SAC rate before this
              one, the line their average, and the dot this dive. Lower uses
              less gas.
            </Info>
            <Spread rates={rates} average={average} sac={sac} />
          </>
        )}
      </dt>
      <dd className="flex items-baseline text-lg leading-6 font-semibold tracking-[-0.02em] tabular-nums">
        {sac.toFixed(1)}
        <span className="ml-0.5 text-[13px] font-medium tracking-normal text-muted-foreground">
          L/min
        </span>
        {rates && (
          <span className="ml-auto self-center pl-3 text-[13px] font-medium tracking-normal text-muted-foreground">
            <span aria-hidden className="inline-flex items-center gap-0.5">
              {difference !== 0 && <Arrow className="size-3.5 stroke-[2.25]" />}
              {Math.abs(difference).toFixed(1)} vs last 5
            </span>
            <span className="sr-only">, {away} your last 5 dives</span>
          </span>
        )}
      </dd>
    </div>
  )
}

// The five earlier rates' range as a band, their average as a line, and
// this dive as a dot, padded so the dot never sits on the strip's end.
function Spread({
  rates,
  average,
  sac,
}: {
  rates: number[]
  average: number
  sac: number
}) {
  const low = Math.min(...rates)
  const high = Math.max(...rates)
  const pad = Math.max((Math.max(high, sac) - Math.min(low, sac)) * 0.15, 0.3)
  const start = Math.min(low, sac) - pad
  const span = Math.max(high, sac) + pad - start
  const at = (rate: number) => ((rate - start) / span) * 100
  return (
    <span
      aria-hidden
      className="relative ml-auto h-3 w-[58%] max-w-60 shrink-0"
    >
      <span className="absolute inset-x-0 top-[5px] h-0.5 rounded-full bg-foreground/8" />
      <span
        className="absolute top-[3px] h-1.5 rounded-full bg-primary/35"
        style={{ left: `${at(low)}%`, width: `${at(high) - at(low)}%` }}
      />
      <span
        className="absolute inset-y-px -ml-px w-0.5 rounded-[1px] bg-foreground/55"
        style={{ left: `${at(average)}%` }}
      />
      <span
        className="absolute top-0.5 -ml-1 size-2 rounded-full bg-primary ring-2 ring-card"
        style={{ left: `${at(sac)}%` }}
      />
    </span>
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
