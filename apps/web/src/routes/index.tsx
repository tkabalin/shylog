import { useState } from "react"
import { tags, type Tag } from "@shylog/core"
import {
  IconCloudOff,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"

import shyshark from "@/assets/shyshark.svg"

import { useAfter, usePreloadChart } from "@/chart/load"
import { FilterPills } from "@/components/filter-pills"
import { LogHeader } from "@/components/log-header"
import { MonthGroup } from "@/components/month-group"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { sync, useLog } from "@/data/log"
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

// Filters live in the URL, so going back from a dive keeps them.
interface LogSearch {
  q?: string
  year?: number
  tag?: Tag
  region?: string
  depth?: string
  duration?: string
}

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

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): LogSearch => {
    const tag = text(search.tag)
    return {
      q: text(search.q),
      // A number, so the URL reads ?year=2026 rather than a quoted string.
      year: Number.isInteger(search.year) ? (search.year as number) : undefined,
      tag: tag && Object.hasOwn(tags, tag) ? (tag as Tag) : undefined,
      region: text(search.region),
      depth: text(search.depth),
      duration: text(search.duration),
    }
  },
  component: LogPage,
})

function LogPage() {
  const { log, loaded, blocked, failed } = useLog()
  // So the first dive opened draws its chart without waiting on the code.
  usePreloadChart()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  // The router commits search changes in a transition, so a field bound to
  // the URL would lag a keystroke and jump the caret. The URL follows it.
  const [query, setQuery] = useState(search.q ?? "")

  const filters: Filters = {
    year: search.year?.toString(),
    tag: search.tag,
    region: search.region,
    depth: decodeRange(search.depth, depthScale),
    duration: decodeRange(search.duration, durationScale),
  }
  const setFilters = (next: Filters) =>
    void navigate({
      search: (prev) => ({
        ...prev,
        year: next.year ? Number(next.year) : undefined,
        tag: next.tag,
        region: next.region,
        depth: encodeRange(next.depth),
        duration: encodeRange(next.duration),
      }),
      replace: true,
    })

  // The header follows the pills; the search narrows only the cards (D27).
  const filtered =
    log?.dives.filter((dive) => matchesFilters(dive, filters, log)) ?? []
  const figures = headerFigures(filtered)
  const groups = monthGroups(
    log ? filtered.filter((dive) => matchesSearch(dive, query, log)) : []
  )

  // Nothing to show until the mirror is read, or while a first sync fills
  // an empty one; if that sync fails, say so and offer another try. With a
  // log, a newer server's offer to reload is a toast (UpdateToast).
  if (!log) {
    return (
      <div className="flex min-h-full shrink-0 flex-col pt-[env(safe-area-inset-top)]">
        <h1 className="sr-only">Log</h1>
        {blocked && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="accent">
                <IconRefresh />
              </EmptyMedia>
              <EmptyTitle>Update Shylog</EmptyTitle>
              <EmptyDescription>
                The server has a newer version of Shylog. Reload to get it, and
                your log syncs again.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="lg"
                // The board's primary action: 48 px, rounder, semibold.
                className="h-12 w-full rounded-[14px] text-base font-semibold"
                onClick={() => location.reload()}
              >
                Reload
              </Button>
            </EmptyContent>
          </Empty>
        )}
        {loaded && failed && !blocked && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="accent">
                <IconCloudOff />
              </EmptyMedia>
              <EmptyTitle>Can't reach Shylog</EmptyTitle>
              <EmptyDescription>
                Your log appears here once this phone can reach the server, on
                your tailnet.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="link" size="lg" onClick={() => void sync()}>
                <IconRefresh data-icon="inline-start" />
                Try again
              </Button>
            </EmptyContent>
          </Empty>
        )}
        {!(loaded && failed) && !blocked && <LogSkeleton />}
      </div>
    )
  }

  // shrink-0: a flex item with min-h-full would shrink to the screen, and
  // the sticky bar would stop sticking where it ends.
  return (
    <div className="flex min-h-full shrink-0 flex-col">
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
                  // The board's primary action: 48 px, rounder, semibold.
                  "h-12 w-full rounded-[14px] text-base font-semibold"
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
                    if (event.key === "Enter") event.currentTarget.blur()
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
          <div className="flex flex-col gap-4 px-4 pt-3 pb-24 md:mx-auto md:w-full md:max-w-3xl desk:pb-8">
            {groups.length ? (
              groups.map((group) => (
                <MonthGroup key={group.key} group={group} log={log} />
              ))
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No dives match.
              </p>
            )}
          </div>
          {/* The board's floating button, clear of the tab bar; a desktop
              has the header's New dive instead. */}
          <Link
            to="/dive/new"
            state={{ fromLog: true }}
            aria-label="Log a dive"
            className="fixed right-[max(1.25rem,calc(env(safe-area-inset-right)+0.5rem))] bottom-[calc(3.75rem+max(0.5rem,env(safe-area-inset-bottom)))] z-10 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-[scale,opacity] duration-150 ease-out select-none [-webkit-touch-callout:none] active:scale-95 motion-reduce:active:scale-100 motion-reduce:active:opacity-80 desk:hidden"
          >
            <IconPlus aria-hidden className="size-6.5 stroke-[2.25]" />
          </Link>
        </>
      )}
    </div>
  )
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
      className="flex animate-in flex-col px-4 pt-3 duration-300 ease-linear fade-in-0 md:mx-auto md:w-full md:max-w-3xl"
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
