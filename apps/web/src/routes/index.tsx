import { useState } from "react"
import { tags, type Tag } from "@shylog/core"
import {
  IconCloudOff,
  IconNotebook,
  IconRefresh,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { usePreloadChart } from "@/chart/load"
import { FilterPills } from "@/components/filter-pills"
import { LogHeader } from "@/components/log-header"
import { MonthGroup } from "@/components/month-group"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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

  const update = blocked && (
    <Alert className="mx-4 mt-3 w-auto">
      <AlertTitle>Update Shylog</AlertTitle>
      <AlertDescription>
        The server has a newer version, so syncing has stopped. Reload to get
        it.
      </AlertDescription>
      <Button
        size="sm"
        className="mt-2 w-fit"
        onClick={() => location.reload()}
      >
        Reload
      </Button>
    </Alert>
  )

  // Nothing to show until the mirror is read, or while a first sync fills
  // an empty one; if that sync fails, say so and offer another try.
  if (!log) {
    return (
      <div className="flex min-h-full shrink-0 flex-col pt-[env(safe-area-inset-top)]">
        <h1 className="sr-only">Log</h1>
        {update}
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
          <div className="pt-[env(safe-area-inset-top)]">{update}</div>
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="accent">
                <IconNotebook />
              </EmptyMedia>
              <EmptyTitle>No dives yet</EmptyTitle>
              <EmptyDescription>
                Log your first dive, or bring in your history from a Subsurface
                export.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="link"
                size="lg"
                nativeButton={false}
                render={<Link to="/import" replace />}
              >
                <IconUpload data-icon="inline-start" />
                Import from Subsurface
              </Button>
            </EmptyContent>
          </Empty>
        </>
      ) : (
        <>
          <LogHeader figures={figures}>
            <InputGroup variant="filled">
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
            <div className="pt-1 pb-1.5">
              <FilterPills log={log} filters={filters} onChange={setFilters} />
            </div>
          </LogHeader>
          {update}
          <div className="flex flex-col gap-4 px-4 pt-3 pb-6">
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
        </>
      )}
    </div>
  )
}
