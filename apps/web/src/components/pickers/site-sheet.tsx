import { useRef, useState, type ReactNode } from "react"
import {
  bodiesOfWater,
  countryCodes,
  defaultWaterType,
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
  IconPlus,
  IconSalt,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Drawer } from "@/components/ui/drawer"
import { Segmented } from "@/dive/form/rows"
import { countryName } from "@/format/place"
import type { NewEntity } from "@/dive/form/values"

import {
  countText,
  diveCount,
  Highlighted,
  matchName,
  nameLimit,
  tidyName,
} from "./match"
import {
  BarButton,
  FullSheetContent,
  SheetBar,
  SheetSearch,
  SheetSection,
} from "./sheet"

export interface SiteRow {
  id: string
  name: string
  countryCode: string
  region: string | null
  count: number
  last: string
}

export interface RegionRow {
  id: string
  name: string
  countryCode: string
  sites: number
}

type View = "list" | "create" | "country" | "body"

const countryNames = countryCodes
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

// The site picker (SitePickerHifi as a full-height sheet, D29): search,
// recent sites and every site by country, or a new site whose country and
// body of water lists push in within the same sheet.
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
  const country = draft.countryCode
  const name = tidyName(draft.name)
  const duplicate =
    name && country
      ? sites.find(
          (site) =>
            placeKey(site.name, site.countryCode) === placeKey(name, country)
        )
      : undefined
  const add = () => {
    if (!name || !country || duplicate) return
    const entities: NewEntity[] = []
    const regionName = tidyName(draft.region)
    let regionId: Id<"region"> | undefined
    if (regionName) {
      const existing = regions.find(
        (region) =>
          region.countryCode === country &&
          normaliseName(region.name) === normaliseName(regionName)
      )
      regionId = existing?.id as Id<"region"> | undefined
      if (!regionId) {
        regionId = newId("region")
        entities.push({
          kind: "region",
          id: regionId,
          fields: { name: regionName, countryCode: country },
        })
      }
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

  const views: Record<View, ReactNode> = {
    list: (
      <SiteList
        sites={sites}
        query={query}
        onQuery={setQuery}
        value={value}
        onPick={pick}
        onNew={() => {
          // The typed search seeds the name, capitalised as iOS would.
          setDraft({
            ...blankSite(defaultCountry),
            // By code point, so a name starting with an emoji survives.
            name: typed
              ? Array.from(typed)[0].toUpperCase() +
                Array.from(typed).slice(1).join("")
              : "",
          })
          go("create")
        }}
        addLabel={typed ? `Add “${typed}”` : "New site"}
      />
    ),
    create: (
      <NewSite
        draft={draft}
        onDraft={setDraft}
        regions={regions}
        duplicate={duplicate}
        onUse={() => duplicate && pick(duplicate.id)}
        onCountry={() => go("country")}
        onBody={() => go("body")}
      />
    ),
    country: (
      <CountryList
        sites={sites}
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
    create: (
      <SheetBar
        title="New site"
        start={<BackButton label="Sites" onClick={() => go("list", true)} />}
        end={
          <BarButton
            strong
            disabled={!name || !country || !!duplicate}
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
          <BackButton label="New site" onClick={() => go("create", true)} />
        }
      />
    ),
    body: (
      <SheetBar
        title="Body of water"
        start={
          <BackButton label="New site" onClick={() => go("create", true)} />
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
      disablePointerDismissal={view !== "list"}
      onOpenChange={(next, details) => {
        if (
          !next &&
          view !== "list" &&
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
              "animate-in duration-300 ease-drawer fade-in-50 motion-reduce:[--tw-enter-translate-x:0]",
            move === "back" && "slide-in-from-left-8",
            move === "forward" && "slide-in-from-right-16"
          )}
        >
          {bar[view]}
          <div
            // A drag on a new site's fields scrolls, never pulls the sheet.
            data-base-ui-swipe-ignore={view !== "list" ? "" : undefined}
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
    <BarButton onClick={onClick} className="pl-0.5">
      <IconChevronLeft aria-hidden className="size-5.5 stroke-[2.25]" />
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
  onNew,
  addLabel,
}: {
  sites: SiteRow[]
  query: string
  onQuery: (query: string) => void
  value: string | null
  onPick: (id: string) => void
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
            className="flex min-h-13 items-center gap-3 px-4 text-left text-base font-medium text-primary transition-colors duration-150 active:bg-muted active:duration-0"
          >
            <IconPlus aria-hidden className="size-5 shrink-0" />
            <span className="truncate">{addLabel}</span>
          </button>
        </SheetSection>
      </div>
      {key ? (
        results.length ? (
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
      className="flex min-h-14 items-center gap-3 py-2 pr-3.5 pl-4 text-left transition-colors duration-150 active:bg-muted active:duration-0"
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

function NewSite({
  draft,
  onDraft,
  regions,
  duplicate,
  onUse,
  onCountry,
  onBody,
}: {
  draft: SiteDraft
  onDraft: (draft: SiteDraft) => void
  regions: RegionRow[]
  duplicate: SiteRow | undefined
  onUse: () => void
  onCountry: () => void
  onBody: () => void
}) {
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
            value={draft.name}
            onChange={(event) =>
              onDraft({ ...draft, name: event.target.value })
            }
            placeholder="Required"
            maxLength={nameLimit}
            enterKeyHint="next"
            // Return moves on to the region, the next thing to type.
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              regionInput.current?.focus()
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            className="h-11.5 min-w-0 flex-1 bg-transparent text-right text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
          />
        </div>
        {duplicate && (
          <div className="flex items-center gap-2.5 py-1.5 pr-1.5 pl-4 text-[13px] text-muted-foreground">
            <IconAlertTriangle aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {duplicate.name} already exists in{" "}
              {countryName(duplicate.countryCode)}
            </span>
            <BarButton strong onClick={onUse} className="text-[13px]">
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
                if (event.key !== "Enter") return
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
                  className="flex min-h-13 w-full items-center gap-3 px-4 py-1.5 text-left transition-colors duration-150 not-first:border-t active:bg-muted active:duration-0"
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
      className="flex min-h-11.5 items-center gap-3 px-4 text-left transition-colors duration-150 active:bg-muted active:duration-0"
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

function CountryList({
  sites,
  value,
  onPick,
}: {
  sites: SiteRow[]
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
        className="flex min-h-12 items-center gap-3 px-4 text-left text-base font-medium transition-colors duration-150 active:bg-muted active:duration-0"
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

function BodyList({
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
          className="flex min-h-12 items-center gap-3 px-4 py-2 text-left transition-colors duration-150 active:bg-muted active:duration-0"
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
