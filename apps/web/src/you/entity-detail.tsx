import { useMemo, useRef, useState, type ReactNode } from "react"
import {
  bodiesOfWater,
  countryName,
  defaultWaterType,
  type BodyOfWater,
  type DiveRole,
  type DiveSetKind,
  type CountryCode,
  type EntityKind,
  type WaterType,
} from "@shylog/core"
import {
  IconArrowBarToDown,
  IconArrowMerge,
  IconCalendar,
  IconCheck,
  IconDroplet,
  IconSalt,
  IconMapPin,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react"
import { useRouter } from "@tanstack/react-router"
import { cn } from "cn"

import { LeaveGuard, type Leave } from "@/components/leave-guard"
import { countText, nameLimit, tidyName } from "@/components/pickers/match"
import { options } from "@/components/pickers/option-sheet"
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
  changesOf,
  deleteEntity,
  diveCounts,
  divesUsing,
  emptiable,
  entitiesOf,
  failureText,
  figuresOf,
  isUnknown,
  likelySameName,
  mergeCandidates,
  mergeEntity,
  pickedOf,
  putEntity,
  setEntityDives,
  sitesIn,
  tripDates,
  usedBy,
  type Entity,
} from "@/data/entities"
import { currentLog, type LogView } from "@/data/log"
import {
  Label,
  PickRow,
  Row,
  RowInput,
  Section,
  Segmented,
  SelectRow,
  type Icon,
} from "@/dive/form/rows"
import { months } from "@/format/dates"
import { depth } from "@/format/figures"
import { useDesk } from "@/hooks/use-desk"

import { PageBar, useBack } from "./bar"
import { DivePicker } from "./dive-picker"
import { ChooseDivesRow, DivesCard } from "./dives-card"
import { kindLabels } from "./kinds"
import { MergeSheet, type Candidate } from "./merge-sheet"
import { OfflineMark } from "@/components/offline-mark"
import { useConnected } from "@/data/sync-status"

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

type Sheet = "country" | "region" | "body" | "merge" | "delete" | "dives" | null

// The kinds whose dives can be ticked from their detail.
export const pickable = (kind: EntityKind): kind is DiveSetKind =>
  kind === "trip" || kind === "diveCentre" || kind === "person"

const unitOf = (kind: EntityKind): [string, string] =>
  kind === "region" ? ["site", "sites"] : ["dive", "dives"]

// EntityDetailHifi: the name and where it is, its own figures, the fields
// with Save, its dives, and merging a duplicate in or deleting it.
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
  const changed = fieldsOf[kind].some((field) => values[field] !== base[field])
  // Set as a merge or delete takes this screen away, so LeaveGuard lets
  // them go; a move elsewhere it held waits on Discard changes?.
  const leaving = useRef(false)
  const [leave, setLeave] = useState<Leave | null>(null)
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
  // Renaming, merging, deleting and choosing dives all need the server.
  const connected = useConnected()
  const frozen = pending || !connected
  // Imports find it by its name and country, and its dives are at many
  // places, so they are moved off one by one and it is never changed.
  const locked = isUnknown(log, id)
  // Only one the server knows can be named in a request.
  const choosing = pickable(kind) && !pending ? kind : null

  // The picker starts from these, worked out once per log rather than on
  // every keystroke in the name.
  const { opening, canEmpty } = useMemo(
    () =>
      choosing
        ? {
            opening: pickedOf(log, choosing, id),
            canEmpty: emptiable(log, choosing, id),
          }
        : { opening: new Map(), canEmpty: false },
    [log, choosing, id]
  )

  // Saves the picker's ticks, as changes from what it opened with.
  // Unticking every dive deletes it, once the diver has confirmed, and
  // goes back to the list as Delete does; if something it can't see still
  // uses it, the server keeps it and this screen stays.
  const chooseDives = async (
    setKind: DiveSetKind,
    ticked: Map<string, DiveRole | null>,
    opened: Map<string, DiveRole | null>,
    deleteIfEmpty: boolean
  ) => {
    const changes = changesOf(setKind, opened, ticked)
    if (!changes.add?.length && !changes.remove?.length && !deleteIfEmpty)
      return
    try {
      await setEntityDives(setKind, id, { ...changes, deleteIfEmpty })
    } catch (failure) {
      throw new Error(failureText(log, failure), { cause: failure })
    }
    if (
      !deleteIfEmpty ||
      entitiesOf(currentLog() ?? log, kind).some((one) => one.id === id)
    )
      return
    leaving.current = true
    if (!goBack())
      void router.navigate({
        to: "/you/entities",
        search: { kind },
        replace: true,
      })
  }

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
      leaving.current = true
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
      leaving.current = true
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

  // Always in the bar and off until an edit, as the dive form's Save and
  // iOS's edit screens are, so nothing pops in with the first keystroke.
  // A desktop's is filled, as the form's header draws it.
  const saveButton = desk ? (
    <Button disabled={!changed || frozen || busy} onClick={save}>
      Save
    </Button>
  ) : (
    <BarButton strong disabled={!changed || frozen || busy} onClick={save}>
      Save
    </BarButton>
  )

  return (
    <div className="flex flex-col">
      <PageBar
        back={{ label: label.title, to: "/you/entities", search: { kind } }}
        crumb={saved.name}
        end={
          !locked && (
            <>
              <OfflineMark show={!connected} className="mx-1" />
              {saveButton}
            </>
          )
        }
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

        {locked && (
          <p className="px-1 text-[13px] leading-normal text-muted-foreground">
            {dives.length
              ? "Imported dives with no site wait here. Edit each one to choose its site."
              : "No imported dives are waiting for a site."}
          </p>
        )}

        {!locked && (
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
              </div>
              {(kind === "site" || kind === "region") && (
                <PickRow
                  label="Country"
                  value={values.countryCode && countryName(values.countryCode)}
                  onClick={() => setSheet("country")}
                />
              )}
              {/* A desktop picks from a Select, as the dive form's choices
                  are, where touch opens a sheet. */}
              {(kind === "site" || kind === "diveCentre") &&
                (desk ? (
                  <SelectRow
                    label="Region"
                    value={values.regionId}
                    options={regionsHere.map((region) => ({
                      value: region.id,
                      label: regionName(region.id)!,
                    }))}
                    empty="Not set"
                    onChange={(region) => set("regionId", region)}
                  />
                ) : (
                  <PickRow
                    label="Region"
                    value={regionName(values.regionId)}
                    empty="Not set"
                    onClick={() => setSheet("region")}
                  />
                ))}
              {kind === "site" && (
                <>
                  {desk ? (
                    <SelectRow
                      label="Body of water"
                      value={values.bodyOfWater}
                      options={options(bodiesOfWater)}
                      empty="Not set"
                      onChange={(body) => {
                        set("bodyOfWater", body)
                        // As a new site's does, the water follows the body.
                        if (body) set("waterType", defaultWaterType(body))
                      }}
                    />
                  ) : (
                    <PickRow
                      label="Body of water"
                      value={
                        values.bodyOfWater &&
                        bodiesOfWater[values.bodyOfWater].label
                      }
                      empty="Not set"
                      onClick={() => setSheet("body")}
                    />
                  )}
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
            {/* Under the card, so the field's row keeps its shape, with the
                way out as a row of its own. */}
            {nameError && (
              <p
                id="error-name"
                role="alert"
                className="mt-2 px-1 text-[13px] [overflow-wrap:anywhere] text-destructive"
              >
                {nameError}
              </p>
            )}
            {nameError && conflict && (
              <Card className="mt-3 gap-0 py-0">
                <button
                  type="button"
                  disabled={busy || !connected}
                  onClick={mergeInstead}
                  className="flex min-h-12 items-center gap-2 px-4 text-left text-[15px] font-medium text-primary transition-colors duration-150 select-none enabled:hover:bg-muted/60 enabled:active:bg-muted enabled:active:duration-0 disabled:text-muted-foreground/60"
                >
                  <IconArrowMerge aria-hidden className="size-[1.15em]" />
                  <span className="[overflow-wrap:anywhere]">
                    Merge into {conflict.name}
                  </span>
                </button>
              </Card>
            )}
            {error && (
              <p
                role="alert"
                className="mt-2 px-1 text-[13px] text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        )}

        {(dives.length > 0 || choosing) && (
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
            <DivesCard dives={dives} kind={kind} log={log} parent={saved.name}>
              {choosing && (
                <ChooseDivesRow
                  onClick={() => setSheet("dives")}
                  disabled={!connected}
                />
              )}
            </DivesCard>
          </section>
        )}

        {!locked && (
          <section aria-label="Actions">
            <Card className="gap-0 divide-y py-0">
              <button
                type="button"
                disabled={frozen}
                onClick={() => setSheet("merge")}
                className="flex min-h-12 items-center gap-2 px-4 text-left text-[15px] font-medium text-primary transition-colors duration-150 select-none enabled:hover:bg-muted/60 enabled:active:bg-muted enabled:active:duration-0 disabled:text-muted-foreground/60"
              >
                <IconArrowMerge aria-hidden className="size-[1.15em]" />
                Merge a duplicate into this
              </button>
              <button
                type="button"
                disabled={!!used || frozen}
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
        )}
      </div>

      {choosing && (
        <DivePicker
          open={sheet === "dives"}
          onOpenChange={(open) => !open && setSheet(null)}
          log={log}
          kind={choosing}
          entityId={id}
          name={saved.name}
          picked={opening}
          action="Save"
          onConfirm={(ticked, opened, deleteIfEmpty) =>
            chooseDives(choosing, ticked, opened, deleteIfEmpty)
          }
          emptyConfirm={
            canEmpty
              ? {
                  title: `Delete ${saved.name}?`,
                  description:
                    kind === "trip"
                      ? "No dives are left in it. They stay in your log, in no trip."
                      : `No dives are left with this ${label.one}.`,
                  action: `Delete ${label.one}`,
                }
              : undefined
          }
        />
      )}

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

      {desk && (
        <>
          <LeaveGuard
            when={() => !leaving.current && changed}
            onBlock={setLeave}
          />
          {/* Asked as the dive form asks, in shadcn's alert dialog shape. */}
          <Drawer
            open={leave != null}
            onOpenChange={(open) => {
              if (open) return
              leave?.reset()
              setLeave(null)
            }}
          >
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Discard changes?</DrawerTitle>
                <DrawerDescription>
                  Your changes to this {label.one} will be lost.
                </DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    leave?.reset()
                    setLeave(null)
                  }}
                >
                  Keep editing
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setLeave(null)
                    leave?.proceed()
                  }}
                >
                  Discard changes
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </>
      )}

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
