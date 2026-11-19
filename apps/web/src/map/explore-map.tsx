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
  IconAdjustmentsHorizontal,
  IconArrowBarToDown,
  IconChevronUp,
  IconMapPin,
  IconWind,
} from "@tabler/icons-react"
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { cn } from "cn"
import { toast } from "sonner"

import {
  ClearFilters,
  MultiFilter,
  useClearShown,
} from "@/components/filter-pills"
import { SheetSearch } from "@/components/pickers/sheet"
import { RangeFilter, usePreloadRangeSheet } from "@/components/range-filter"
import { pillTrigger } from "@/components/ui/select"
import { preloadable } from "@/lib/preloadable"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { useOnline } from "@/data/sync-status"
import { useDesk } from "@/hooks/use-desk"
import { depthScale } from "@/log/filters"
import { PageBar, useBack } from "@/you/bar"

import Basemap, { listCard, useMapFrame, type MapState } from "./basemap"
import { useCardWidth } from "./card-edge"
import { searchSites } from "./find"
import {
  imageryFailed,
  imageryTiles,
  satelliteChosen,
  warmThumb,
} from "./imagery"
import {
  accessOptions,
  conditionTicks,
  filterCount,
  filterSites,
  filtersOf,
  goodForOptions,
  matchesSite,
  searchOf,
  siteCount,
  skillOptions,
  tagTicks,
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
import { siteById, sites, type Site } from "./sites"
import { ZoneRulesList } from "./zone-rules-list"
import type { Mpa } from "./zone-rules"

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
  const { types, depth, access, wind, swell, season, skills, good } = search
  const filters = useMemo(
    () =>
      filtersOf({ types, depth, access, wind, swell, season, skills, good }),
    [types, depth, access, wind, swell, season, skills, good]
  )
  const filtered = useMemo(() => filterSites(filters), [filters])
  const zones = useSyncExternalStore(zonesShown.subscribe, zonesShown.get)
  // Satellite while there's a signal, and back to it once there is again.
  const satelliteOn = useSyncExternalStore(
    satelliteChosen.subscribe,
    satelliteChosen.get
  )
  const online = useOnline()
  const failed = useSyncExternalStore(
    imageryFailed.subscribe,
    imageryFailed.get
  )
  const imagery = satelliteOn && online && !failed ? imageryTiles : undefined
  useEffect(() => {
    if (online) warmThumb()
  }, [online])
  const satellite = imageryTiles
    ? {
        shown: !!imagery,
        online,
        // Choosing it again tries the imagery again.
        onChange: (on: boolean) => {
          imageryFailed.set(false)
          satelliteChosen.set(on)
        },
      }
    : undefined
  const onImageryFailed = useCallback((refused: boolean) => {
    imageryFailed.set(true)
    toast(
      refused
        ? "Esri refused the satellite key"
        : "Couldn't load the satellite imagery"
    )
  }, [])
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
  const { rowRef, pillRef, countRef, numberOnly } = useNumberOnly(!desk)
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
        imagery={imagery}
        onImageryFailed={onImageryFailed}
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
                of={sites.length}
                onClear={
                  filterCount(filters)
                    ? () => setFilters({ types: [] })
                    : undefined
                }
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
              satellite={satellite}
              onRules={() => open("rules")}
            />
          </>
        ) : (
          <>
            <div
              ref={rowRef}
              role="group"
              aria-label="Filters"
              // Room below for the pills' shadow, which the scrolling row
              // would otherwise cut off.
              className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3 pt-2 pb-4 *:pointer-events-auto"
            >
              {pills({ float: true })}
              <button
                ref={pillRef}
                type="button"
                aria-label={`List of ${siteCount(filtered.length)}`}
                onClick={() => open("list")}
                // A 44 px target, as the pills' own reach is.
                className={cn(
                  floatingPill,
                  pillShape,
                  "ml-auto pl-2.5 tabular-nums after:absolute after:-inset-x-1 after:-inset-y-1"
                )}
              >
                <IconMapPin aria-hidden />
                <span aria-live="polite" className="flex">
                  {filtered.length}
                  <span
                    ref={countRef}
                    className={cn(
                      "overflow-hidden whitespace-pre transition-opacity duration-150 ease-out",
                      numberOnly && "max-w-0 opacity-0"
                    )}
                  >
                    {filtered.length === 1 ? " site" : " sites"}
                  </span>
                </span>
              </button>
            </div>
            <div className="absolute top-13 right-3 z-[5]">
              <PhoneMapOptions
                zones={zones}
                onZones={zonesShown.set}
                satellite={satellite}
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

// The phone's site count drops its word, keeping the number, once the pills
// before it leave no room for it, as Clear's does with a filter set. The
// word's natural width stays readable while it's folded.
function useNumberOnly(phone: boolean) {
  const row = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const count = useRef<HTMLSpanElement>(null)
  const [numberOnly, setNumberOnly] = useState(false)
  useLayoutEffect(() => {
    const box = row.current
    if (!phone || !box) return
    const fit = () => {
      const button = pill.current
      const word = count.current
      const before = button?.previousElementSibling as HTMLElement | null
      if (!button || !before || !word) return
      // The free room between the last pill and the count, which its
      // ml-auto takes up, against the word, with a pixel or two over.
      const room = button.offsetLeft - before.offsetLeft - before.offsetWidth
      const needs = word.scrollWidth - word.offsetWidth
      const overflows = box.scrollWidth > box.clientWidth
      setNumberOnly((folded) => (folded ? room - 6 < needs + 2 : overflows))
    }
    // Each pill, Clear's too as it comes, so a label's change refits.
    const observer = new ResizeObserver(fit)
    const watch = () => {
      observer.disconnect()
      observer.observe(box)
      for (const child of box.children) observer.observe(child)
      fit()
    }
    watch()
    const added = new MutationObserver(watch)
    added.observe(box, { childList: true })
    return () => {
      observer.disconnect()
      added.disconnect()
    }
  }, [phone])
  return { rowRef: row, pillRef: pill, countRef: count, numberOnly }
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

// The access pill first, after the Log's Clear, as how you get in matters
// most when picking a dive, then max depth. From desk: up the type sits
// between them and the page tags follow as pills of their own; a phone's row
// has no room, so they share one Filters sheet.
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
  const desk = useDesk()
  const clear = useClearShown(filterCount(filters) > 0)
  const pill = float ? cn(floatingPill, "pr-2") : untinted
  const tags = tagTicks(filters)
  const conditions = conditionTicks(filters)
  usePreloadRangeSheet()
  // As the Max depth sheet: warmed while the browser is idle, so the first
  // opening doesn't wait on the download.
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(() => void loadTagSheet())
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(() => void loadTagSheet(), 1000)
    return () => clearTimeout(id)
  }, [])
  const wayIn = (
    <MultiFilter
      name="Access"
      // Not "Shore or boat", which a list row uses for a site dived both ways.
      any="Any access"
      unset="Access"
      options={accessOptions}
      value={filters.access ?? []}
      onChange={(access) => onChange({ ...filters, access })}
      {...clear.menu}
      className={pill}
    />
  )
  const pills = (
    <>
      {/* From desk: up Clear is in the card's heading, by the count, where
          it moves no pill as it comes and goes. */}
      {!desk && (
        <ClearFilters
          shown={clear.shown}
          onClear={() => onChange({ types: [] })}
          // Over the map the row has the site count to fit as well.
          iconOnly={float}
          className={float ? cn(floatingPill, "after:-inset-x-1") : undefined}
        />
      )}
      {wayIn}
      {desk && (
        <MultiFilter
          name="Type"
          any="Any type"
          unset="Type"
          options={typeOptions}
          value={filters.types}
          onChange={(types) => onChange({ ...filters, types })}
          {...clear.menu}
          className={pill}
        />
      )}
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
      {desk ? (
        <>
          <TagPill
            conditionsOnly
            name="Conditions"
            icon={IconWind}
            count={conditions}
            filters={filters}
            onApply={onChange}
            className={float ? cn(floatingPill, "pl-2.5") : untinted}
          />
          <MultiFilter
            name="Skills"
            any="Any skills"
            unset="Skills"
            options={skillOptions}
            value={filters.skills ?? []}
            onChange={(skills) => onChange({ ...filters, skills })}
            {...clear.menu}
            className={pill}
          />
          <MultiFilter
            name="Good for"
            any="Good for anything"
            unset="Good for"
            options={goodForOptions}
            value={filters.goodFor ?? []}
            onChange={(goodFor) => onChange({ ...filters, goodFor })}
            {...clear.menu}
            className={pill}
          />
        </>
      ) : (
        // Only its icon and count, so the row keeps the site count in view
        // on a phone.
        <TagPill
          compact
          name="Filters"
          icon={IconAdjustmentsHorizontal}
          count={tags}
          filters={filters}
          onApply={onChange}
          className={float ? cn(floatingPill, "px-2.5") : untinted}
        />
      )}
    </>
  )
  if (float) return pills
  return (
    <div
      role="group"
      aria-label="Filters"
      // From desk: up the card's seven pills wrap, as a mouse can't swipe a
      // row sideways; a phone's few scroll on one line, as the Log's do.
      className={cn(
        desk
          ? "flex flex-wrap gap-1"
          : "flex [scrollbar-width:none] gap-1 overflow-x-auto overscroll-x-contain",
        className
      )}
    >
      {pills}
    </div>
  )
}

// The sheet holds a few hundred lines the map's first frame doesn't need,
// so it loads on the press that opens it.
const { Component: TagSheet, preload: loadTagSheet } = preloadable(() =>
  import("./tag-sheet").then((module) => module.default)
)

// A pill that opens the tag sheet, as the Max depth pill opens its slider.
function TagPill({
  name,
  icon: Icon,
  count,
  compact = false,
  conditionsOnly,
  filters,
  onApply,
  className,
}: {
  name: string
  icon: typeof IconWind
  // How many of its chips are ticked: "Conditions · 2", or the bare 2 beside
  // a compact pill's icon.
  count: number
  compact?: boolean
  conditionsOnly?: boolean
  filters: SiteFilters
  onApply: (filters: SiteFilters) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // Mounted from the first opening on, so closing can animate.
  const [used, setUsed] = useState(false)
  const pill = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={pill}
        type="button"
        aria-haspopup="dialog"
        aria-label={count ? `${name}, ${count} set` : name}
        aria-expanded={open}
        data-active={count ? "" : undefined}
        onPointerDown={() => void loadTagSheet()}
        onClick={() => {
          setUsed(true)
          setOpen(true)
        }}
        className={cn(pillTrigger, "text-foreground", className)}
      >
        <Icon aria-hidden />
        {compact ? count || null : count ? `${name} · ${count}` : name}
      </button>
      {used && (
        <TagSheet
          open={open}
          onOpenChange={setOpen}
          returnFocus={pill}
          conditionsOnly={conditionsOnly}
          filters={filters}
          onApply={onApply}
        />
      )}
    </>
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
  const { width, edge } = useCardWidth()
  return (
    // At most 60% of the map, so some of it shows beside the card.
    <div
      style={{ top: listCard.inset, left: listCard.inset, width }}
      className={cn(
        "absolute z-10 flex max-h-[calc(100%-1.5rem)] max-w-[min(calc(100%-1.5rem),60%)]",
        className
      )}
    >
      <section
        ref={card}
        aria-label={label}
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      >
        {children}
      </section>
      {edge}
    </div>
  )
}

// The list card runs the window's height, folding to its heading, search
// and filters with its chevron; moving the map never folds it.
let folded = false
function ListCard({
  total,
  of,
  onClear,
  query,
  onQuery,
  filters,
  children,
}: {
  total: number
  of: number
  // While a filter is set: the count reads "32 of 409 sites" beside it.
  onClear?: () => void
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
            {onClear ? `${total} of ${siteCount(of)}` : siteCount(total)}
          </span>
          {onClear && (
            <Button
              variant="ghost"
              size="xs"
              aria-label="Clear filters"
              onClick={onClear}
              className="-mx-1 text-[13px]"
            >
              Clear
            </Button>
          )}
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
