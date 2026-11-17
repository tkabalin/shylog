import {
  memo,
  startTransition,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { flushSync } from "react-dom"
import { tags as allTags, type Tag } from "@shylog/core"
import { IconPlus, IconSearch, IconUpload } from "@tabler/icons-react"
import {
  createFileRoute,
  Link,
  useElementScrollRestoration,
} from "@tanstack/react-router"
import { cn } from "cn"

import shyshark from "@/assets/shyshark.svg"

import { useAfter, usePreloadChart } from "@/chart/load"
import { FilterPills } from "@/components/filter-pills"
import { LogHeader } from "@/components/log-header"
import { MonthGroup } from "@/components/month-group"
import { NoLog } from "@/components/no-log"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { useLog, type LogView } from "@/data/log"
import { isReturn } from "@/lib/keys"
import { rootFlag } from "@/lib/root-flag"
import {
  depthScale,
  durationScale,
  headerFigures,
  isFullRange,
  matchesFilters,
  matchesSearch,
  monthGroups,
  type Filters,
  type Range,
} from "@/log/filters"
import { cardsIn, covers, monthGap, nextSpan, type Span } from "@/log/window"

// Filters live in the URL, so going back from a dive keeps them.
interface LogSearch {
  q?: string
  year?: number
  // Comma-separated rather than an array, which the router writes as JSON.
  tags?: string
  region?: string
  depth?: string
  duration?: string
}

// Lifts toasts over the floating button while it shows. A flag on the root,
// as :root:has([data-fab]) was checked again on every insertion.
const flagFab = rootFlag("data-fab")

const text = (value: unknown) =>
  typeof value === "string" && value ? value : undefined

const encodeRange = (range: Range | undefined) =>
  range && `${range.min}-${range.max}`

function decodeRange(
  value: string | undefined,
  scale: { min: number; max: number }
) {
  const match = value?.match(/^(\d+)-(\d+)$/)
  if (!match) return undefined
  const min = Math.max(scale.min, Number(match[1]))
  const max = Math.min(scale.max, Number(match[2]))
  // The whole scale is no filter, so ?depth=0-40 doesn't mark the pill active.
  if (min > max || isFullRange({ min, max }, scale)) return undefined
  return { min, max }
}

const filtersOf = (search: LogSearch): Filters => ({
  year: search.year?.toString(),
  tags: search.tags?.split(",") as Tag[] | undefined,
  region: search.region,
  depth: decodeRange(search.depth, depthScale),
  duration: decodeRange(search.duration, durationScale),
})

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): LogSearch => {
    // ?tag= is how a filtered Log read before several tags could be picked.
    const tags = (text(search.tags) ?? text(search.tag))
      ?.split(",")
      .filter(
        (tag, i, all) => Object.hasOwn(allTags, tag) && all.indexOf(tag) === i
      )
    return {
      q: text(search.q),
      // A number, so the URL reads ?year=2026 rather than a quoted string.
      year: Number.isInteger(search.year) ? (search.year as number) : undefined,
      tags: tags?.length ? tags.join(",") : undefined,
      region: text(search.region),
      depth: text(search.depth),
      duration: text(search.duration),
    }
  },
  component: LogPage,
})

function LogPage() {
  const { log } = useLog()
  // So the first dive opened draws its chart without waiting on the code.
  usePreloadChart()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  // The router updates the search after navigate returns, not in the
  // keystroke's own render, so a field bound to the URL would jump the caret.
  const [query, setQuery] = useState(search.q ?? "")
  // The router reads the URL through useSyncExternalStore, which React
  // renders at once, so the cards are deferred: the pills and count answer
  // a tap in the next frame and the list follows in slices, between frames.
  const listSearch = useDeferredValue(search)
  const listQuery = useDeferredValue(query)
  const list = useRef<HTMLDivElement>(null)

  const filters = filtersOf(search)
  const setFilters = (next: Filters) =>
    void navigate({
      search: (prev) => ({
        ...prev,
        year: next.year ? Number(next.year) : undefined,
        tags: next.tags?.length ? next.tags.join(",") : undefined,
        region: next.region,
        depth: encodeRange(next.depth),
        duration: encodeRange(next.duration),
      }),
      replace: true,
    })

  // The header follows the pills; the search narrows only the cards.
  const figures = headerFigures(
    log?.dives.filter((dive) => matchesFilters(dive, filters, log)) ?? []
  )

  if (!log) return <NoLog title="Log" skeleton={<LogSkeleton />} />

  return (
    <div className="flex min-h-full flex-col">
      <h1 className="sr-only">Log</h1>
      {!log.dives.length ? (
        <>
          <Empty className="flex-1">
            <EmptyHeader>
              {/* The app icon's shyshark, standing in for the header's, with
                  a lighter shadow than the icon's so it isn't a sticker. */}
              <EmptyMedia>
                <img
                  src={shyshark}
                  alt=""
                  width={96}
                  height={96}
                  className="size-24 drop-shadow-[0_4px_5px_rgb(42_26_10/0.28)] dark:drop-shadow-none"
                />
              </EmptyMedia>
              <EmptyTitle>No dives yet</EmptyTitle>
              <EmptyDescription>
                Log your first dive, or bring in your history from a Subsurface
                export.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {/* Links styled as shadcn's buttons, so they're read as links. */}
              <Link
                to="/dive/new"
                state={{ fromLog: true }}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  // The board's primary action: 48 px, rounder, semibold,
                  // with no link menu on a long press.
                  "h-12 w-full rounded-[14px] text-base font-semibold select-none [-webkit-touch-callout:none]"
                )}
              >
                <IconPlus data-icon="inline-start" />
                Log a dive
              </Link>
              <Link
                to="/import"
                replace
                className={buttonVariants({ variant: "link", size: "lg" })}
              >
                <IconUpload data-icon="inline-start" />
                Import from Subsurface
              </Link>
            </EmptyContent>
          </Empty>
        </>
      ) : (
        <>
          <LogHeader figures={figures}>
            {/* A desktop logs a dive from a button beside the search, in
                the sticky bar so it stays in reach, as shadcn's headers
                place their main action; a phone has the floating button. */}
            <div className="flex items-center gap-2">
              <InputGroup variant="filled" className="desk:h-9 desk:rounded-lg">
                <InputGroupAddon>
                  <IconSearch aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  aria-label="Search dives"
                  placeholder="Search"
                  enterKeyHint="search"
                  // Site and buddy names, which iOS would otherwise "correct".
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    void navigate({
                      search: (prev) => ({
                        ...prev,
                        q: event.target.value || undefined,
                      }),
                      replace: true,
                    })
                  }}
                  // The keyboard's Search key closes it; results are live.
                  onKeyDown={(event) => {
                    if (isReturn(event)) event.currentTarget.blur()
                  }}
                />
              </InputGroup>
              <Link
                to="/dive/new"
                state={{ fromLog: true }}
                // cn, not cva's className, so hidden wins over inline-flex.
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "hidden desk:inline-flex"
                )}
              >
                <IconPlus data-icon="inline-start" />
                New dive
              </Link>
            </div>
            <div className="pt-1 pb-1.5">
              <FilterPills log={log} filters={filters} onChange={setFilters} />
            </div>
          </LogHeader>
          {/* Room below the last card for the floating button. Wide screens
              keep the list to a readable column. */}
          <div
            ref={list}
            className="flex flex-col px-4 pt-3 pb-24 md:mx-auto md:w-full md:max-w-3xl desk:pb-8"
            style={{ gap: monthGap }}
          >
            <DiveList
              log={log}
              search={listSearch}
              query={listQuery}
              list={list}
            />
          </div>
          {/* The board's floating button, clear of the tab bar; a desktop
              has the header's New dive instead. */}
          <Link
            to="/dive/new"
            state={{ fromLog: true }}
            aria-label="Log a dive"
            ref={flagFab}
            className="fixed right-[max(1.25rem,calc(env(safe-area-inset-right)+0.5rem))] bottom-[calc(3.75rem+max(0.5rem,env(safe-area-inset-bottom)))] z-10 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-[scale,opacity] duration-150 ease-out select-none [-webkit-touch-callout:none] active:scale-95 motion-reduce:active:scale-100 motion-reduce:active:opacity-80 desk:hidden"
          >
            <IconPlus aria-hidden className="size-6.5 stroke-[2.25]" />
          </Link>
        </>
      )}
    </div>
  )
}

// Memoised, so the urgent render after a filter change skips the cards
// while their deferred props still hold the old values.
const DiveList = memo(function DiveList({
  log,
  search,
  query,
  list,
}: {
  log: LogView
  search: LogSearch
  query: string
  list: RefObject<HTMLDivElement | null>
}) {
  // Kept while the list only scrolls, which renders it again.
  const groups = useMemo(() => {
    const filters = filtersOf(search)
    return monthGroups(
      log.dives.filter(
        (dive) =>
          matchesFilters(dive, filters, log) && matchesSearch(dive, query, log)
      )
    )
  }, [log, search, query])
  // Mounting every card made a long log slow to open and to come back to,
  // so only the cards near the screen are; spacers keep the rest's room.
  const span = useMountedSpan(list, groups)
  const mounted = cardsIn(
    groups.map((group) => group.dives.length),
    span
  )
  return groups.length ? (
    groups.map((group, i) => (
      <MonthGroup
        key={group.key}
        group={group}
        log={log}
        from={mounted[i][0]}
        to={mounted[i][1]}
      />
    ))
  ) : (
    <p className="py-12 text-center text-sm text-muted-foreground">
      No dives match.
    </p>
  )
})

// The part of the list #main shows, from its first month as cardsIn counts.
function visibleSpan(main: HTMLElement, list: HTMLElement): Span {
  const first = list.firstElementChild ?? list
  const top =
    main.getBoundingClientRect().top - first.getBoundingClientRect().top
  return { top, bottom: top + main.clientHeight }
}

// The stretch of the list that holds cards. It starts around the position
// the router is about to restore, so going back paints the cards there in
// its first frame, then follows #main's scroll a frame behind.
function useMountedSpan(
  list: RefObject<HTMLElement | null>,
  groups: ReturnType<typeof monthGroups>
) {
  const restored = useElementScrollRestoration({
    getElement: () => document.getElementById("main"),
  })
  const [span, setSpan] = useState(() => {
    // Taken as the list's top until it renders: the header above it is
    // far shorter than the span's margins.
    const top = restored?.scrollY ?? 0
    const screen = document.getElementById("main")?.clientHeight || innerHeight
    return nextSpan(undefined, { top, bottom: top + screen })
  })
  // Set only when the span moves, a step every half screen or so: an
  // update on every scroll frame had React render the list each frame.
  const asked = useRef(span)
  // The span on screen, which a transition may not have caught up with.
  const shown = useRef(span)
  useLayoutEffect(() => {
    shown.current = span
  }, [span])
  // A filter or search that shortens the list clamps the scroll, which can
  // leave the screen outside the span, so it's measured again before that
  // render paints. Not on mount, before the router has restored the scroll.
  const measured = useRef(groups)
  useLayoutEffect(() => {
    const main = document.getElementById("main")
    if (measured.current === groups || !main || !list.current) return
    measured.current = groups
    const next = nextSpan(asked.current, visibleSpan(main, list.current))
    if (next === asked.current) return
    asked.current = next
    setSpan(next)
  }, [list, groups])
  useEffect(() => {
    const main = document.getElementById("main")
    const target = list.current
    if (!main || !target) return
    let frame = 0
    const update = () => {
      frame = 0
      const visible = visibleSpan(main, target)
      const next = nextSpan(asked.current, visible)
      // A fling or a jump past the cards on screen renders them at once,
      // or its months would show with none. A step within them is a
      // transition, built between frames rather than in one long task.
      const urgent = !covers(shown.current, visible)
      if (next === asked.current && !urgent) return
      asked.current = next
      if (urgent) flushSync(() => setSpan(next))
      else startTransition(() => setSpan(next))
    }
    const schedule = () => {
      frame ||= requestAnimationFrame(update)
    }
    main.addEventListener("scroll", schedule, { passive: true })
    addEventListener("resize", schedule)
    schedule()
    return () => {
      main.removeEventListener("scroll", schedule)
      removeEventListener("resize", schedule)
      cancelAnimationFrame(frame)
    }
  }, [list])
  return span
}

// The count, its line, the bar, a month and its first cards, each where
// it'll be, so nothing moves when the log arrives. Blank at first, as the
// profile card is, so a quick start never flashes the sketch; a slow one
// fades it in, linear so a brief one stays faint.
function LogSkeleton() {
  const late = useAfter(150)
  if (!late) return null
  return (
    <div
      aria-hidden
      className="flex animate-appear flex-col px-4 pt-3 duration-300 ease-linear md:mx-auto md:w-full md:max-w-3xl"
    >
      <Skeleton className="mb-2 h-14 w-36" />
      <div className="pt-0.5 pb-4">
        <Skeleton className="h-6 w-60" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-xl desk:h-9" />
        <Skeleton className="hidden h-9 w-26 desk:block" />
      </div>
      {/* The pills, and the bar's border below them. */}
      <div className="flex gap-1 border-b border-transparent pt-2 pb-2.5">
        {["w-26", "w-20", "w-28"].map((width) => (
          <Skeleton key={width} className={cn("h-9 rounded-full", width)} />
        ))}
      </div>
      <div className="box-content flex h-6 items-center px-1 pt-3">
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-21 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
