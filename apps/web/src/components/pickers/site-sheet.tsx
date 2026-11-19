import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  bodiesOfWater,
  countryCodes,
  countryName,
  defaultWaterType,
  isUnknownSite,
  keysOf,
  newId,
  normaliseName,
  placeKey,
  type BodyOfWater,
  type CountryCode,
  type Id,
  type WaterType,
} from "@shylog/core"
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDroplet,
  IconFlag,
  IconMap2,
  IconPlus,
  IconSalt,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Drawer } from "@/components/ui/drawer"
import { Segmented } from "@/dive/form/rows"
import { useConnected, useOnline } from "@/data/sync-status"
import { useDesk } from "@/hooks/use-desk"
import type { NewEntity } from "@/dive/form/values"
import { isReturn } from "@/lib/keys"
import { exploreOn } from "@/map/enabled"
import type { Area, Site as MapSite } from "@/map/sites"

import {
  countText,
  diveCount,
  Highlighted,
  matchName,
  nameLimit,
  tidyName,
} from "./match"
import { fromMapSite, logSites, regionFor } from "./new-site"
import {
  BarButton,
  FullSheetContent,
  keyboardPad,
  SheetBar,
  SheetSearch,
  SheetSection,
} from "./sheet"

export interface SiteRow {
  id: string
  name: string
  countryCode: string
  region: string | null
  // The dive site on Explore's map it was added from.
  mapSite: string | null
  count: number
  last: string
}

// Explore's sites, from the map's own chunk, so they stay out of the app's
// first load. Asked for as the form opens, so they're in before the sheet
// is, and the service worker keeps the chunk for a dive logged offline.
type MapSites = Pick<
  typeof import("@/map/sites"),
  "sites" | "areas" | "siteTypes" | "searchSites"
>
let mapSites: Promise<MapSites> | undefined
const loadMapSites = () => (mapSites ??= import("@/map/sites"))

// The sites once in, and whether they can't be had, as on a phone offline
// before the service worker has the chunk: then only a typed site is offered.
function useMapSites() {
  const [loaded, setLoaded] = useState<MapSites | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!exploreOn) return
    let live = true
    loadMapSites().then(
      (map) => live && setLoaded(map),
      () => {
        mapSites = undefined
        if (live) setFailed(true)
      }
    )
    return () => {
      live = false
    }
  }, [])
  return { map: loaded, offered: exploreOn && !failed }
}

export interface RegionRow {
  id: string
  name: string
  countryCode: string
  sites: number
}

type View = "list" | "explore" | "create" | "country" | "body"
// The views holding a new site's fields, which only Cancel or Add close.
const editing = (view: View) =>
  view === "create" || view === "country" || view === "body"

const countryNames = countryCodes
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

// The site picker (SitePickerHifi as a full-height sheet): search,
// recent sites and every site by country, a site from Explore's map, or a
// new site whose country and body of water lists push in within the same
// sheet.
export function SiteSheet({
  open,
  onOpenChange,
  sites,
  regions,
  defaultCountry,
  value,
  onChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: SiteRow[]
  regions: RegionRow[]
  // The country of the most recent dive's site, for a new site.
  defaultCountry: CountryCode | null
  value: string | null
  onChange: (id: string) => void
  // The new site and, when its region is new too, the region before it.
  onCreate: (entities: NewEntity[]) => void
}) {
  const [view, setView] = useState<View>("list")
  // Which way the last move within the sheet went, so a view slides in from
  // the side it belongs to, as an iOS navigation stack does. Null when the
  // sheet opens, which brings its own motion.
  const [move, setMove] = useState<"forward" | "back" | null>(null)
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState(() => blankSite(defaultCountry))
  const { map, offered: mapOffered } = useMapSites()
  const go = (next: View, backwards = false) => {
    setMove(backwards ? "back" : "forward")
    setView(next)
  }
  const reset = () => {
    setView("list")
    setMove(null)
    setQuery("")
    setDraft(blankSite(defaultCountry))
  }
  const pick = (id: string) => {
    onChange(id)
    onOpenChange(false)
  }

  const typed = tidyName(query)
  // The Unknown site holds imported dives until each gets its own, so it
  // is never offered, though a new site can't take its name.
  const offered = sites.filter((site) => !isUnknownSite(site))
  const country = draft.countryCode
  const name = tidyName(draft.name)
  const duplicate =
    name && country
      ? sites.find(
          (site) =>
            placeKey(site.name, site.countryCode) === placeKey(name, country)
        )
      : undefined
  // Even before an import has made it, as the site would become it.
  const reserved =
    !!name && !!country && isUnknownSite({ name, countryCode: country })
  const add = () => {
    if (!name || !country || duplicate || reserved) return
    const entities: NewEntity[] = []
    const regionName = tidyName(draft.region)
    let regionId: Id<"region"> | undefined
    if (regionName) {
      const region = regionFor(regionName, country, regions)
      regionId = region.regionId
      entities.push(...region.entities)
    }
    const id = newId("site")
    entities.push({
      kind: "site",
      id,
      fields: {
        name,
        countryCode: country,
        ...(regionId ? { regionId } : {}),
        ...(draft.bodyOfWater ? { bodyOfWater: draft.bodyOfWater } : {}),
        waterType:
          draft.waterType ?? defaultWaterType(draft.bodyOfWater ?? undefined),
      },
    })
    onCreate(entities)
    pick(id)
  }
  const ownSite = useMemo(() => logSites(sites), [sites])
  // The log's own site where it already has this one, else a new one.
  const pickMapSite = (site: MapSite) => {
    const existing = ownSite(site)
    if (existing) return pick(existing.id)
    const made = fromMapSite(site, map!.areas[site.area], regions, sites)
    onCreate(made.entities)
    pick(made.id)
  }
  // A custom site named as one of Explore's is likely that one, which
  // would come filled in and linked; typing it in stays allowed.
  const mapTwin =
    !duplicate && name && country === "ZA" && map
      ? map.sites.find(
          (site) =>
            !ownSite(site) && placeKey(site.name, "ZA") === placeKey(name, "ZA")
        )
      : undefined
  // A typed search seeds a new site's name, capitalised as iOS would, by
  // code point, so a name starting with an emoji survives.
  const newSite = (text: string) => {
    setDraft({
      ...blankSite(defaultCountry),
      name: text
        ? Array.from(text)[0].toUpperCase() + Array.from(text).slice(1).join("")
        : "",
    })
    go("create")
  }

  const views: Record<View, ReactNode> = {
    list: (
      <SiteList
        sites={offered}
        query={query}
        onQuery={setQuery}
        value={value}
        onPick={pick}
        map={map}
        mapOffered={mapOffered}
        ownSite={ownSite}
        onExplore={() => go("explore")}
        onPickMapSite={pickMapSite}
        onNew={() => newSite(typed)}
        addLabel={typed ? `Add “${typed}”` : "New custom site"}
      />
    ),
    explore: map && (
      <MapSiteList
        map={map}
        initial={query}
        ownSite={ownSite}
        value={value}
        onPick={pickMapSite}
        onNew={(text) => newSite(tidyName(text))}
      />
    ),
    create: (
      <NewSite
        draft={draft}
        onDraft={setDraft}
        regions={regions}
        duplicate={duplicate}
        reserved={reserved}
        mapTwin={mapTwin}
        onUseMapTwin={() => mapTwin && pickMapSite(mapTwin)}
        onUse={() => duplicate && pick(duplicate.id)}
        onCountry={() => go("country")}
        onBody={() => go("body")}
      />
    ),
    country: (
      <CountryList
        sites={offered}
        value={country}
        onPick={(code) => {
          // A region belongs to one country, so a new country starts it
          // afresh.
          setDraft({ ...draft, countryCode: code, region: "" })
          go("create", true)
        }}
      />
    ),
    body: (
      <BodyList
        value={draft.bodyOfWater}
        onPick={(body) => {
          setDraft({ ...draft, bodyOfWater: body, waterType: null })
          go("create", true)
        }}
      />
    ),
  }

  const bar: Record<View, ReactNode> = {
    list: (
      <SheetBar
        title="Site"
        start={
          <BarButton onClick={() => onOpenChange(false)}>Cancel</BarButton>
        }
      />
    ),
    explore: (
      <SheetBar
        title="Dive sites"
        start={<BackButton label="Sites" onClick={() => go("list", true)} />}
      />
    ),
    create: (
      <SheetBar
        title="New custom site"
        start={<BackButton label="Sites" onClick={() => go("list", true)} />}
        end={
          <BarButton
            strong
            disabled={!name || !country || !!duplicate || reserved}
            onClick={add}
          >
            Add
          </BarButton>
        }
      />
    ),
    country: (
      <SheetBar
        title="Country"
        start={
          <BackButton
            label="New custom site"
            onClick={() => go("create", true)}
          />
        }
      />
    ),
    body: (
      <SheetBar
        title="Body of water"
        start={
          <BackButton
            label="New custom site"
            onClick={() => go("create", true)}
          />
        }
      />
    ),
  }

  return (
    <Drawer
      showSwipeHandle
      open={open}
      // While a new site is being filled in only Cancel or Add close the
      // sheet, as iOS holds a sheet with edits: a swipe or a tap outside
      // would lose it.
      disablePointerDismissal={editing(view)}
      onOpenChange={(next, details) => {
        if (
          !next &&
          editing(view) &&
          (details.reason === "swipe" || details.reason === "escape-key")
        )
          return
        onOpenChange(next)
      }}
      onOpenChangeComplete={(isOpen) => !isOpen && reset()}
    >
      <FullSheetContent>
        <div
          key={view}
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            move &&
              "animate-view-in duration-300 ease-drawer motion-reduce:[--view-from:0] desk:duration-200",
            move === "back" && "[--view-from:-2rem]",
            move === "forward" && "[--view-from:4rem]"
          )}
        >
          {bar[view]}
          <div
            ref={keyboardPad}
            // A drag on a new site's fields scrolls, never pulls the sheet.
            data-base-ui-swipe-ignore={editing(view) ? "" : undefined}
            className="flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[max(1.5rem,env(safe-area-inset-bottom),var(--keyboard,0px))]"
          >
            {views[view]}
          </div>
        </div>
      </FullSheetContent>
    </Drawer>
  )
}

interface SiteDraft {
  name: string
  countryCode: CountryCode | null
  region: string
  bodyOfWater: BodyOfWater | null
  // Null follows the body of water.
  waterType: WaterType | null
}

const blankSite = (countryCode: CountryCode | null): SiteDraft => ({
  name: "",
  countryCode,
  region: "",
  bodyOfWater: "oceanSea",
  waterType: null,
})

function BackButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <BarButton back onClick={onClick} className="pl-0.5">
      {/* A desktop dialog's footer button takes its usual 16 px icon. */}
      <IconChevronLeft
        aria-hidden
        data-icon="inline-start"
        className="size-5.5 stroke-[2.25] in-data-[slot=button]:size-4 in-data-[slot=button]:stroke-2"
      />
      {label}
    </BarButton>
  )
}

function SiteList({
  sites,
  query,
  onQuery,
  value,
  onPick,
  map,
  mapOffered,
  ownSite,
  onExplore,
  onPickMapSite,
  onNew,
  addLabel,
}: {
  sites: SiteRow[]
  query: string
  onQuery: (query: string) => void
  value: string | null
  onPick: (id: string) => void
  // Explore's sites, or null until they load or where they can't.
  map: MapSites | null
  // Whether Explore's sites are offered at all, shown before they load so
  // the row doesn't drop in as the sheet opens.
  mapOffered: boolean
  ownSite: (site: MapSite) => SiteRow | undefined
  onExplore: () => void
  onPickMapSite: (site: MapSite) => void
  onNew: () => void
  addLabel: string
}) {
  const typed = tidyName(query)
  const key = normaliseName(typed)
  // Name matches first (starting with the text before containing it), then
  // sites whose region or country matches; most dived first within each.
  const results = key
    ? sites
        .map((site) => {
          const match = matchName(site.name, typed)
          if (match) return { site, rank: match.rank, parts: match.parts }
          const place = `${site.region ?? ""} ${countryName(site.countryCode)}`
          return normaliseName(place).includes(key)
            ? { site, rank: 2, parts: null }
            : null
        })
        .filter((row) => row != null)
        .sort((a, b) => a.rank - b.rank || b.site.count - a.site.count)
    : []
  // Explore's sites the search finds, past the log's own already listed,
  // ranked as the log's are: names starting with the text first. A step
  // behind the typing, as one letter finds most of the 409.
  const deferred = useDeferredValue(typed)
  const listed = new Set(results.map(({ site }) => site.id))
  const fromMap =
    key && map
      ? map
          .searchSites(deferred)
          .flatMap((site) => {
            const own = ownSite(site)
            if (own && listed.has(own.id)) return []
            const match = matchName(site.name, deferred)
            return [{ site, own, rank: match?.rank ?? 2, parts: match?.parts }]
          })
          .sort(
            (a, b) => a.rank - b.rank || a.site.name.localeCompare(b.site.name)
          )
      : []
  const recent = [...sites]
    .filter((site) => site.last)
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, 3)
  const groups = new Map<string, SiteRow[]>()
  for (const site of sites)
    groups.set(site.countryCode, [
      ...(groups.get(site.countryCode) ?? []),
      site,
    ])
  const countries = [...groups.keys()].sort((a, b) =>
    countryName(a).localeCompare(countryName(b))
  )
  const place = (site: SiteRow) =>
    [site.region, countryName(site.countryCode)].filter(Boolean).join(" · ")

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SheetSearch
          className="mb-3"
          value={query}
          onChange={onQuery}
          label="Search or add a site"
          capitalise
          // It seeds a new site's name.
          maxLength={nameLimit}
        />
        <SheetSection>
          <button
            type="button"
            onClick={onNew}
            className="flex min-h-13 items-center gap-3 px-4 text-left text-base font-medium text-primary transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
          >
            <IconPlus aria-hidden className="size-5 shrink-0" />
            <span className="truncate">{addLabel}</span>
          </button>
          {mapOffered && (
            <button
              type="button"
              onClick={onExplore}
              className="flex min-h-13 items-center gap-3 pr-3.5 pl-4 text-left text-base font-medium text-primary transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
            >
              <IconMap2 aria-hidden className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">From Explore</span>
              <IconChevronRight
                aria-hidden
                className="size-4.5 shrink-0 text-muted-foreground/60"
              />
            </button>
          )}
        </SheetSection>
      </div>
      {key ? (
        results.length || fromMap.length ? (
          <>
            {results.length > 0 && (
              <SheetSection>
                {results.map(({ site, parts }) => (
                  <SiteButton
                    key={site.id}
                    site={site}
                    current={site.id === value}
                    onPick={onPick}
                    name={parts ? <Highlighted parts={parts} /> : site.name}
                    place={place(site)}
                  />
                ))}
              </SheetSection>
            )}
            {fromMap.length > 0 && (
              <SheetSection title="Explore dive sites">
                {fromMap.slice(0, mapShown).map(({ site, own, parts }) => (
                  <MapSiteButton
                    key={site.id}
                    site={site}
                    own={own}
                    current={!!own && own.id === value}
                    onPick={onPickMapSite}
                    name={parts ? <Highlighted parts={parts} /> : site.name}
                    place={mapPlace(site, map!, true)}
                  />
                ))}
                {/* The rest in the Dive sites list, with this search. */}
                {fromMap.length > mapShown && (
                  <button
                    type="button"
                    onClick={onExplore}
                    className="flex min-h-12 items-center gap-3 pr-3.5 pl-4 text-left text-[15px] font-medium text-primary transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
                  >
                    <span className="min-w-0 flex-1">
                      Show all {countText(fromMap.length)}
                    </span>
                    <IconChevronRight
                      aria-hidden
                      className="size-4.5 shrink-0 text-muted-foreground/60"
                    />
                  </button>
                )}
              </SheetSection>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No sites match.
          </p>
        )
      ) : (
        <>
          {recent.length > 0 && (
            <SheetSection title="Recent">
              {recent.map((site) => (
                <SiteButton
                  key={site.id}
                  site={site}
                  current={site.id === value}
                  onPick={onPick}
                  name={site.name}
                  place={place(site)}
                />
              ))}
            </SheetSection>
          )}
          {countries.map((code) => (
            <SheetSection key={code} title={countryName(code)}>
              {groups
                .get(code)!
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((site) => (
                  <SiteButton
                    key={site.id}
                    site={site}
                    current={site.id === value}
                    onPick={onPick}
                    name={site.name}
                    place={site.region}
                  />
                ))}
            </SheetSection>
          ))}
        </>
      )}
    </div>
  )
}

function SiteButton({
  site,
  current,
  onPick,
  name,
  place,
}: {
  site: SiteRow
  current: boolean
  onPick: (id: string) => void
  name: ReactNode
  place: string | null
}) {
  return (
    <button
      type="button"
      aria-current={current || undefined}
      onClick={() => onPick(site.id)}
      className="flex min-h-14 items-center gap-3 py-2 pr-3.5 pl-4 text-left transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-base font-medium tracking-[-0.01em]">
          {name}
        </span>
        {place && (
          <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
            <span className="truncate">{place}</span>
          </span>
        )}
      </span>
      <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
        {site.count ? diveCount(site.count) : "New"}
      </span>
      <IconCheck
        aria-hidden
        className={cn("size-5 shrink-0 text-primary", !current && "invisible")}
      />
    </button>
  )
}

// What sets a map site apart, as Explore's list says it: its area where
// it isn't under its area's heading, its type where it isn't a reef (most
// are), and its depth. Blue Rock Quarry's spots share one depth, the
// quarry's, so they name the quarry instead.
const mapPlace = (site: MapSite, map: MapSites, withArea: boolean) =>
  site.area === "fresh" && site.page
    ? site.page
    : [
        withArea && map.areas[site.area],
        site.type !== "reef" && map.siteTypes[site.type],
        site.depth !== undefined &&
          `${site.approximate ? "≈ " : ""}${site.depth} m`,
      ]
        .filter(Boolean)
        .join(" · ")

// Explore's sites the picker's search shows before Show all, as one letter
// finds most of the 409.
const mapShown = 8

// A site on Explore's map, with its dive count where the log has it.
function MapSiteButton({
  site,
  own,
  current,
  onPick,
  name,
  place,
}: {
  site: MapSite
  own: SiteRow | undefined
  current: boolean
  onPick: (site: MapSite) => void
  name: ReactNode
  place: string
}) {
  return (
    <button
      type="button"
      aria-current={current || undefined}
      onClick={() => onPick(site)}
      className="flex min-h-14 items-center gap-3 py-2 pr-3.5 pl-4 text-left transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
    >
      {/* The map's longest names differ only past a phone's width ("Steenbras
          Deep North Pinnacle or 2nd Pinnacle"), so they wrap in full, as
          does the depth after the longest area. */}
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-base font-medium tracking-[-0.01em]">{name}</span>
        {place && (
          <span className="text-[13px] text-muted-foreground">{place}</span>
        )}
      </span>
      {own && own.count > 0 && (
        <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
          {diveCount(own.count)}
        </span>
      )}
      <IconCheck
        aria-hidden
        className={cn("size-5 shrink-0 text-primary", !current && "invisible")}
      />
    </button>
  )
}

// Every site on Explore's map, by area as the map's list has them, with
// its own search, starting from the picker's.
function MapSiteList({
  map,
  initial,
  ownSite,
  value,
  onPick,
  onNew,
}: {
  map: MapSites
  initial: string
  ownSite: (site: MapSite) => SiteRow | undefined
  value: string | null
  onPick: (site: MapSite) => void
  onNew: (name: string) => void
}) {
  const desk = useDesk()
  const [query, setQuery] = useState(initial)
  const typed = tidyName(useDeferredValue(query))
  const found = map.searchSites(typed)
  const groups = (Object.keys(map.areas) as Area[]).flatMap((area) => {
    const inArea = found
      .filter((site) => site.area === area)
      .sort((a, b) => a.name.localeCompare(b.name))
    return inArea.length ? [{ area, sites: inArea }] : []
  })
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SheetSearch
          className="mb-3"
          value={query}
          onChange={setQuery}
          label="Search dive sites"
          // With a keyboard at hand, as a new site's name has it; a phone
          // waits for a tap, so its keyboard doesn't cover the list.
          autoFocus={desk}
        />
        {!groups.length && (
          <SheetSection>
            <button
              type="button"
              onClick={() => onNew(query)}
              className="flex min-h-13 items-center gap-3 px-4 text-left text-base font-medium text-primary transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
            >
              <IconPlus aria-hidden className="size-5 shrink-0" />
              <span className="truncate">
                {tidyName(query)
                  ? `Add “${tidyName(query)}”`
                  : "New custom site"}
              </span>
            </button>
          </SheetSection>
        )}
      </div>
      {groups.map(({ area, sites: inArea }) => (
        // Off-screen areas skip layout and paint, so the push's first frame
        // waits only for the rows in view; sized near enough to scroll true.
        // A pixel round the card, as the containment clips its ring.
        <div
          key={area}
          className="-m-px p-px"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: `auto ${28 + inArea.length * 57}px`,
          }}
        >
          <SheetSection title={map.areas[area]}>
            {inArea.map((site) => {
              const own = ownSite(site)
              const parts = typed ? matchName(site.name, typed)?.parts : null
              return (
                <MapSiteButton
                  key={site.id}
                  site={site}
                  own={own}
                  current={!!own && own.id === value}
                  onPick={onPick}
                  name={parts ? <Highlighted parts={parts} /> : site.name}
                  place={mapPlace(site, map, false)}
                />
              )
            })}
          </SheetSection>
        </div>
      ))}
    </div>
  )
}

function NewSite({
  draft,
  onDraft,
  regions,
  duplicate,
  reserved,
  mapTwin,
  onUseMapTwin,
  onUse,
  onCountry,
  onBody,
}: {
  draft: SiteDraft
  onDraft: (draft: SiteDraft) => void
  regions: RegionRow[]
  duplicate: SiteRow | undefined
  reserved: boolean
  // One of Explore's sites with the name typed, offered filled in instead.
  mapTwin: MapSite | undefined
  onUseMapTwin: () => void
  onUse: () => void
  onCountry: () => void
  onBody: () => void
}) {
  const desk = useDesk()
  const [regionFocused, setRegionFocused] = useState(false)
  const regionInput = useRef<HTMLInputElement>(null)
  const regionText = tidyName(draft.region)
  const inCountry = regions.filter(
    (region) => region.countryCode === draft.countryCode
  )
  const regionMatches = regionText
    ? inCountry
        .map((region) => ({
          region,
          match: matchName(region.name, regionText),
        }))
        .filter(({ match }) => match)
        .sort((a, b) => a.match!.rank - b.match!.rank)
        .slice(0, 3)
    : []
  const exact = inCountry.some(
    (region) => normaliseName(region.name) === normaliseName(regionText)
  )
  const water =
    draft.waterType ?? defaultWaterType(draft.bodyOfWater ?? undefined)
  const connected = useConnected()
  const online = useOnline()

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => event.preventDefault()}
    >
      <SheetSection>
        <div className="flex min-h-11.5 items-center gap-3 px-4">
          <label
            htmlFor="site-name"
            className="shrink-0 text-sm text-muted-foreground"
          >
            Name
          </label>
          <input
            id="site-name"
            // No identity autofill, as on the form's rows (see RowInput),
            // nor iOS's contact AutoFill, which Safari leaves off a field
            // whose name says search.
            data-bwignore
            name="search-site"
            // With a keyboard at hand, typing starts in an empty name at once;
            // a phone waits for a tap, so its keyboard doesn't jump up.
            autoFocus={desk && !draft.name}
            value={draft.name}
            onChange={(event) =>
              onDraft({ ...draft, name: event.target.value })
            }
            placeholder="Required"
            maxLength={nameLimit}
            // Return moves on to the region, the next thing to type, or
            // closes the keyboard while the region waits for a country.
            enterKeyHint={draft.countryCode ? "next" : "done"}
            onKeyDown={(event) => {
              if (!isReturn(event)) return
              event.preventDefault()
              if (draft.countryCode) regionInput.current?.focus()
              else event.currentTarget.blur()
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            className="h-11.5 min-w-0 flex-1 bg-transparent text-right text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
          />
        </div>
        {reserved ? (
          <div className="flex min-h-11 items-center gap-2.5 pr-4 pl-4 text-[15px] text-muted-foreground">
            <IconAlertTriangle aria-hidden className="size-4.5 shrink-0" />
            <span className="min-w-0 flex-1 py-2.5 leading-5">
              Unknown site is kept for imported dives. Give it another name.
            </span>
          </div>
        ) : (
          duplicate && (
            <div className="flex min-h-11 items-center gap-2.5 pr-1.5 pl-4 text-[15px] text-muted-foreground">
              <IconAlertTriangle aria-hidden className="size-4.5 shrink-0" />
              <span className="min-w-0 flex-1 py-2.5 leading-5 [overflow-wrap:anywhere]">
                {duplicate.name} already exists in{" "}
                {countryName(duplicate.countryCode)}
              </span>
              <BarButton strong onClick={onUse} className="text-[15px]">
                Use it
              </BarButton>
            </div>
          )
        )}
        {mapTwin && (
          <div className="flex min-h-11 items-center gap-2.5 pr-1.5 pl-4 text-[15px] text-muted-foreground">
            <IconMap2 aria-hidden className="size-4.5 shrink-0" />
            <span className="min-w-0 flex-1 py-2.5 leading-5 [overflow-wrap:anywhere]">
              {mapTwin.name} is on Explore
            </span>
            <BarButton strong onClick={onUseMapTwin} className="text-[15px]">
              Use it
            </BarButton>
          </div>
        )}
      </SheetSection>

      <SheetSection title="Location">
        <PushRow
          icon={IconFlag}
          label="Country"
          value={draft.countryCode ? countryName(draft.countryCode) : null}
          onClick={onCountry}
        />
        <div className="flex flex-col">
          <div className="flex min-h-11.5 items-center gap-3 px-4">
            <label
              htmlFor="site-region"
              className="shrink-0 text-sm text-muted-foreground"
            >
              Region
            </label>
            <input
              ref={regionInput}
              id="site-region"
              data-bwignore
              name="search-region"
              value={draft.region}
              onChange={(event) =>
                onDraft({ ...draft, region: event.target.value })
              }
              onFocus={() => setRegionFocused(true)}
              onBlur={() => setRegionFocused(false)}
              placeholder="Optional"
              maxLength={nameLimit}
              disabled={!draft.countryCode}
              enterKeyHint="done"
              onKeyDown={(event) => {
                if (!isReturn(event)) return
                event.preventDefault()
                event.currentTarget.blur()
              }}

              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              className="h-11.5 min-w-0 flex-1 bg-transparent text-right text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          </div>
          {regionFocused && !exact && regionMatches.length > 0 && (
            <div role="listbox" aria-label="Regions" className="border-t">
              {regionMatches.map(({ region, match }) => (
                <button
                  key={region.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  // Before the field's blur hides the list.
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onDraft({ ...draft, region: region.name })
                    regionInput.current?.blur()
                  }}
                  className="flex min-h-13 w-full items-center gap-3 px-4 py-1.5 text-left transition-colors duration-150 not-first:border-t hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-base font-medium">
                      <Highlighted parts={match!.parts} />
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {countText(region.sites)}{" "}
                      {region.sites === 1 ? "site" : "sites"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {regionText &&
            !exact &&
            !(regionFocused && regionMatches.length) &&
            draft.countryCode && (
              <p className="-mt-2 px-4 pb-2.5 text-right text-[13px] text-muted-foreground">
                New region in {countryName(draft.countryCode)}
              </p>
            )}
        </div>
      </SheetSection>

      <SheetSection title="Water">
        <PushRow
          label="Body of water"
          value={
            draft.bodyOfWater ? bodiesOfWater[draft.bodyOfWater].label : null
          }
          onClick={onBody}
        />
        <div
          className="flex flex-col gap-2 px-4 py-3"
          role="group"
          aria-labelledby="site-water"
        >
          <span id="site-water" className="text-sm text-muted-foreground">
            Water type
          </span>
          <Segmented
            labelledBy="site-water"
            value={water}
            // Always one or the other: tapping the chosen one keeps it.
            onChange={(next) => next && onDraft({ ...draft, waterType: next })}
            options={[
              { value: "salt", label: "Salt", icon: IconSalt },
              { value: "fresh", label: "Fresh", icon: IconDroplet },
            ]}
          />
        </div>
      </SheetSection>
      {/* Offline it can't be checked against the sites another phone has
          added, so it says how that is settled. */}
      {!connected && (
        <p className="-mt-2 px-1 text-[13px] leading-[1.45] text-muted-foreground">
          {online ? "Can’t reach the server." : "You’re offline."} The site is
          saved on this device and matched with your existing sites when it
          syncs.
        </p>
      )}
    </form>
  )
}

function PushRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon?: typeof IconFlag
  label: string
  value: string | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11.5 items-center gap-3 px-4 text-left transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
    >
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
        {Icon && <Icon aria-hidden className="size-[1.15em]" />}
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-right text-base font-medium",
          !value && "text-muted-foreground/60"
        )}
      >
        {value ?? "Choose"}
      </span>
      <IconChevronRight
        aria-hidden
        className="size-4.5 shrink-0 text-muted-foreground/60"
      />
    </button>
  )
}

export function CountryList({
  sites,
  value,
  onPick,
}: {
  sites: Pick<SiteRow, "countryCode" | "last">[]
  value: string | null
  onPick: (code: CountryCode) => void
}) {
  const [query, setQuery] = useState("")
  const key = normaliseName(query)
  // Countries of the sites dived most recently first.
  const recent = [
    ...new Set(
      [...sites]
        .filter((site) => site.last)
        .sort((a, b) => b.last.localeCompare(a.last))
        .map((site) => site.countryCode as CountryCode)
    ),
  ].slice(0, 5)
  const rows = (codes: { code: CountryCode; name: string }[]) =>
    codes.map(({ code, name }) => (
      <button
        key={code}
        type="button"
        onClick={() => onPick(code)}
        aria-current={code === value || undefined}
        className="flex min-h-12 items-center gap-3 px-4 text-left text-base font-medium transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
      >
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {code === value && (
          <IconCheck aria-hidden className="size-5 text-primary" />
        )}
      </button>
    ))
  const matches = key
    ? countryNames.filter(({ name }) => normaliseName(name).includes(key))
    : countryNames
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SheetSearch
          className="mb-3"
          value={query}
          onChange={setQuery}
          label="Search countries"
        />
        {key && !matches.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No countries match.
          </p>
        )}
      </div>
      {!key && recent.length > 0 && (
        <SheetSection title="Recent">
          {rows(recent.map((code) => ({ code, name: countryName(code) })))}
        </SheetSection>
      )}
      {matches.length > 0 && (
        <SheetSection title={key ? undefined : "All countries"}>
          {rows(matches)}
        </SheetSection>
      )}
    </div>
  )
}

export function BodyList({
  value,
  onPick,
}: {
  value: BodyOfWater | null
  onPick: (body: BodyOfWater | null) => void
}) {
  const options: { value: BodyOfWater | null; label: string; note?: string }[] =
    [
      { value: null, label: "Not set" },
      ...keysOf(bodiesOfWater).map((body) => ({
        value: body,
        label: bodiesOfWater[body].label,
        // The spec files aquariums under Other.
        note: body === "other" ? "Including aquariums" : undefined,
      })),
    ]
  return (
    <SheetSection>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onPick(option.value)}
          aria-current={option.value === value || undefined}
          className="flex min-h-12 items-center gap-3 px-4 py-2 text-left transition-colors duration-150 hover:bg-muted/60 data-press:bg-muted data-press:duration-0"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span
              className={cn(
                "text-base font-medium",
                option.value == null && "font-normal text-muted-foreground"
              )}
            >
              {option.label}
            </span>
            {option.note && (
              <span className="text-[13px] text-muted-foreground">
                {option.note}
              </span>
            )}
          </span>
          {option.value === value && (
            <IconCheck aria-hidden className="size-5 text-primary" />
          )}
        </button>
      ))}
    </SheetSection>
  )
}
