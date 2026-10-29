import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"
import {
  currents,
  diveTypes,
  entries,
  newId,
  surges,
  tags,
  thermalComforts,
  workloads,
  type ComparedField,
  type CountryCode,
  type Tag,
  type WaterType,
} from "@shylog/core"
import {
  IconAlertTriangle,
  IconArrowBarToDown,
  IconArrowBarToDownDashed,
  IconArrowsHorizontal,
  IconArrowWaveRightUp,
  IconBarbell,
  IconBuildingStore,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconClockPause,
  IconCloud,
  IconCloudRain,
  IconCopy,
  IconFish,
  IconHourglass,
  IconMapPin,
  IconNotes,
  IconPool,
  IconRipple,
  IconRuler,
  IconScubaDivingTank,
  IconSun,
  IconTemperatureSnow,
  IconUsers,
  IconUserStar,
  IconWeight,
} from "@tabler/icons-react"
import { useBlocker } from "@tanstack/react-router"
import { cn } from "cn"

import {
  IconLevelAverage,
  IconLevelHigh,
  IconLevelLow,
  IconSurfaceCalm,
  IconSurfaceStormy,
} from "@/components/icons"
import {
  IntervalSheet,
  type IntervalChoice,
} from "@/components/pickers/interval-sheet"
import { DatePopover, TimePopover } from "@/components/pickers/date-time"
import { countText } from "@/components/pickers/match"
import { NamesSheet, type Candidate } from "@/components/pickers/names-sheet"
import {
  OptionSheet,
  options,
  type Option,
} from "@/components/pickers/option-sheet"
import { SiteSheet, type SiteRow } from "@/components/pickers/site-sheet"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"
import type { Dive } from "@/data/db"
import type { LogView } from "@/data/log"
import { useDesk } from "@/hooks/use-desk"
import { longDate } from "@/format/dates"
import { bar, depth, interval } from "@/format/figures"
import { Haptic } from "@/lib/haptic"

import { formFigures } from "./calculated"
import {
  Block,
  DifferenceLine,
  ErrorLine,
  Field,
  FormShown,
  Label,
  Marker,
  PairInput,
  PickRow,
  pressedRow,
  SelectRow,
  ResetButton,
  Row,
  RowInput,
  Section,
  SourceNote,
  Reveal,
  Segmented,
  Unit,
  type Icon,
} from "./rows"
import { byRecent, logUsage } from "./usage"
import {
  comparedText,
  computerName,
  copyFromDive,
  differences,
  intervalParts,
  toFields,
  type FieldName,
  type FormValues,
  type NewEntity,
} from "./values"

// A desktop browser opens a date or time picker only from its icon, and a
// click on the hidden box's text just selects a part of it, so a mouse
// click opens the picker; a tap already does.
const openPicker = (event: MouseEvent<HTMLInputElement>) => {
  if ((event.nativeEvent as PointerEvent).pointerType === "mouse")
    event.currentTarget.showPicker()
}

// Smooth scrolling, unless the phone asks for reduced motion, which a
// script's smooth scroll otherwise ignores.
const scrolling = (): ScrollBehavior =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"

type Sheet =
  | "site"
  | "trip"
  | "buddies"
  | "diveProfessionals"
  | "diveCentre"
  | "diveType"
  | "entry"
  | "current"
  | "surge"
  | "workload"
  | "thermalComfort"

const choiceSheets = {
  entry: { title: "Entry", icon: IconPool, options: options(entries) },
  current: {
    title: "Current",
    icon: IconArrowWaveRightUp,
    options: options(currents),
  },
  surge: {
    title: "Surge",
    icon: IconArrowsHorizontal,
    options: options(surges),
  },
  workload: {
    title: "Workload",
    icon: IconBarbell,
    options: options(workloads),
  },
  thermalComfort: {
    title: "Thermal comfort",
    icon: IconTemperatureSnow,
    options: options(thermalComforts),
  },
} as const

// The add and edit form (EditDiveHifi, with D14 and D29): one screen of
// sections, its pickers as sheets. Saving is the route's job; the form
// checks the values and hands them over.
export function DiveForm({
  title,
  log,
  initial,
  original,
  blank,
  dive,
  onChange,
  onSave,
  onCancel,
  onDiscard,
}: {
  title: string
  log: LogView
  initial: FormValues
  // The saved values, for the markers and resets; absent on a new dive.
  original?: FormValues
  // A new dive's untouched form, so Cancel knows whether anything was typed.
  blank?: FormValues
  dive?: Dive
  onChange?: (values: FormValues) => void
  // Rejects with a message to show when the save fails.
  onSave: (values: FormValues) => Promise<void>
  // Closes the form; onDiscard first drops what was typed.
  onCancel: () => void
  onDiscard?: () => void
}) {
  const [values, setValues] = useState(initial)
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [confirming, setConfirming] = useState(false)
  const desk = useDesk()
  // Asks first when something was typed, as an iOS edit sheet does: one
  // stray tap shouldn't throw a dive away.
  const typed = () =>
    JSON.stringify(values) !== JSON.stringify(original ?? blank ?? initial)
  // Set as Save or Cancel closes the form, so LeaveGuard lets them go.
  const leaving = useRef(false)
  const close = () => {
    leaving.current = true
    onDiscard?.()
    onCancel()
  }
  // A move elsewhere LeaveGuard held, waiting on the same question.
  const [leave, setLeave] = useState<Leave | null>(null)
  const cancel = () => {
    if (typed()) setConfirming(true)
    else close()
  }
  const discardNote = dive
    ? "Your changes to this dive will be lost."
    : "This dive hasn't been saved."
  const discard = () => {
    setConfirming(false)
    if (leave) {
      onDiscard?.()
      setLeave(null)
      leave.proceed()
    } else close()
  }
  const keep = () => {
    setConfirming(false)
    leave?.reset()
    setLeave(null)
  }
  // Kept on the phone once each change has rendered (see autosave.ts),
  // not from inside the state update, which React may run twice.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else onChange?.(values)
    // Only when the values change, not when a parent passes a new callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values])
  // Set once the form has appeared, so only rows a choice reveals later
  // ease open (see Reveal).
  const shown = useRef(false)
  useEffect(() => {
    shown.current = true
  }, [])

  const update = (next: Partial<FormValues>) => {
    setValues((was) => {
      // The compared fields typed in: a start time is its date and time.
      const changed = Object.keys(next).map((name) =>
        name === "date" || name === "time" ? "startTime" : name
      )
      // A typed value replaces an adopted or dismissed one, which would
      // otherwise keep it out of the edit (see changedFields).
      const merged = {
        ...was,
        ...next,
        adopt: was.adopt.filter((field) => !changed.includes(field)),
        dismiss: was.dismiss.filter((field) => !changed.includes(field)),
        ...("adopt" in next ? { adopt: next.adopt! } : {}),
        ...("dismiss" in next ? { dismiss: next.dismiss! } : {}),
      }
      return merged
    })
  }
  const set =
    <K extends FieldName>(name: K) =>
    (value: FormValues[K]) =>
      update({ [name]: value } as Partial<FormValues>)

  const errors = showErrors ? toFields(values).errors : {}
  const meta = dive ? log.fieldMeta.get(dive.id) : undefined
  const computer = computerName(dive?.computerModel ?? null)
  const open = (dive ? differences(dive, meta) : []).filter(
    (field) => !values.adopt.includes(field) && !values.dismiss.includes(field)
  )

  const created = <K extends NewEntity["kind"]>(kind: K) =>
    values.created.filter(
      (entity): entity is Extract<NewEntity, { kind: K }> =>
        entity.kind === kind
    )
  const create = (entity: NewEntity) =>
    update({ created: [...values.created, entity] })
  const usage = useMemo(() => logUsage(log), [log])

  const siteRows: SiteRow[] = useMemo(() => {
    const regionName = (id?: string | null) =>
      id
        ? (log.regions.get(id)?.name ??
          created("region").find((r) => r.id === id)?.fields.name ??
          null)
        : null
    return [
      ...[...log.sites.values()].map((site) => ({
        id: site.id,
        name: site.name,
        countryCode: site.countryCode,
        region: regionName(site.regionId),
        count: usage.sites.get(site.id)?.count ?? 0,
        last: usage.sites.get(site.id)?.last ?? "",
      })),
      ...created("site").map((site) => ({
        id: site.id,
        name: site.fields.name,
        countryCode: site.fields.countryCode,
        region: regionName(site.fields.regionId),
        count: 0,
        last: "",
      })),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, usage, values.created])
  // Counted in one pass, as the form re-renders on every keystroke.
  const regionSites = new Map<string, number>()
  for (const site of log.sites.values())
    if (site.regionId)
      regionSites.set(site.regionId, (regionSites.get(site.regionId) ?? 0) + 1)
  const regionRows = [
    ...[...log.regions.values()].map((region) => ({
      id: region.id,
      name: region.name,
      countryCode: region.countryCode,
      sites: regionSites.get(region.id) ?? 0,
    })),
    ...created("region").map((region) => ({
      id: region.id,
      name: region.fields.name,
      countryCode: region.fields.countryCode,
      sites: 0,
    })),
  ]
  const latest = log.dives[0]
  const defaultCountry =
    ((latest && log.sites.get(latest.siteId)?.countryCode) as
      CountryCode | undefined) ?? null

  const people: { id: string; name: string }[] = [
    ...log.people.values(),
    ...created("person").map((p) => ({ id: p.id, name: p.fields.name })),
  ]
  const candidates = (role: "buddies" | "professionals"): Candidate[] =>
    byRecent(people, usage[role]).map((p) => ({
      id: p.id,
      name: p.name,
      count: usage.people.get(p.id)?.count ?? 0,
    }))
  const centres: Candidate[] = byRecent(
    [
      ...log.diveCentres.values(),
      ...created("diveCentre").map((c) => ({ id: c.id, name: c.fields.name })),
    ],
    usage.diveCentres
  ).map((c) => ({
    id: c.id,
    name: c.name,
    count: usage.diveCentres.get(c.id)?.count ?? 0,
  }))
  const trips = byRecent(
    [
      ...log.trips.values(),
      ...created("trip").map((t) => ({ id: t.id, name: t.fields.name })),
    ],
    usage.trips
  ).map((t) => ({ ...t, count: usage.trips.get(t.id)?.count ?? 0 }))

  const nameOf = (id: string) =>
    people.find((p) => p.id === id)?.name ??
    centres.find((c) => c.id === id)?.name ??
    ""
  // The first name, and the rest as a count the name's ellipsis can't hide.
  const namesValue = (ids: string[]) => ({
    value: ids.length ? nameOf(ids[0]) : null,
    more: ids.length > 1 ? `+ ${countText(ids.length - 1)}` : undefined,
  })
  const site = siteRows.find((s) => s.id === values.siteId)
  const siteWater = (): WaterType => {
    const id = values.siteId
    if (!id) return "salt"
    const createdSite = created("site").find((s) => s.id === id)
    const water =
      createdSite?.fields.waterType ?? log.sites.get(id)?.waterType ?? "salt"
    return water === "fresh" ? "fresh" : "salt"
  }

  // The form field a compared field is typed in: a start time's clock part.
  const textField = (field: ComparedField): FieldName =>
    field === "startTime" ? "time" : field
  const hand = (field: ComparedField) =>
    meta?.get(field)?.source === "hand" ||
    (!!original && values[textField(field)] !== original[textField(field)])
  const figures = formFigures(values, {
    water: { waterType: siteWater() },
    settings: log.settings,
    dive,
    original,
    handDuration: !dive || hand("duration"),
    handAverageDepth: !dive || hand("averageDepth"),
  })

  // The marker or reset beside a compared field's label (D14): the value
  // came from the computer (or Shylog worked it out), and once edited the
  // marker turns into a reset to that value.
  const source = (field: ComparedField) => {
    if (!original || !dive) return null
    if (values.adopt.includes(field))
      return <Marker source="computer" computer={computer} />
    const row = meta?.get(field)
    // A draft has no field records yet, and its values are all typed.
    const derived =
      field === "averageDepth" &&
      !row &&
      !dive.draft &&
      dive.averageDepth != null
    if (row?.source !== "computer" && !derived) return null
    const key = textField(field)
    if (values[key] === original[key])
      return (
        <Marker
          source={derived ? "calculated" : "computer"}
          computer={computer}
        />
      )
    return (
      <ResetButton
        label={
          derived
            ? "Reset to the calculated value"
            : `Reset to the ${computer} value`
        }
        onClick={() => update({ [key]: original[key] } as Partial<FormValues>)}
      />
    )
  }
  const difference = (field: ComparedField, what: string, text: string) => {
    if (!open.includes(field)) return null
    const value = meta!.get(field)!.computerValue!
    return (
      <DifferenceLine
        computer={computer}
        what={what}
        text={text}
        onUse={() => {
          const next: Partial<FormValues> =
            field === "startTime"
              ? {
                  date: String(value).slice(0, 10),
                  time: comparedText(field, value),
                }
              : { [field]: comparedText(field, value) }
          update({
            ...next,
            adopt: [...values.adopt, field],
            dismiss: values.dismiss.filter((f) => f !== field),
          })
        }}
        onKeep={() => update({ dismiss: [...values.dismiss, field] })}
      />
    )
  }
  const computerText = (field: ComparedField, unit: string) => {
    const value = meta?.get(field)?.computerValue
    if (value == null) return ""
    if (field === "startTime") return comparedText(field, value)
    return `${comparedText(field, value)} ${unit}`
  }

  const error = (name: FieldName) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `error-${name}` : undefined,
  })
  const errorLine = (name: FieldName, inBlock = false) => (
    <ErrorLine id={`error-${name}`} message={errors[name]} inBlock={inBlock} />
  )

  const save = async () => {
    const found = toFields(values).errors
    const first = Object.keys(found)[0]
    if (first) {
      setShowErrors(true)
      // The fields are what's wrong now, not the last attempt's connection.
      setFailure(null)
      // After the error lines render, so the field lands in view with its note.
      requestAnimationFrame(() =>
        document
          .getElementById(`field-${first}`)
          ?.scrollIntoView({ block: "center", behavior: scrolling() })
      )
      return
    }
    setSaving(true)
    setFailure(null)
    leaving.current = true
    try {
      await onSave(values)
    } catch (caught) {
      leaving.current = false
      setFailure(caught instanceof Error ? caught.message : String(caught))
      setSaving(false)
      // The alert is at the top, which may be scrolled out of sight.
      requestAnimationFrame(() =>
        document
          .getElementById("save-failure")
          ?.scrollIntoView({ block: "nearest", behavior: scrolling() })
      )
    }
  }

  const numberRow = ({
    name,
    label,
    icon,
    unit,
    mode,
    marker,
    under,
    placeholder = "—",
  }: {
    name: FieldName
    label: string
    icon?: Icon
    unit?: string
    mode: "decimal" | "numeric"
    marker?: ReactNode
    under?: ReactNode
    placeholder?: string
  }) => (
    <Field
      under={
        <>
          {under}
          {errorLine(name)}
        </>
      }
    >
      <Row>
        <Label icon={icon} htmlFor={`field-${name}`} after={marker}>
          {label}
        </Label>
        <RowInput
          id={`field-${name}`}
          inputMode={mode}
          value={values[name] as string}
          onChange={(event) => set(name)(event.target.value as never)}
          placeholder={placeholder}
          {...error(name)}
        />
        {unit && <Unit>{unit}</Unit>}
      </Row>
    </Field>
  )

  return (
    <FormShown.Provider value={shown}>
      <div className="flex min-h-full shrink-0 flex-col">
        {/* From md: up the form keeps a phone-like width, centred, with its
            bar's actions over it, so labels stay near their values. */}
        <header className="sticky top-0 z-30 grid h-[calc(3.25rem+env(safe-area-inset-top))] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b bg-background px-2 pt-[env(safe-area-inset-top)] md:px-[max(0.5rem,calc((100%-36rem)/2))] desk:grid-cols-[minmax(0,1fr)_auto]">
          {desk ? (
            // As shadcn's page headers: the title, then the actions as
            // buttons, Save the filled one.
            <>
              <h1 className="min-w-0 truncate pl-4 text-base font-semibold tracking-[-0.015em]">
                {title}
              </h1>
              <div className="mr-4 flex gap-2 justify-self-end">
                <Button variant="outline" onClick={cancel}>
                  Cancel
                </Button>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={cancel}
                className="inline-flex h-11 items-center justify-self-start px-2 text-base font-medium text-primary transition-opacity duration-150 select-none [-webkit-touch-callout:none] hover:opacity-70 active:opacity-50 active:duration-0"
              >
                Cancel
              </button>
              <h1 className="text-base font-semibold tracking-[-0.015em]">
                {title}
              </h1>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex h-11 items-center justify-self-end px-2 text-base font-semibold text-primary transition-opacity duration-150 select-none [-webkit-touch-callout:none] active:opacity-50 active:duration-0 enabled:hover:opacity-70 disabled:text-muted-foreground/60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </header>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          className="flex flex-col gap-6 px-4 pt-5 pb-10 md:mx-auto md:w-full md:max-w-xl"
        >
          {failure && (
            <Alert id="save-failure" variant="destructive">
              <IconAlertTriangle aria-hidden />
              <AlertTitle>Couldn’t save</AlertTitle>
              {/* Only the icon and title in red, so the reason reads calmly. */}
              <AlertDescription className="text-muted-foreground">
                {failure}
              </AlertDescription>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="col-start-2 mt-2 w-fit text-foreground"
                onClick={() => void save()}
              >
                Try again
              </Button>
            </Alert>
          )}

          {!dive && latest && (
            <Card className="py-0">
              <button
                type="button"
                onClick={() => update(copyFromDive(values, latest, log))}
                className="flex min-h-11.5 w-full items-center gap-3 pr-3.5 pl-4 text-left transition-colors duration-150 hover:bg-muted/60 active:bg-muted active:duration-0"
              >
                {/* One row like the form's own; the last dive's site, which
                    is what it's remembered by, gives way to the title. */}
                <span className="flex shrink-0 items-center gap-2 text-base font-medium text-primary">
                  <IconCopy aria-hidden className="size-4.5" />
                  Copy from last dive
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-base text-muted-foreground">
                  {log.sites.get(latest.siteId)?.name}
                </span>
                <IconChevronRight
                  aria-hidden
                  className="size-4.5 shrink-0 text-muted-foreground/60"
                />
              </button>
            </Card>
          )}

          <Section
            title="Basics"
            note={<SourceNote computer={!!dive?.computerModel} />}
          >
            <Field
              under={difference(
                "startTime",
                "start time",
                computerText("startTime", "")
              )}
            >
              <Row
                className={cn(pressedRow, "has-data-popup-open:bg-muted/60")}
              >
                <Label icon={IconCalendar} htmlFor="field-date">
                  Date
                </Label>
                {desk ? (
                  <DatePopover
                    id="field-date"
                    value={values.date}
                    text={longDate(`${values.date}T00:00:00`)}
                    onChange={set("date")}
                  />
                ) : (
                  /* The date reads as text; the native picker sits over it,
                  invisible, so a tap anywhere on the value opens it. */
                  <span className="relative flex h-11.5 min-w-0 flex-1 items-center justify-end has-[:focus-visible]:text-primary">
                    <span
                      aria-hidden
                      className="text-base font-medium tabular-nums"
                    >
                      {longDate(`${values.date}T00:00:00`)}
                    </span>
                    <input
                      id="field-date"
                      type="date"
                      required
                      value={values.date}
                      // A date is always set: the picker's Reset puts the shown
                      // date back rather than leaving the picker blank.
                      onChange={(event) => {
                        if (event.target.value) set("date")(event.target.value)
                        else event.target.value = values.date
                      }}
                      onClick={openPicker}
                      className="absolute inset-0 opacity-0"
                    />
                  </span>
                )}
              </Row>
            </Field>
            <Field under={errorLine("siteId")}>
              <div id="field-siteId">
                <PickRow
                  icon={IconMapPin}
                  label="Site"
                  value={site?.name}
                  onClick={() => setSheet("site")}
                  {...(errors.siteId
                    ? { invalid: true, describedBy: "error-siteId" }
                    : {})}
                />
              </div>
            </Field>
            <Field under={errorLine("time")}>
              <Row
                className={cn(pressedRow, "has-data-popup-open:bg-muted/60")}
              >
                <Label
                  icon={IconClock}
                  htmlFor="field-time"
                  after={source("startTime")}
                >
                  Start time
                </Label>
                {desk ? (
                  <TimePopover
                    id="field-time"
                    value={values.time}
                    placeholder={errors.time ? "—" : "Required"}
                    onChange={set("time")}
                    {...error("time")}
                  />
                ) : (
                  /* Shown as text like the date, with the native picker over
                  it, so an empty time reads "Required" in every browser.
                  An empty time starts the picker at 09:00 rather than now
                  (see Add or edit in the spec), set before it opens. */
                  <span className="relative flex h-11.5 min-w-0 flex-1 items-center justify-end has-[:focus-visible]:text-primary">
                    <span
                      aria-hidden
                      className={cn(
                        "text-base font-medium tabular-nums",
                        !values.time && "font-normal text-muted-foreground/60"
                      )}
                    >
                      {values.time || (errors.time ? "—" : "Required")}
                    </span>
                    <input
                      id="field-time"
                      type="time"
                      value={values.time}
                      // On the tap's release, not its touch-down, so a scroll that
                      // starts on the row doesn't fill it in.
                      onPointerUp={() => !values.time && set("time")("09:00")}
                      onChange={(event) => set("time")(event.target.value)}
                      onClick={openPicker}
                      className="absolute inset-0 opacity-0"
                      {...error("time")}
                    />
                  </span>
                )}
              </Row>
            </Field>
            {numberRow({
              name: "duration",
              label: "Duration",
              icon: IconHourglass,
              unit: "min",
              mode: "numeric",
              marker: source("duration"),
              under: difference(
                "duration",
                "duration",
                computerText("duration", "min")
              ),
            })}
            {numberRow({
              name: "maxDepth",
              label: "Max depth",
              icon: IconArrowBarToDown,
              unit: "m",
              mode: "decimal",
              marker: source("maxDepth"),
              under: difference(
                "maxDepth",
                "max depth",
                computerText("maxDepth", "m")
              ),
            })}
            {numberRow({
              name: "averageDepth",
              label: "Average depth",
              icon: IconArrowBarToDownDashed,
              unit: "m",
              mode: "decimal",
              marker: source("averageDepth"),
              under: difference(
                "averageDepth",
                "average depth",
                computerText("averageDepth", "m")
              ),
            })}
            <SurfaceInterval
              value={values.surfaceInterval}
              calculated={
                // A draft's interval is worked out once it uploads.
                dive && !dive.draft && !dive.surfaceIntervalOverride
                  ? dive.surfaceInterval
                  : undefined
              }
              onChange={set("surfaceInterval")}
              error={errors.surfaceInterval}
            />
            {numberRow({
              name: "weight",
              label: "Weight",
              icon: IconWeight,
              unit: "kg",
              mode: "decimal",
            })}
          </Section>

          <Section title="Dive">
            {desk ? (
              <SelectRow
                label="Type"
                value={values.diveType}
                options={options(diveTypes)}
                optional={false}
                onChange={(value) => value && set("diveType")(value)}
              />
            ) : (
              <PickRow
                label="Type"
                value={diveTypes[values.diveType].label}
                onClick={() => setSheet("diveType")}
              />
            )}
            {values.diveType === "training" && (
              // Two rows of the card, so they keep its dividers.
              <Reveal className="divide-y">
                <Row>
                  <Label htmlFor="field-trainingAgency">Training agency</Label>
                  <RowInput
                    id="field-trainingAgency"
                    value={values.trainingAgency}
                    onChange={(event) =>
                      set("trainingAgency")(event.target.value)
                    }
                    placeholder="PADI"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </Row>
                <Row>
                  <Label htmlFor="field-trainingCourse">Course</Label>
                  <RowInput
                    id="field-trainingCourse"
                    value={values.trainingCourse}
                    onChange={(event) =>
                      set("trainingCourse")(event.target.value)
                    }
                    placeholder="Advanced Open Water"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </Row>
              </Reveal>
            )}
            <PickRow
              label="Trip"
              value={trips.find((t) => t.id === values.tripId)?.name}
              onClick={() => setSheet("trip")}
            />
            <Block label="Tags" id="label-tags">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(tags) as Tag[]).map((tag) => (
                  <Toggle
                    key={tag}
                    pressed={values.tags.includes(tag)}
                    onPressedChange={(pressed) =>
                      set("tags")(
                        pressed
                          ? [...values.tags, tag]
                          : values.tags.filter((t) => t !== tag)
                      )
                    }
                    className="relative h-10 cursor-pointer rounded-full bg-muted px-3.5 text-sm font-medium text-foreground transition-[color,background-color,opacity] duration-150 hover:bg-muted hover:text-foreground hover:opacity-80 aria-pressed:bg-primary/10 aria-pressed:text-primary data-pressed:bg-primary/10 data-pressed:text-primary"
                  >
                    {tags[tag].label}
                    <Haptic />
                  </Toggle>
                ))}
              </div>
            </Block>
          </Section>

          <Section title="Cylinder and gas">
            <div className="flex flex-col gap-2 px-4 py-3">
              <Label id="label-cylinder">Cylinder</Label>
              {/* Below 375 px "Aluminium" can't fit beside Volume, so
                  Volume goes under the material. */}
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-end max-[374px]:grid-cols-1 max-[374px]:gap-2">
                <div
                  className="flex flex-col gap-1 pr-3"
                  role="group"
                  aria-labelledby="label-material"
                >
                  <span
                    id="label-material"
                    className="text-xs text-muted-foreground"
                  >
                    Material
                  </span>
                  <Segmented
                    labelledBy="label-material"
                    value={values.cylinderMaterial}
                    onChange={set("cylinderMaterial")}
                    options={[
                      { value: "steel", label: "Steel" },
                      { value: "aluminium", label: "Aluminium" },
                    ]}
                  />
                </div>
                <PairInput
                  id="field-cylinderVolume"
                  label="Volume"
                  unit="L"
                  inputMode="decimal"
                  value={values.cylinderVolume}
                  onChange={(event) =>
                    set("cylinderVolume")(event.target.value)
                  }
                  placeholder="—"
                  className="border-l pl-4 max-[374px]:border-l-0 max-[374px]:pl-0"
                  {...error("cylinderVolume")}
                />
              </div>
              {errorLine("cylinderVolume", true)}
            </div>
            <div className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex min-h-8.5 items-center justify-between">
                <Label htmlFor="field-nitrox">Nitrox</Label>
                <Switch
                  id="field-nitrox"
                  checked={values.nitrox}
                  onCheckedChange={set("nitrox")}
                />
              </div>
              {values.nitrox && (
                <Reveal>
                  <PairInput
                    id="field-oxygen"
                    label="Oxygen"
                    unit="%"
                    inputMode="decimal"
                    value={values.oxygen}
                    onChange={(event) => set("oxygen")(event.target.value)}
                    placeholder="—"
                    {...error("oxygen")}
                  />
                  {errorLine("oxygen", true)}
                </Reveal>
              )}
            </div>
            <div
              className="flex flex-col gap-2 px-4 py-3"
              role="group"
              aria-labelledby="label-pressure"
            >
              <Label id="label-pressure">Pressure</Label>
              <div className="grid grid-cols-2">
                <PairInput
                  id="field-startPressure"
                  label="Start"
                  unit="bar"
                  inputMode="numeric"
                  value={values.startPressure}
                  onChange={(event) => set("startPressure")(event.target.value)}
                  placeholder="—"
                  className="pr-3"
                  {...error("startPressure")}
                />
                <PairInput
                  id="field-endPressure"
                  label="End"
                  unit="bar"
                  inputMode="numeric"
                  value={values.endPressure}
                  onChange={(event) => set("endPressure")(event.target.value)}
                  placeholder="—"
                  className="border-l pl-4"
                  {...error("endPressure")}
                />
              </div>
              {errorLine("startPressure", true)}
              {errorLine("endPressure", true)}
            </div>
            <div className="flex flex-col gap-2 px-4 py-3">
              <Label id="label-calculated">Calculated</Label>
              <dl
                aria-labelledby="label-calculated"
                className="grid grid-cols-3 *:not-first:border-l *:not-first:pl-4 *:not-last:pr-3"
              >
                <Figure
                  term="SAC rate"
                  value={figures.sac?.toFixed(1)}
                  unit="L/min"
                />
                <Figure
                  term="Max PO₂"
                  value={
                    figures.maxPo2 != null ? bar(figures.maxPo2) : undefined
                  }
                  unit="bar"
                  warn={figures.po2Over}
                />
                <Figure
                  term="MOD"
                  value={figures.mod != null ? depth(figures.mod) : undefined}
                  unit="m"
                />
              </dl>
            </div>
          </Section>

          <Section title="Conditions">
            <Block label="Weather" id="label-weather">
              <Segmented
                labelledBy="label-weather"
                value={values.weather}
                onChange={set("weather")}
                options={[
                  { value: "cloudless", label: "Cloudless", icon: IconSun },
                  { value: "cloudy", label: "Cloudy", icon: IconCloud },
                  { value: "rainy", label: "Rainy", icon: IconCloudRain },
                ]}
              />
            </Block>
            <Block label="Surface" id="label-surface">
              <Segmented
                labelledBy="label-surface"
                value={values.surface}
                onChange={set("surface")}
                options={[
                  { value: "calm", label: "Calm", icon: IconSurfaceCalm },
                  { value: "moving", label: "Moving", icon: IconRipple },
                  { value: "stormy", label: "Stormy", icon: IconSurfaceStormy },
                ]}
              />
            </Block>
            <Block label="Visibility" id="label-visibility">
              <Segmented
                labelledBy="label-visibility"
                compact
                value={values.visibility}
                onChange={set("visibility")}
                options={[
                  { value: "metres", label: "Metres", icon: IconRuler },
                  { value: "low", label: "Low", icon: IconLevelLow },
                  {
                    value: "average",
                    label: "Average",
                    icon: IconLevelAverage,
                  },
                  { value: "high", label: "High", icon: IconLevelHigh },
                ]}
              />
              {values.visibility === "metres" && (
                <Reveal>
                  <PairInput
                    id="field-visibilityMetres"
                    label="Distance"
                    unit="m"
                    inputMode="decimal"
                    value={values.visibilityMetres}
                    onChange={(event) =>
                      set("visibilityMetres")(event.target.value)
                    }
                    placeholder="—"
                    {...error("visibilityMetres")}
                  />
                  {errorLine("visibilityMetres", true)}
                </Reveal>
              )}
            </Block>
            <Field
              under={
                <>
                  {difference(
                    "minTemperature",
                    "minimum temperature",
                    `min ${computerText("minTemperature", "°C")}`
                  )}
                  {difference(
                    "maxTemperature",
                    "maximum temperature",
                    `max ${computerText("maxTemperature", "°C")}`
                  )}
                  <ErrorLine
                    id="error-minTemperature"
                    message={errors.minTemperature}
                    align="left"
                  />
                  {errorLine("maxTemperature")}
                </>
              }
            >
              <Block label="Water temperature" id="label-temperature">
                <div className="grid grid-cols-2">
                  <PairInput
                    id="field-minTemperature"
                    label="Min"
                    unit="°C"
                    inputMode="decimal"
                    value={values.minTemperature}
                    onChange={(event) =>
                      set("minTemperature")(event.target.value)
                    }
                    placeholder="—"
                    className="pr-3"
                    after={source("minTemperature")}
                    {...error("minTemperature")}
                  />
                  <PairInput
                    id="field-maxTemperature"
                    label="Max"
                    unit="°C"
                    inputMode="decimal"
                    value={values.maxTemperature}
                    onChange={(event) =>
                      set("maxTemperature")(event.target.value)
                    }
                    placeholder="—"
                    className="border-l pl-4"
                    after={source("maxTemperature")}
                    {...error("maxTemperature")}
                  />
                </div>
              </Block>
            </Field>
            {(Object.keys(choiceSheets) as (keyof typeof choiceSheets)[]).map(
              (name) => {
                const choice = choiceSheets[name]
                const value = values[name]
                const label = choice.options.find(
                  (o) => o.value === value
                )?.label
                return desk ? (
                  <SelectRow
                    key={name}
                    icon={choice.icon}
                    label={choice.title}
                    value={value}
                    options={choice.options as Option<string>[]}
                    onChange={(next) => set(name)(next as never)}
                  />
                ) : (
                  <PickRow
                    key={name}
                    icon={choice.icon}
                    label={choice.title}
                    value={label}
                    onClick={() => setSheet(name)}
                  />
                )
              }
            )}
          </Section>

          <Section title="People">
            <PickRow
              icon={IconUsers}
              label="Buddies"
              {...namesValue(values.buddies)}
              onClick={() => setSheet("buddies")}
            />
            <PickRow
              icon={IconUserStar}
              label="Dive professionals"
              {...namesValue(values.diveProfessionals)}
              onClick={() => setSheet("diveProfessionals")}
            />
            <PickRow
              icon={IconBuildingStore}
              label="Dive centre"
              value={values.diveCentreId ? nameOf(values.diveCentreId) : null}
              onClick={() => setSheet("diveCentre")}
            />
          </Section>

          <Section title="Notes">
            <NoteField
              name="notableAnimals"
              label="Notable animals"
              icon={IconFish}
              placeholder="What did you see?"
              value={values.notableAnimals}
              onChange={set("notableAnimals")}
            />
            <NoteField
              name="gearDetails"
              label="Gear"
              icon={IconScubaDivingTank}
              placeholder="Any problems with your gear?"
              value={values.gearDetails}
              onChange={set("gearDetails")}
              rows={2}
            />
            <NoteField
              name="notes"
              label="General"
              icon={IconNotes}
              placeholder="Anything else"
              value={values.notes}
              onChange={set("notes")}
              rows={4}
            />
          </Section>

          <Card className="py-0">
            <div className="flex items-center gap-4 px-4 py-3">
              <label
                htmlFor="field-ignored"
                className="flex flex-1 flex-col gap-0.5"
              >
                <span className="text-base font-medium">Ignore this dive</span>
                <span className="text-[13px] text-muted-foreground">
                  It gets no number and is left out of totals and statistics
                </span>
              </label>
              <Switch
                id="field-ignored"
                checked={values.ignored}
                onCheckedChange={set("ignored")}
              />
            </div>
          </Card>
        </form>

        {desk && (
          <LeaveGuard
            when={() => !leaving.current && typed()}
            onBlock={setLeave}
          />
        )}
        <Drawer
          open={confirming || leave != null}
          onOpenChange={(open) => !open && keep()}
        >
          {desk ? (
            // A desktop dialog asks as shadcn's alert dialogs do.
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Discard changes?</DrawerTitle>
                <DrawerDescription>{discardNote}</DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <Button variant="outline" onClick={keep}>
                  Keep editing
                </Button>
                <Button variant="destructive" onClick={discard}>
                  Discard changes
                </Button>
              </DrawerFooter>
            </DrawerContent>
          ) : (
            <DrawerContent>
              <DrawerTitle className="sr-only">Discard changes?</DrawerTitle>
              <div className="flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="pb-1 text-center text-[13px] text-muted-foreground">
                  {discardNote}
                </p>
                <Button
                  variant="outline"
                  className="h-12 rounded-[14px] text-base font-semibold text-destructive"
                  onClick={discard}
                >
                  Discard changes
                </Button>
                <Button
                  variant="outline"
                  className="h-12 rounded-[14px] text-base font-semibold"
                  onClick={keep}
                >
                  Keep editing
                </Button>
              </div>
            </DrawerContent>
          )}
        </Drawer>
        <SiteSheet
          open={sheet === "site"}
          onOpenChange={(next) => setSheet(next ? "site" : null)}
          sites={siteRows}
          regions={regionRows}
          defaultCountry={defaultCountry}
          value={values.siteId}
          onChange={set("siteId")}
          onCreate={(entities) =>
            update({ created: [...values.created, ...entities] })
          }
        />
        <NamesSheet
          open={sheet === "trip"}
          onOpenChange={(next) => setSheet(next ? "trip" : null)}
          title="Trip"
          kind="trip"
          multiple={false}
          candidates={trips}
          selected={values.tripId ? [values.tripId] : []}
          onChange={(ids) => set("tripId")(ids[0] ?? null)}
          onCreate={(name) => {
            const id = newId("trip")
            create({ kind: "trip", id, fields: { name } })
            return id
          }}
        />
        {(["buddies", "diveProfessionals"] as const).map((role) => (
          <NamesSheet
            key={role}
            open={sheet === role}
            onOpenChange={(next) => setSheet(next ? role : null)}
            title={role === "buddies" ? "Buddies" : "Dive professionals"}
            kind="person"
            multiple
            candidates={candidates(
              role === "buddies" ? "buddies" : "professionals"
            )}
            selected={values[role]}
            elsewhere={
              role === "buddies"
                ? { ids: values.diveProfessionals, role: "a dive professional" }
                : { ids: values.buddies, role: "a buddy" }
            }
            onChange={set(role)}
            onCreate={(name) => {
              const id = newId("person")
              create({ kind: "person", id, fields: { name } })
              return id
            }}
          />
        ))}
        <NamesSheet
          open={sheet === "diveCentre"}
          onOpenChange={(next) => setSheet(next ? "diveCentre" : null)}
          title="Dive centre"
          kind="diveCentre"
          multiple={false}
          candidates={centres}
          selected={values.diveCentreId ? [values.diveCentreId] : []}
          onChange={(ids) => set("diveCentreId")(ids[0] ?? null)}
          onCreate={(name) => {
            const id = newId("diveCentre")
            create({ kind: "diveCentre", id, fields: { name } })
            return id
          }}
        />
        <OptionSheet
          open={sheet === "diveType"}
          onOpenChange={(next) => setSheet(next ? "diveType" : null)}
          title="Type"
          options={options(diveTypes)}
          value={values.diveType}
          optional={false}
          onChange={(value) => value && set("diveType")(value)}
        />
        {(Object.keys(choiceSheets) as (keyof typeof choiceSheets)[]).map(
          (name) => (
            <OptionSheet
              key={name}
              open={sheet === name}
              onOpenChange={(next) => setSheet(next ? name : null)}
              title={choiceSheets[name].title}
              options={choiceSheets[name].options as Option<string>[]}
              value={values[name]}
              onChange={(value) => set(name)(value as never)}
            />
          )
        )}
      </div>
    </FormShown.Provider>
  )
}

function Figure({
  term,
  value,
  unit,
  warn,
}: {
  term: string
  value: string | undefined
  unit: string
  warn?: boolean
}) {
  return (
    <div className="flex flex-col-reverse gap-px py-0.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd
        className={cn(
          "text-base font-semibold tracking-[-0.01em] whitespace-nowrap tabular-nums",
          warn && "text-destructive"
        )}
      >
        {value ?? "—"}
        {value != null && (
          <span className="ml-0.5 text-xs font-medium tracking-normal text-muted-foreground">
            {unit}
          </span>
        )}
        {warn && <span className="sr-only"> (over the limit)</span>}
      </dd>
    </div>
  )
}

function NoteField({
  name,
  label,
  icon,
  placeholder,
  value,
  onChange,
  rows = 3,
}: {
  name: FieldName
  label: string
  icon: Icon
  placeholder: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <Label icon={icon} htmlFor={`field-${name}`}>
        <span className="text-xs">{label}</span>
      </Label>
      <Textarea
        id={`field-${name}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        // Core's text limit, so a long note can't fail only at save.
        maxLength={10_000}
        autoCapitalize="sentences"
        className="min-h-0 resize-none rounded-none border-0 bg-transparent p-0 text-base leading-[1.45] shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 dark:bg-transparent"
      />
    </div>
  )
}

// The surface interval: the calculated figure with its marker, or the
// figure or No previous dive picked in its sheet, where Calculated puts the
// worked-out figure back (D29).
function SurfaceInterval({
  value,
  calculated,
  onChange,
  error,
}: {
  value: FormValues["surfaceInterval"]
  // The server's figure when not overridden: seconds or "none".
  calculated: number | "none" | undefined
  onChange: (value: FormValues["surfaceInterval"]) => void
  error?: string
}) {
  const [open, setOpen] = useState(false)
  const choice: IntervalChoice =
    value == null || value === "none"
      ? value
      : {
          minutes:
            (Number(value.hours) || 0) * 60 + (Number(value.minutes) || 0),
        }
  const shown =
    choice === "none"
      ? "No previous dive"
      : choice
        ? interval(choice.minutes * 60)
        : calculated === undefined
          ? null
          : calculated === "none"
            ? "No previous dive"
            : interval(calculated)
  return (
    <Field under={<ErrorLine id="error-surfaceInterval" message={error} />}>
      <Row className={pressedRow}>
        <Label
          icon={IconClockPause}
          after={
            value == null &&
            calculated !== undefined && (
              <Marker source="calculated" computer="" />
            )
          }
        >
          Surface interval
        </Label>
        <button
          type="button"
          id="field-surfaceInterval"
          onClick={() => setOpen(true)}
          aria-label={`Surface interval, ${shown ?? "calculated when saved"}`}
          aria-describedby={error ? "error-surfaceInterval" : undefined}
          aria-invalid={!!error || undefined}
          className="flex h-11.5 min-w-0 flex-1 items-center justify-end gap-1 text-right text-base font-medium tabular-nums"
        >
          <span
            className={cn("truncate", !shown && "text-muted-foreground/60")}
          >
            {shown ?? "—"}
          </span>
          <IconChevronRight
            aria-hidden
            className="size-4.5 shrink-0 text-muted-foreground/60"
          />
        </button>
      </Row>
      <IntervalSheet
        open={open}
        onOpenChange={setOpen}
        value={choice}
        calculated={calculated}
        onChange={(next) =>
          onChange(
            next == null || next === "none"
              ? next
              : intervalParts(next.minutes * 60)
          )
        }
      />
    </Field>
  )
}

interface Leave {
  proceed: () => void
  reset: () => void
}

// On a desktop the sidebar and Back stay in reach, where a phone's form
// covers its tabs, so leaving with something typed asks first, as Cancel
// does. Mounted only there, as it needs the router.
function LeaveGuard({
  when,
  onBlock,
}: {
  when: () => boolean
  onBlock: (leave: Leave | null) => void
}) {
  // One blocker for the form's life, asking the latest `when`, rather than
  // a new one each keystroke as `when` changes.
  const latest = useRef(when)
  useEffect(() => {
    latest.current = when
  })
  const shouldBlockFn = useCallback(() => latest.current(), [])
  const blocker = useBlocker({
    shouldBlockFn,
    enableBeforeUnload: false,
    withResolver: true,
  })
  const { status, proceed, reset } = blocker
  useEffect(() => {
    onBlock(status === "blocked" ? { proceed, reset } : null)
  }, [status, proceed, reset, onBlock])
  return null
}
