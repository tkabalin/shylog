import { useMemo } from "react"
import {
  countryName,
  entityKinds,
  normaliseName,
  type EntityKind,
} from "@shylog/core"
import {
  IconCalendar,
  IconChevronRight,
  IconAlertTriangle,
  IconFlag,
  IconMap,
  IconPlus,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { countText } from "@/components/pickers/match"
import { SheetSearch } from "@/components/pickers/sheet"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  diveCounts,
  duplicates,
  listedOf,
  tripDates,
  type Entity,
} from "@/data/entities"
import type { Dive } from "@/data/db"
import { useLog, type LogView } from "@/data/log"
import type { Icon } from "@/dive/form/rows"
import { useDesk } from "@/hooks/use-desk"
import { PageBar } from "@/you/bar"
import { pickable } from "@/you/entity-detail"
import { kindLabels } from "@/you/kinds"

interface EntitiesSearch {
  kind?: EntityKind
  q?: string
}

export const Route = createFileRoute("/you/entities/")({
  validateSearch: (search: Record<string, unknown>): EntitiesSearch => ({
    kind: entityKinds.includes(search.kind as EntityKind)
      ? (search.kind as EntityKind)
      : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  component: EntitiesPage,
})

interface Row {
  id: string
  name: string
  parts: { icon: Icon; text: string }[]
  count: number
}

// What each row says under its name, and what it counts: dives, leaving
// out ignored ones.
function rowsOf(log: LogView, kind: EntityKind): Row[] {
  // One pass over the log for every row's count, and a trip's dives for
  // its dates, rather than one per row.
  const counts = diveCounts(log, kind)
  const tripDives = new Map<string, Dive[]>()
  if (kind === "trip")
    for (const dive of log.dives)
      if (dive.tripId && !dive.ignored)
        tripDives.set(dive.tripId, [
          ...(tripDives.get(dive.tripId) ?? []),
          dive,
        ])
  return listedOf(log, kind).map(({ id, name }) => {
    const region = (regionId: string | null | undefined) =>
      regionId ? log.regions.get(regionId)?.name : undefined
    let parts: (Row["parts"][number] | null)[] = []
    if (kind === "site") {
      const site = log.sites.get(id)!
      const regionName = region(site.regionId)
      parts = [
        regionName ? { icon: IconMap, text: regionName } : null,
        { icon: IconFlag, text: countryName(site.countryCode) },
      ]
    } else if (kind === "region") {
      parts = [
        { icon: IconFlag, text: countryName(log.regions.get(id)!.countryCode) },
      ]
    } else if (kind === "diveCentre") {
      const regionName = region(log.diveCentres.get(id)!.regionId)
      parts = [regionName ? { icon: IconMap, text: regionName } : null]
    } else if (kind === "trip") {
      const dates = tripDates(tripDives.get(id) ?? [])
      parts = [dates ? { icon: IconCalendar, text: dates.text } : null]
    }
    return {
      id,
      name,
      count: counts.get(id) ?? 0,
      parts: parts.filter((part) => part != null),
    }
  })
}

// EntitiesHifi, with a Regions tab (NOTES): each kind sorted by how much it
// is used, likely duplicates flagged, and a search. People are names only.
function EntitiesPage() {
  const { log, loaded } = useLog()
  const { kind = "site", q = "" } = Route.useSearch()
  const navigate = Route.useNavigate()
  // Once per log and tab, not on every keystroke in the search.
  const { rows, dupes } = useMemo(() => {
    if (!log) return { rows: [], dupes: new Map<string, Entity>() }
    const rows = rowsOf(log, kind)
    return {
      rows,
      dupes: duplicates(
        log,
        kind,
        new Map(rows.map((row) => [row.id, row.count]))
      ),
    }
  }, [log, kind])
  if (!loaded) return null
  const label = kindLabels[kind]
  const key = normaliseName(q)
  const shown = rows
    .filter((row) => !key || normaliseName(row.name).includes(key))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  // The search replaces the entry, so Back leaves the screen.
  const setSearch = (next: EntitiesSearch) =>
    void navigate({
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
    })
  return (
    <div className="flex min-h-full flex-col">
      <PageBar
        back={{ label: "You", to: "/you" }}
        title={label.title}
        end={pickable(kind) && <NewButton kind={kind} />}
      />
      <div className="flex flex-col gap-2.5 px-4 pt-1 pb-3 md:mx-auto md:w-full md:max-w-xl">
        <SheetSearch
          value={q}
          onChange={(next) => setSearch({ q: next || undefined })}
          label={`Search ${label.title.toLowerCase()}`}
          // A desktop's as compact as the Log's.
          className="desk:h-9 desk:rounded-lg"
        />
      </div>
      {/* Nothing until the first sync has filled the log, so a fresh
          phone doesn't say there are none. */}
      {log && (
        <div className="flex flex-col gap-3 px-4 pb-8 md:mx-auto md:w-full md:max-w-xl">
          {shown.length > 0 ? (
            <Card className="gap-0 divide-y py-0">
              {shown.map((row) => {
                const dupe = dupes.get(row.id)
                const unit = row.count === 1 ? "dive" : "dives"
                return (
                  <Link
                    key={row.id}
                    to="/you/entities/$kind/$id"
                    params={{ kind, id: row.id }}
                    state={{ pushed: true }}
                    aria-label={`${row.name}, ${countText(row.count)} ${unit}${dupe ? `, looks like ${dupe.name}` : ""}`}
                    className="flex min-h-14 items-center gap-3 py-3 pr-3 pl-4 transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-muted/60 active:bg-muted active:duration-0"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-medium">
                        {row.name}
                      </span>
                      {row.parts.length > 0 && (
                        <span className="flex min-w-0 items-center gap-3 text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
                          {row.parts.map((part, i) => (
                            <span
                              // Not the text: a region can share its
                              // country's name.
                              key={i}
                              // Only the first part (a region) gives way;
                              // a country is short.
                              className="inline-flex min-w-0 items-center gap-1 not-first:shrink-0"
                            >
                              <part.icon
                                aria-hidden
                                className="size-[1.15em] shrink-0"
                              />
                              <span className="truncate">{part.text}</span>
                            </span>
                          ))}
                        </span>
                      )}
                      {dupe && (
                        <span className="flex min-w-0 items-center gap-1 text-[13px] text-orange-700 dark:text-orange-400">
                          <IconAlertTriangle
                            aria-hidden
                            className="size-[1.15em] shrink-0"
                          />
                          <span className="truncate">
                            Looks like {dupe.name}
                          </span>
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[15px] text-muted-foreground tabular-nums">
                      {countText(row.count)}
                    </span>
                    <IconChevronRight
                      aria-hidden
                      className="size-4.5 shrink-0 text-muted-foreground/60"
                    />
                  </Link>
                )
              })}
            </Card>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {key
                ? `No ${label.title.toLowerCase()} match.`
                : pickable(kind)
                  ? `No ${label.title.toLowerCase()} yet.`
                  : `No ${label.title.toLowerCase()} yet. They’re added from a dive’s form.`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// A new trip, dive centre or person, one level deeper, so Back returns to
// this list. A shadcn button with a mouse, as the Log's New dive is.
function NewButton({ kind }: { kind: EntityKind }) {
  const desk = useDesk()
  const one = kindLabels[kind].one
  return (
    <Link
      to="/you/entities/$kind/new"
      params={{ kind }}
      state={{ pushed: true }}
      aria-label={`New ${one}`}
      className={
        desk
          ? buttonVariants()
          : "inline-flex size-11 items-center justify-center text-primary transition-opacity duration-150 select-none [-webkit-touch-callout:none] hover:opacity-70 active:opacity-50 active:duration-0"
      }
    >
      {desk ? (
        <>
          <IconPlus data-icon="inline-start" />
          New {one}
        </>
      ) : (
        <IconPlus aria-hidden className="size-5.5 stroke-[2.25]" />
      )}
    </Link>
  )
}
