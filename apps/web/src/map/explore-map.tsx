import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from "react"
import {
  IconArrowBarToDown,
  IconChevronUp,
  IconMapPin,
} from "@tabler/icons-react"
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { cn } from "cn"

import {
  ClearFilters,
  MultiFilter,
  useClearShown,
} from "@/components/filter-pills"
import { SheetSearch } from "@/components/pickers/sheet"
import { RangeFilter } from "@/components/range-filter"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { useDesk } from "@/hooks/use-desk"
import { depthScale } from "@/log/filters"
import { PageBar, useBack } from "@/you/bar"

import Basemap, { listCard, useMapFrame, type MapState } from "./basemap"
import {
  filterSites,
  filtersOf,
  matchesSite,
  searchOf,
  searchSites,
  typeOptions,
  type SiteFilters,
} from "./filters"
import { exploreRoot } from "./home"
import {
  DeskMapOptions,
  floating,
  PhoneMapOptions,
  zonesShown,
} from "./map-options"
import { withoutView, type ExploreSearch } from "./search"
import { ImageViewer } from "./image-viewer"
import { SiteCard, SiteSheet } from "./site-sheet"
import { SiteList } from "./site-list"
import { siteById, type Site } from "./sites"
import { ZoneRulesList } from "./zone-rules-list"
import type { Mpa } from "./zone-rules"

const count = (n: number) => `${n} ${n === 1 ? "site" : "sites"}`

// The list's search, kept while the app runs, so the list opens again as
// it was left.
let kept = ""

// The dive site map with what floats over it: on a phone the filters, the
// site count that opens the list, Map options and the site's sheet; from
// desk: up a card holding the list, a site or the rules.
export default function Explore({
  onState,
}: {
  onState: (state: MapState) => void
}) {
  const search = useSearch({ from: "/explore" })
  const navigate = useNavigate({ from: "/explore" })
  const desk = useDesk()
  const goBack = useBack()
  const { types, depth } = search
  const filters = useMemo(() => filtersOf({ types, depth }), [types, depth])
  const filtered = useMemo(() => filterSites(filters), [filters])
  const zones = useSyncExternalStore(zonesShown.subscribe, zonesShown.get)
  const [hovered, setHovered] = useState<string>()
  const [query, setQueryState] = useState(kept)
  const setQuery = (next: string) => setQueryState((kept = next))

  // Sideways moves replace the address, so Back leaves Explore: a pick, a
  // filter, the desktop card's views. The entry's state stays, so a filter
  // changed on the phone's list leaves it marked as pushed.
  const replace = useCallback(
    (patch: Partial<ExploreSearch>) =>
      void navigate({
        search: (prev: ExploreSearch) => ({ ...prev, ...patch }),
        replace: true,
        state: true,
      }),
    [navigate]
  )
  // A pick never opens the viewer an old address left in it.
  const pick = useCallback(
    (id: string | undefined) => replace({ site: id, image: undefined }),
    [replace]
  )
  // A filter that hides the picked site puts it down.
  const setFilters = (next: SiteFilters) => {
    const picked = search.site ? siteById.get(search.site) : undefined
    replace({
      ...searchOf(next),
      ...(picked && !matchesSite(picked, next) && { site: undefined }),
    })
  }
  // On a phone the list and the rules are screens a level deeper, so they
  // push and Back closes them; on a desktop they're the card's views.
  const open = (view: "list" | "rules", mpa?: Mpa) => {
    if (desk) return replace({ view: view === "rules" ? view : undefined, mpa })
    void navigate({
      search: (prev: ExploreSearch) => ({ ...prev, view, mpa }),
      state: { pushed: true },
    })
  }
  const closeView = () => replace({ view: undefined, mpa: undefined })
  // The viewer is a level deeper on both, so Back closes it. Neither move
  // scrolls the sheet, whose place in the text is kept underneath.
  const openImage = (image: number) =>
    void navigate({
      search: (prev: ExploreSearch) => ({ ...prev, image }),
      state: { pushed: true },
      resetScroll: false,
    })
  const closeImage = () => {
    if (goBack()) return
    void navigate({
      search: (prev: ExploreSearch) => ({ ...prev, image: undefined }),
      replace: true,
      state: true,
      resetScroll: false,
    })
  }
  const showImage = (image: number) =>
    void navigate({
      search: (prev: ExploreSearch) => ({ ...prev, image }),
      replace: true,
      state: true,
      resetScroll: false,
    })
  // The map's entry under the phone's list has the filters it was opened
  // with, so ones changed on the list are put back once Back closes it,
  // with the site picked there, in one step.
  const listFilters = useRef<SiteFilters>(undefined)
  const listPick = useRef<string>(undefined)
  // A tap on Explore's own tab: a pushed screen closes as its Back does,
  // and the site goes once it has.
  const rooted = useRef(false)
  const toRoot = useEffectEvent(() => {
    if (search.view && !desk) {
      rooted.current = true
      if (goBack()) return
      rooted.current = false
    }
    replace({ view: undefined, mpa: undefined, site: undefined })
  })
  useEffect(() => {
    exploreRoot.current = toRoot
    return () => {
      exploreRoot.current = undefined
    }
  }, [])
  const pickFromList = (id: string) => {
    listPick.current = id
    if (goBack()) return
    listPick.current = undefined
    replace({ site: id, view: undefined })
  }
  const view = search.view
  const mapSite = search.site
  useEffect(() => {
    if (view === "list") {
      listFilters.current = filters
      return
    }
    const set = listFilters.current
    const site = listPick.current
    const root = rooted.current
    listFilters.current = listPick.current = undefined
    rooted.current = false
    const changed = !!set && set !== filters
    if (!changed && !site && !root) return
    // The map's entry still has its site, which the list's filters may hide.
    const held = mapSite ? siteById.get(mapSite) : undefined
    replace({
      ...(changed && searchOf(set)),
      ...(root
        ? { site: undefined }
        : site
          ? { site }
          : changed && held && !matchesSite(held, set) && { site: undefined }),
    })
  }, [view, filters, replace, mapSite])

  const picked = search.site ? siteById.get(search.site) : undefined
  const listed = useMemo(() => searchSites(query, filtered), [query, filtered])
  // Only the desktop's list rings a pin; a pick or the rules replace it
  // with no mouseleave, so the ring would stay behind.
  const listShown = desk && !picked && view !== "rules"
  // Nor stay on a site the search or filters took off the list.
  if (hovered && (!listShown || !listed.some(({ id }) => id === hovered))) {
    setHovered(undefined)
  }
  const pills = (props: { float?: boolean; className?: string }) => (
    <Filters filters={filters} onChange={setFilters} {...props} />
  )
  return (
    // No box of its own: the phone's screens cover the whole tab, its
    // top strip included.
    <div className="size-full">
      <Basemap
        site={search.site}
        onPick={pick}
        onState={onState}
        filtered={filtered}
        zones={zones}
        hovered={hovered}
      >
        {desk ? (
          <>
            {view === "rules" ? (
              <RulesCard mpa={search.mpa} from={picked} onBack={closeView} />
            ) : picked ? (
              <SiteCard
                site={picked}
                onRules={(mpa) => open("rules", mpa)}
                onImage={openImage}
              />
            ) : (
              <ListCard
                total={listed.length}
                query={query}
                onQuery={setQuery}
                filters={pills({})}
              >
                <SiteList
                  desk
                  sites={listed}
                  query={query}
                  onPick={pick}
                  onHover={setHovered}
                />
              </ListCard>
            )}
            <DeskMapOptions
              zones={zones}
              onZones={zonesShown.set}
              onRules={() => open("rules")}
            />
          </>
        ) : (
          <>
            <div
              role="group"
              aria-label="Filters"
              // Room below for the pills' shadow, which the scrolling row
              // would otherwise cut off.
              className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3 pt-2 pb-4 *:pointer-events-auto"
            >
              {pills({ float: true })}
              <button
                type="button"
                aria-label={`List of ${count(filtered.length)}`}
                onClick={() => open("list")}
                // A 44 px target, as the pills' own reach is.
                className={cn(
                  floatingPill,
                  pillShape,
                  "ml-auto pl-2.5 tabular-nums after:absolute after:inset-x-0 after:-inset-y-1"
                )}
              >
                <IconMapPin aria-hidden />
                <span aria-live="polite">{count(filtered.length)}</span>
              </button>
            </div>
            <div className="absolute top-13 right-3 z-[5]">
              <PhoneMapOptions
                zones={zones}
                onZones={zonesShown.set}
                onRules={() => open("rules")}
                covered={!!view}
              />
            </div>
            <SiteSheet
              site={picked}
              onClose={() => pick(undefined)}
              onRules={(mpa) => open("rules", mpa)}
              onImage={openImage}
            />
          </>
        )}
      </Basemap>
      {picked && search.image !== undefined && (
        <ImageViewer
          key={picked.id}
          site={picked}
          start={search.image}
          onClose={closeImage}
          onShow={showImage}
        />
      )}
      {!desk && view === "list" && (
        <Screen title="Dive sites">
          <div className="shrink-0 px-4 pt-1">
            <SheetSearch
              value={query}
              onChange={setQuery}
              label="Search sites"
              capitalise
            />
          </div>
          {pills({ className: "px-1.5 pt-2 pb-1" })}
          <Scroller>
            <SiteList
              sites={listed}
              query={query}
              picked={search.site}
              onPick={pickFromList}
            />
          </Scroller>
        </Screen>
      )}
      {!desk && view === "rules" && (
        <Screen title="Marine protected areas">
          <ZoneRulesList mpa={search.mpa} />
        </Screen>
      )}
    </div>
  )
}

const pillShape = "h-9 gap-1 rounded-full px-3 text-[13px] font-medium"
// Solid over the map, and untinted when set: a tint read badly over the
// busy map, and the pill's words already say what's set.
const untinted =
  "data-active:bg-transparent data-active:text-foreground dark:data-active:bg-transparent data-active:active:bg-muted"
const floatingPill = cn(
  floating,
  "flex shrink-0 items-center whitespace-nowrap [&_svg]:size-[1.15em]",
  "not-data-active:hover:bg-background data-active:bg-background data-active:text-foreground dark:data-active:bg-background"
)

// The type and max depth pills: the Log's tag filter and Depth range,
// after its Clear.
function Filters({
  filters,
  onChange,
  float = false,
  className,
}: {
  filters: SiteFilters
  onChange: (filters: SiteFilters) => void
  // Over the map, in the row with the site count; else in a row of their own.
  float?: boolean
  className?: string
}) {
  const clear = useClearShown(filters.types.length > 0 || !!filters.depth)
  const pills = (
    <>
      <ClearFilters
        shown={clear.shown}
        onClear={() => onChange({ types: [] })}
        className={float ? floatingPill : undefined}
      />
      <MultiFilter
        name="Type"
        any="Any type"
        options={typeOptions}
        value={filters.types}
        onChange={(types) => onChange({ ...filters, types })}
        {...clear.menu}
        className={float ? cn(floatingPill, "pr-2") : untinted}
      />
      <RangeFilter
        label="Max depth"
        noun="max depth"
        unit="m"
        unitName="metres"
        icon={IconArrowBarToDown}
        scale={depthScale}
        value={filters.depth}
        onApply={(depth) => onChange({ ...filters, depth })}
        className={float ? cn(floatingPill, "pl-2.5") : untinted}
      />
    </>
  )
  if (float) return pills
  return (
    <div
      role="group"
      aria-label="Filters"
      className={cn("flex gap-1", className)}
    >
      {pills}
    </div>
  )
}

// A full screen inside the tab, over the map, as You's screens are: a bar
// with Map to go back, and the title.
function Screen({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const router = useRouter()
  // Focus on the way back, not the search: on a phone that would raise the
  // keyboard over a list most people browse. Only when opened from the map,
  // as a screen opened by a link or a reload has no focus to move.
  const pushed = !!router.state.location.state.pushed
  useEffect(() => {
    if (!pushed) return
    box.current?.querySelector<HTMLElement>("header a")?.focus({
      preventScroll: true,
    })
  }, [pushed])
  return (
    <section
      ref={box}
      aria-label={title}
      className="absolute inset-0 z-30 flex flex-col bg-background"
    >
      <PageBar
        back={{
          label: "Map",
          to: "/explore",
          search: withoutView,
        }}
        title={title}
      />
      {children}
    </section>
  )
}

const Scroller = ({ children }: { children: React.ReactNode }) => (
  <div
    data-scroll-top
    className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
  >
    {children}
  </div>
)

// From desk: up, the card's frame: 12 px in over the map's left side, on
// the popover surface, so it stands off the dark map. It says how much of
// the map it covers, which camera moves aim beside.
function Card({
  className,
  children,
  label,
  site,
}: {
  className?: string
  children: React.ReactNode
  label: string
  // The picked site the rules were opened over, which a pin's tap aims at.
  site?: string
}) {
  const { onCover } = useMapFrame()
  const card = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = card.current
    if (!element) return
    const report = () =>
      onCover({ left: 12 + element.offsetWidth, bottom: 0 }, site)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  }, [onCover, site])
  return (
    <section
      ref={card}
      aria-label={label}
      // The size the map's first fit aims beside.
      style={{
        top: listCard.inset,
        left: listCard.inset,
        width: listCard.width,
      }}
      className={cn(
        "absolute z-10 flex max-h-[calc(100%-1.5rem)] max-w-[min(calc(100%-1.5rem),60%)] flex-col overflow-hidden rounded-[14px] bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10",
        className
      )}
    >
      {children}
    </section>
  )
}

// The list card runs the window's height, folding to its heading, search
// and filters with its chevron; moving the map never folds it.
let folded = false
function ListCard({
  total,
  query,
  onQuery,
  filters,
  children,
}: {
  total: number
  query: string
  onQuery: (query: string) => void
  filters: React.ReactNode
  children: React.ReactNode
}) {
  const [fold, setFoldState] = useState(folded)
  const setFold = (next: boolean) => setFoldState((folded = next))
  return (
    <Card label="Dive sites" className={cn(!fold && "h-[calc(100%-1.5rem)]")}>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <h2 className="text-2xl leading-[30px] font-semibold tracking-[-0.03em]">
          Dive sites
        </h2>
        <div className="flex items-center gap-2 self-center">
          <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
            {count(total)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={fold ? "Show the list" : "Hide the list"}
            aria-expanded={!fold}
            aria-controls="site-list"
            onClick={() => setFold(!fold)}
            // Open is its resting state, not a pressed one.
            className="-mr-1.5 text-muted-foreground aria-expanded:bg-transparent"
          >
            <IconChevronUp
              className={cn(
                "transition-[rotate] duration-200 ease-out motion-reduce:transition-none",
                fold && "rotate-180"
              )}
            />
          </Button>
        </div>
      </div>
      {/* Searching brings the list back. */}
      <div className="px-5 pt-3.5 pb-1" onFocus={() => setFold(false)}>
        <SheetSearch
          value={query}
          onChange={onQuery}
          label="Search sites"
          capitalise
          className="desk:h-9 desk:rounded-lg"
        />
      </div>
      <div className={cn("px-3.5 pb-2", !fold && "border-b")}>{filters}</div>
      <div
        id="site-list"
        hidden={fold}
        data-scroll-top
        className="min-h-0 flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain pb-2"
      >
        {children}
      </div>
    </Card>
  )
}

// The rules in the card, with a breadcrumb back to the list or the site
// they were opened from. Escape goes back too.
function RulesCard({
  mpa,
  from,
  onBack,
}: {
  mpa?: Mpa
  from?: Site
  onBack: () => void
}) {
  const back = useEffectEvent(onBack)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if ((event.target as HTMLElement).closest("[role=dialog]")) return
      back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return (
    <Card label="Marine protected areas" site={from?.id}>
      <div className="flex h-13 shrink-0 items-center border-b px-5">
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbLink
                className="-mx-1 truncate rounded-sm px-1 outline-offset-2"
                render={<Link to="/explore" search={withoutView} replace />}
              >
                {from?.name ?? "Dive sites"}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">
                Marine protected areas
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <ZoneRulesList mpa={mpa} desk />
    </Card>
  )
}
