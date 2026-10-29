import { useMemo, useState, type ReactNode } from "react"
import {
  bodiesOfWater,
  defaultWaterType,
  type BodyOfWater,
  type CountryCode,
  type EntityKind,
  type WaterType,
} from "@shylog/core"
import {
  IconArrowBarToDown,
  IconArrowMerge,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconDroplet,
  IconHourglass,
  IconSalt,
  IconMapPin,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react"
import { Link, useRouter } from "@tanstack/react-router"
import { cn } from "cn"

import { countText, nameLimit, tidyName } from "@/components/pickers/match"
import {
  BarButton,
  FullSheetContent,
  SheetBar,
  SheetSection,
} from "@/components/pickers/sheet"
import { BodyList, CountryList } from "@/components/pickers/site-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import type { Dive } from "@/data/db"
import { Refused } from "@/data/edits"
import {
  deleteEntity,
  diveCounts,
  divesUsing,
  figuresOf,
  likelySameName,
  mergeCandidates,
  mergeEntity,
  putEntity,
  sitesIn,
  tripDates,
  usedBy,
  type Entity,
} from "@/data/entities"
import type { LogView } from "@/data/log"
import {
  Label,
  PickRow,
  Reveal,
  Row,
  RowInput,
  Section,
  Segmented,
  type Icon,
} from "@/dive/form/rows"
import { clockTime, longDate, months } from "@/format/dates"
import { depth, minutes } from "@/format/figures"
import { countryName } from "@/format/place"
import { useDesk } from "@/hooks/use-desk"

import { PageBar, useBack } from "./bar"
import { kindLabels } from "./kinds"
import { MergeSheet, type Candidate } from "./merge-sheet"

// An entity's fields as the Details card edits them. Only a site has them
// all; the rest are left out of what is saved.
interface Values {
  name: string
  countryCode: string | null
  regionId: string | null
  bodyOfWater: BodyOfWater | null
  waterType: WaterType | null
}

function valuesOf(log: LogView, kind: EntityKind, id: string): Values {
  const site = kind === "site" ? log.sites.get(id) : undefined
  const region = kind === "region" ? log.regions.get(id) : undefined
  const centre = kind === "diveCentre" ? log.diveCentres.get(id) : undefined
  const name =
    site?.name ??
    region?.name ??
    centre?.name ??
    (kind === "person" ? log.people.get(id)?.name : log.trips.get(id)?.name) ??
    ""
  return {
    name,
    countryCode: site?.countryCode ?? region?.countryCode ?? null,
    regionId: site?.regionId ?? centre?.regionId ?? null,
    bodyOfWater: (site?.bodyOfWater as BodyOfWater | null) ?? null,
    waterType: (site?.waterType as WaterType | null) ?? null,
  }
}

// What each kind's request may carry.
const fieldsOf = {
  site: ["name", "countryCode", "regionId", "bodyOfWater", "waterType"],
  region: ["name", "countryCode"],
  person: ["name"],
  diveCentre: ["name", "regionId"],
  trip: ["name"],
} satisfies Record<EntityKind, (keyof Values)[]>

// The board's Essential icons on the figures; a plain count of dives has
// none.
const figureIcons: Record<string, Icon | undefined> = {
  Deepest: IconArrowBarToDown,
  "Last dive": IconCalendar,
  "Dives together": IconUsers,
  "As buddy": IconUsers,
  Sites: IconMapPin,
  Days: IconCalendar,
}

type Sheet = "country" | "region" | "body" | "merge" | "delete" | null

const unitOf = (kind: EntityKind): [string, string] =>
  kind === "region" ? ["site", "sites"] : ["dive", "dives"]

// EntityDetailHifi: the name and where it is, its own figures, the fields
// with Save (D7), its dives, and merging a duplicate in or deleting it.
export function EntityDetail({
  log,
  kind,
  id,
}: {
  log: LogView
  kind: EntityKind
  id: string
}) {
  const router = useRouter()
  const goBack = useBack()
  const desk = useDesk()
  const label = kindLabels[kind]
  const saved = valuesOf(log, kind, id)
  const [values, setValues] = useState(saved)
  const [base, setBase] = useState(saved)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState<Entity>()
  const [nameError, setNameError] = useState<string>()
  const [deleteError, setDeleteError] = useState<string>()
  // Three, then the rest 50 at a time, so a busy site never renders
  // hundreds of rows at once.
  const [shownDives, setShownDives] = useState(3)
  const changed = fieldsOf[kind].some((field) => values[field] !== base[field])
  // A sync that changes it shows the change unless something is typed.
  if (!changed && JSON.stringify(saved) !== JSON.stringify(base)) {
    setBase(saved)
    setValues(saved)
  }

  const set = <K extends keyof Values>(field: K, value: Values[K]) => {
    setValues((was) => ({ ...was, [field]: value }))
    setError(undefined)
    // A new country changes the key a rename collides on, as the name does.
    if (field === "name" || field === "countryCode") {
      setNameError(undefined)
      setConflict(undefined)
    }
  }

  // Worked out once per log, not on every keystroke in the name.
  const { dives, figures, since, used, candidates, countrySites } =
    useMemo(() => {
      // What moves in a merge: every dive, ignored ones too, or the sites.
      const moving = diveCounts(log, kind, { ignored: true })
      // Each trip's dives in one pass, for the candidates' dates.
      const tripDives = new Map<string, Dive[]>()
      if (kind === "trip")
        for (const dive of log.dives)
          if (dive.tripId && !dive.ignored)
            tripDives.set(dive.tripId, [
              ...(tripDives.get(dive.tripId) ?? []),
              dive,
            ])
      // Each site's latest dive, for the country sheet's Recent; the log is
      // newest first.
      const lastDives = new Map<string, string>()
      for (const dive of log.dives)
        if (!lastDives.has(dive.siteId))
          lastDives.set(dive.siteId, dive.startTime)
      const candidates: Candidate[] = mergeCandidates(log, kind, id).map(
        (other) => ({
          ...other,
          count:
            kind === "region"
              ? sitesIn(log, other.id).length
              : (moving.get(other.id) ?? 0),
          unit: unitOf(kind),
          place:
            kind === "site" && log.sites.get(other.id)?.regionId
              ? log.regions.get(log.sites.get(other.id)!.regionId!)?.name
              : kind === "trip"
                ? tripDates(tripDives.get(other.id) ?? [])?.text
                : undefined,
          likely: likelySameName(other.name, saved.name),
        })
      )
      return {
        // Its Dives list shows ignored dives too; only the figures leave
        // them out.
        dives: divesUsing(log, kind, id),
        ...figuresOf(log, kind, id),
        used: usedBy(log, kind, id),
        candidates,
        countrySites: [...log.sites.values()].map((site) => ({
          id: site.id,
          name: site.name,
          countryCode: site.countryCode,
          region: null,
          count: 0,
          last: lastDives.get(site.id) ?? "",
        })),
      }
    }, [log, kind, id, saved.name])
  const pending = log.pending.has(id)

  const save = async () => {
    const name = tidyName(values.name)
    if (!name) {
      setNameError("Give it a name")
      return
    }
    // The name goes only when it was edited, tidied; a stored name with a
    // double space isn't renamed by a change to something else.
    const request: Record<string, unknown> = {}
    for (const field of fieldsOf[kind]) {
      if (field === "name") {
        if (values.name !== base.name && name !== base.name) request.name = name
      } else if (values[field] !== base[field]) {
        request[field] = values[field]
      }
    }
    // The server picks the water from a new body of water unless told, so
    // a water chosen with it is sent too.
    if ("bodyOfWater" in request) request.waterType = values.waterType
    // Only a trailing space was typed: nothing to send.
    if (!Object.keys(request).length) {
      setValues(base)
      return
    }
    const sent = values
    setBusy(true)
    setError(undefined)
    try {
      await putEntity(kind, id, request)
      const next = { ...values, name }
      setBase(next)
      // Anything typed while it saved stays.
      setValues((was) => (was === sent ? next : was))
    } catch (failure) {
      // Only a clash over the name can be merged into: moving a region's
      // sites to a new country can clash with a site instead, and a region
      // can only merge into one in its own country.
      const other =
        failure instanceof Refused &&
        (failure.details.path as unknown[] | undefined)?.[0] === "name" &&
        !(kind === "region" && "countryCode" in request)
          ? (failure.details.conflict as Entity | undefined)
          : undefined
      if (other) {
        setNameError(failure instanceof Error ? failure.message : undefined)
        setConflict(other)
      } else {
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    } finally {
      setBusy(false)
    }
  }

  // The colliding rename's way out: this one merges into the one holding
  // the name, which takes this screen's place.
  const mergeInstead = async () => {
    if (!conflict) return
    setBusy(true)
    try {
      // Away before the sync takes this one out of the log.
      await mergeEntity(kind, id, conflict.id, { settle: false })
      void router.navigate({
        to: "/you/entities/$kind/$id",
        params: { kind, id: conflict.id },
        state: router.state.location.state,
        replace: true,
      })
    } catch (failure) {
      setNameError(failure instanceof Error ? failure.message : String(failure))
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setDeleteError(undefined)
    try {
      await deleteEntity(kind, id, { settle: false })
      // Back to the list it was opened from, or a fresh one.
      if (!goBack())
        void router.navigate({
          to: "/you/entities",
          search: { kind },
          replace: true,
        })
    } catch (failure) {
      // Kept open, with the reason by the button that was tapped.
      setBusy(false)
      setDeleteError(
        failure instanceof Error ? failure.message : String(failure)
      )
    }
  }

  const sub =
    kind === "site"
      ? [
          saved.regionId ? log.regions.get(saved.regionId)?.name : null,
          countryName(saved.countryCode ?? ""),
        ]
          .filter(Boolean)
          .join(", ")
      : kind === "region"
        ? countryName(saved.countryCode ?? "")
        : kind === "person"
          ? since && `Buddy since ${since}`
          : kind === "diveCentre"
            ? saved.regionId && log.regions.get(saved.regionId)?.name
            : tripDates(dives.filter((dive) => !dive.ignored))?.text

  // A region only a draft has can't be named in a request yet.
  const regionsHere = [...log.regions.values()]
    .filter(
      (region) =>
        !log.pending.has(region.id) &&
        (kind === "diveCentre" || region.countryCode === values.countryCode)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  const regionName = (regionId: string | null) => {
    const region = regionId ? log.regions.get(regionId) : undefined
    if (!region) return null
    return kind === "diveCentre"
      ? `${region.name}, ${countryName(region.countryCode)}`
      : region.name
  }

  const saveButton = changed && !pending && (
    <BarButton strong disabled={busy} onClick={save}>
      Save
    </BarButton>
  )

  return (
    <div className="flex flex-col">
      <PageBar
        back={{ label: label.title, to: "/you/entities", search: { kind } }}
        end={desk ? undefined : saveButton}
      />
      <div className="flex flex-col gap-6 px-4 pt-3 pb-10 md:mx-auto md:w-full md:max-w-xl">
        <section className="flex flex-col gap-1 px-1">
          <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.035em] [overflow-wrap:anywhere]">
            {saved.name}
          </h1>
          {sub && (
            <p className="text-[15px] text-muted-foreground tabular-nums">
              {sub}
            </p>
          )}
        </section>

        <dl aria-label="Summary" className="grid grid-cols-3 px-1">
          {figures.map((figure) => {
            const Icon = figureIcons[figure.term]
            return (
              <div
                key={figure.term}
                className="flex min-w-0 flex-col-reverse gap-px border-border px-3 not-first:border-l first:pl-0 last:pr-0"
              >
                <dt className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {Icon && (
                    <Icon aria-hidden className="size-[1.15em] shrink-0" />
                  )}
                  <span className="truncate">{figure.term}</span>
                </dt>
                <dd className="text-[22px] leading-7 font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums max-[374px]:text-lg">
                  {figure.value == null
                    ? "—"
                    : figure.kind === "depth"
                      ? `${depth(figure.value as number)} m`
                      : figure.kind === "date"
                        ? shortDate(figure.value as string)
                        : countText(figure.value as number)}
                </dd>
              </div>
            )
          })}
        </dl>

        <div>
          <Section title="Details">
            <div>
              <Row>
                <Label htmlFor="entity-name">Name</Label>
                <RowInput
                  id="entity-name"
                  value={values.name}
                  onChange={(event) => set("name", event.target.value)}
                  maxLength={nameLimit}
                  autoCapitalize="words"
                  aria-invalid={!!nameError || undefined}
                  aria-describedby={nameError ? "error-name" : undefined}
                />
              </Row>
              {nameError && (
                <div className="-mt-1.5 flex flex-col items-end gap-0.5 px-4 pb-2">
                  <p
                    id="error-name"
                    className="-mt-1 self-stretch text-right text-[13px] [overflow-wrap:anywhere] text-destructive"
                  >
                    {nameError}
                  </p>
                  {conflict && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={mergeInstead}
                      className="relative inline-flex h-9 items-center text-[15px] font-semibold text-primary transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-inset-y-1 hover:opacity-70 active:opacity-50 active:duration-0 disabled:opacity-50"
                    >
                      Merge instead
                    </button>
                  )}
                </div>
              )}
            </div>
            {(kind === "site" || kind === "region") && (
              <PickRow
                label="Country"
                value={values.countryCode && countryName(values.countryCode)}
                onClick={() => setSheet("country")}
              />
            )}
            {(kind === "site" || kind === "diveCentre") && (
              <PickRow
                label="Region"
                value={regionName(values.regionId)}
                empty="Not set"
                onClick={() => setSheet("region")}
              />
            )}
            {kind === "site" && (
              <>
                <PickRow
                  label="Body of water"
                  value={
                    values.bodyOfWater &&
                    bodiesOfWater[values.bodyOfWater].label
                  }
                  empty="Not set"
                  onClick={() => setSheet("body")}
                />
                <Row className="py-1.5">
                  <Label id="entity-water">Water</Label>
                  <span className="flex-1" />
                  <Segmented
                    labelledBy="entity-water"
                    className="w-auto"
                    value={values.waterType}
                    onChange={(water) => water && set("waterType", water)}
                    options={[
                      { value: "salt", label: "Salt", icon: IconSalt },
                      { value: "fresh", label: "Fresh", icon: IconDroplet },
                    ]}
                  />
                </Row>
              </>
            )}
          </Section>
          {error && (
            <p role="alert" className="mt-2 px-1 text-[13px] text-destructive">
              {error}
            </p>
          )}
          {desk && changed && !pending && (
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setValues(base)
                  setNameError(undefined)
                  setConflict(undefined)
                  setError(undefined)
                }}
              >
                Cancel
              </Button>
              <Button disabled={busy} onClick={save}>
                Save
              </Button>
            </div>
          )}
        </div>

        {dives.length > 0 && (
          <section aria-labelledby="entity-dives">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2
                id="entity-dives"
                className="text-[13px] font-semibold text-muted-foreground"
              >
                Dives
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {countText(dives.length)}
              </span>
            </div>
            <Card className="gap-0 divide-y py-0">
              {dives.slice(0, 3).map((dive) => (
                <DiveRow
                  key={dive.id}
                  dive={dive}
                  kind={kind}
                  log={log}
                  parent={saved.name}
                />
              ))}
              {/* The rest ease open rather than pushing Actions down at once. */}
              {/* One reveal per batch, so each "more" eases open too. */}
              {Array.from(
                { length: Math.ceil((shownDives - 3) / 50) },
                (_, batch) => 3 + batch * 50
              ).map((start) => (
                <Reveal key={start} className="divide-y">
                  {dives.slice(start, start + 50).map((dive) => (
                    <DiveRow
                      key={dive.id}
                      dive={dive}
                      kind={kind}
                      log={log}
                      parent={saved.name}
                    />
                  ))}
                </Reveal>
              ))}
              {/* Folds shut as the last batch opens, rather than leaving
                  at once and dropping the page under the finger. */}
              {dives.length > 3 && (
                <div
                  inert={dives.length <= shownDives}
                  className={cn(
                    "grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out motion-reduce:transition-[opacity,visibility]",
                    dives.length > shownDives
                      ? "visible grid-rows-[1fr] opacity-100"
                      : "invisible grid-rows-[0fr] opacity-0"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setShownDives((was) => was + 50)}
                    className="flex min-h-0 items-center gap-1.5 overflow-hidden px-4 text-left text-[15px] font-medium text-primary transition-colors duration-150 select-none hover:bg-muted/60 active:bg-muted active:duration-0"
                  >
                    {/* "All" only when one tap shows them all. */}
                    <span className="flex min-h-12 items-center gap-1.5">
                      {dives.length - shownDives <= 50
                        ? `All ${countText(dives.length)} dives`
                        : "50 more"}
                      <IconChevronDown aria-hidden className="size-4" />
                    </span>
                  </button>
                </div>
              )}
            </Card>
          </section>
        )}

        <section aria-label="Actions">
          <Card className="gap-0 divide-y py-0">
            <button
              type="button"
              disabled={pending}
              onClick={() => setSheet("merge")}
              className="flex min-h-12 items-center gap-2 px-4 text-left text-[15px] font-medium text-primary transition-colors duration-150 select-none enabled:hover:bg-muted/60 enabled:active:bg-muted enabled:active:duration-0 disabled:text-muted-foreground/60"
            >
              <IconArrowMerge aria-hidden className="size-[1.15em]" />
              Merge a duplicate into this
            </button>
            <button
              type="button"
              disabled={!!used || pending}
              onClick={() => setSheet("delete")}
              className="flex min-h-12 items-center gap-2 px-4 text-left text-[15px] font-medium text-destructive transition-colors duration-150 select-none enabled:hover:bg-muted/60 enabled:active:bg-muted enabled:active:duration-0 disabled:text-muted-foreground/60"
            >
              <IconTrash aria-hidden className="size-[1.15em]" />
              Delete {label.one}
            </button>
          </Card>
          {/* Only where Delete is disabled, to say why. */}
          {(pending || used) && (
            <Note>
              {pending
                ? `This ${label.one} is on this phone only until its dive uploads, so it can’t be changed yet.`
                : `Used by ${used}, so it can’t be deleted. Merge it into the one to keep instead.`}
            </Note>
          )}
        </section>
      </div>

      <Drawer
        open={sheet === "country"}
        onOpenChange={(open) => !open && setSheet(null)}
      >
        <FullSheetContent>
          <SheetBar
            title="Country"
            start={<BarButton onClick={() => setSheet(null)}>Cancel</BarButton>}
          />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+var(--keyboard,0px))]">
            <CountryList
              sites={countrySites}
              value={values.countryCode}
              onPick={(code: CountryCode) => {
                set("countryCode", code)
                // A site's region is always in its country.
                if (
                  kind === "site" &&
                  values.regionId &&
                  log.regions.get(values.regionId)?.countryCode !== code
                )
                  set("regionId", null)
                setSheet(null)
              }}
            />
          </div>
        </FullSheetContent>
      </Drawer>

      <Drawer
        showSwipeHandle
        open={sheet === "body"}
        onOpenChange={(open) => !open && setSheet(null)}
      >
        <DrawerContent>
          <DrawerHeader className="pb-3">
            <DrawerTitle>Body of water</DrawerTitle>
          </DrawerHeader>
          {/* pt-1 keeps the card's ring, drawn outside it, inside the
              scroller, which otherwise clips its top edge. */}
          <div className="overflow-y-auto px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <BodyList
              value={values.bodyOfWater}
              onPick={(body) => {
                set("bodyOfWater", body)
                // As a new site's does, the water follows the body.
                if (body) set("waterType", defaultWaterType(body))
                setSheet(null)
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer
        showSwipeHandle
        open={sheet === "region"}
        onOpenChange={(open) => !open && setSheet(null)}
      >
        <DrawerContent>
          <DrawerHeader className="pb-3">
            <DrawerTitle>Region</DrawerTitle>
            <DrawerDescription>
              New regions are added from a dive’s site picker.
            </DrawerDescription>
          </DrawerHeader>
          {/* As above, pt-1 is room for the card's ring. */}
          <div className="overflow-y-auto px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <SheetSection>
              {[{ id: null, name: "Not set" }, ...regionsHere].map((region) => (
                <button
                  key={region.id ?? "none"}
                  type="button"
                  aria-current={region.id === values.regionId || undefined}
                  onClick={() => {
                    set("regionId", region.id)
                    setSheet(null)
                  }}
                  className="flex min-h-12 items-center gap-3 px-4 text-left transition-colors duration-150 hover:bg-muted/60 active:bg-muted active:duration-0"
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-base font-medium",
                      !region.id && "font-normal text-muted-foreground"
                    )}
                  >
                    {region.id ? regionName(region.id) : region.name}
                  </span>
                  {region.id === values.regionId && (
                    <IconCheck aria-hidden className="size-5 text-primary" />
                  )}
                </button>
              ))}
            </SheetSection>
          </div>
        </DrawerContent>
      </Drawer>

      <MergeSheet
        open={sheet === "merge"}
        onOpenChange={(open) => setSheet(open ? "merge" : null)}
        kind={kind}
        into={{ id, name: saved.name }}
        candidates={candidates}
      />

      <Drawer
        showSwipeHandle
        open={sheet === "delete"}
        onOpenChange={(open) => {
          if (busy || open) return
          setSheet(null)
          setDeleteError(undefined)
        }}
      >
        <DrawerContent role="alertdialog">
          <DrawerHeader className="pb-4">
            <DrawerTitle className="[overflow-wrap:anywhere]">
              Delete {saved.name}?
            </DrawerTitle>
            <DrawerDescription>
              {kind === "trip"
                ? "Its dives stay in your log, in no trip."
                : `Nothing uses this ${label.one}.`}
            </DrawerDescription>
          </DrawerHeader>
          {deleteError && (
            <p
              role="alert"
              className="px-4 pb-2 text-center text-[13px] text-destructive desk:px-6 desk:text-left"
            >
              {deleteError}
            </p>
          )}
          {desk ? (
            <DrawerFooter>
              <Button variant="outline" onClick={() => setSheet(null)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={busy} onClick={remove}>
                {deleteError ? "Try again" : `Delete ${label.one}`}
              </Button>
            </DrawerFooter>
          ) : (
            <div className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                variant="destructive"
                className="h-12 rounded-[14px] bg-destructive text-base font-semibold text-white hover:bg-destructive/90 dark:bg-red-600 dark:hover:bg-red-600/90"
                disabled={busy}
                onClick={remove}
              >
                {deleteError ? "Try again" : `Delete ${label.one}`}
              </Button>
              <Button
                variant="ghost"
                className="h-12 rounded-[14px] text-base font-semibold text-primary"
                onClick={() => setSheet(null)}
              >
                Cancel
              </Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 px-1 text-[13px] leading-normal text-muted-foreground">
      {children}
    </p>
  )
}

// "25 Jul" as the board's figure; "Jul 2024" when it isn't this year.
function shortDate(startTime: string) {
  const month = months[Number(startTime.slice(5, 7)) - 1]
  const year = startTime.slice(0, 4)
  return year === String(new Date().getFullYear())
    ? `${Number(startTime.slice(8, 10))} ${month}`
    : `${month} ${year}`
}

// A site's dives are told apart by date; anything else's by site.
function DiveRow({
  dive,
  kind,
  log,
  parent,
}: {
  dive: Dive
  kind: EntityKind
  log: LogView
  // The entity's name, which the dive's Back link says.
  parent: string
}) {
  const site = log.sites.get(dive.siteId)?.name
  const title = kind === "site" ? longDate(dive.startTime) : site
  const parts =
    kind === "site"
      ? [
          { icon: IconClock, text: clockTime(dive.startTime) },
          { icon: IconHourglass, text: `${minutes(dive.duration)} min` },
        ]
      : [
          { icon: IconCalendar, text: longDate(dive.startTime) },
          { icon: IconHourglass, text: `${minutes(dive.duration)} min` },
        ]
  return (
    <Link
      to="/dive/$diveId"
      params={{ diveId: dive.id }}
      state={{ pushed: true, parent }}
      className="flex min-h-14 items-center gap-3 py-2.5 pr-3 pl-4 transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-muted/60 active:bg-muted active:duration-0"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{title}</span>
        {/* The date gives way before the duration does. */}
        <span className="flex min-w-0 items-center gap-3 overflow-hidden text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
          {parts.map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="inline-flex min-w-0 items-center gap-1 last:shrink-0"
            >
              <Icon aria-hidden className="size-[1.15em] shrink-0" />
              <span className="truncate">{text}</span>
            </span>
          ))}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums">
        <IconArrowBarToDown
          aria-hidden
          className="size-3.5 text-muted-foreground"
        />
        {depth(dive.maxDepth)} m
      </span>
      <IconChevronRight
        aria-hidden
        className="size-4.5 shrink-0 text-muted-foreground/60"
      />
    </Link>
  )
}
