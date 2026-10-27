import {
  comparedFields,
  diveFieldsSchema,
  litresToMillilitres,
  minutesToSeconds,
  parseDecimal,
  parseWhole,
  percentToTenths,
  type ComparedField,
  type Current,
  type CylinderMaterial,
  type DiveType,
  type Entry,
  type Surface,
  type Surge,
  type Tag,
  type ThermalComfort,
  type VisibilityRating,
  type Weather,
  type Workload,
} from "@shylog/core"

import type { Dive, FieldMeta, Settings } from "@/data/db"
import type { DraftFields, NewEntity } from "@/data/drafts"
import type { LogView } from "@/data/log"

// An entity the form creates, sent with the dive: in a draft's ops, or by
// `PUT /api/entities` before an edit's `PATCH`.
export type { DraftFields, NewEntity }

// What the form holds while it is open: text exactly as typed, so a half
// typed "32," survives a re-render, and choices as core's keys. Converted to
// database units only by `toFields`.
export interface FormValues {
  date: string
  // Empty on a new dive until tapped (see Add or edit in the spec).
  time: string
  siteId: string | null
  duration: string
  maxDepth: string
  averageDepth: string
  // Null keeps the calculated interval; anything else overrides it.
  surfaceInterval: null | "none" | { hours: string; minutes: string }
  weight: string
  diveType: DiveType
  trainingAgency: string
  trainingCourse: string
  tripId: string | null
  tags: Tag[]
  cylinderMaterial: CylinderMaterial | null
  cylinderVolume: string
  nitrox: boolean
  oxygen: string
  startPressure: string
  endPressure: string
  weather: Weather | null
  surface: Surface | null
  // The segmented control: metres with a distance, or a rough rating.
  visibility: "metres" | VisibilityRating | null
  visibilityMetres: string
  minTemperature: string
  maxTemperature: string
  entry: Entry | null
  current: Current | null
  surge: Surge | null
  workload: Workload | null
  thermalComfort: ThermalComfort | null
  buddies: string[]
  diveProfessionals: string[]
  diveCentreId: string | null
  notableAnimals: string
  gearDetails: string
  notes: string
  ignored: boolean
  // Computer values taken (✓) or declined (✕) on this visit.
  adopt: ComparedField[]
  dismiss: ComparedField[]
  created: NewEntity[]
}

export type FieldName = keyof FormValues

// Numbers as the form shows them: to one decimal, as the detail does, and
// without trailing zeros. A stored value and its shown form convert back
// alike, so an untouched field never counts as changed.
const shown = (value: number | null | undefined) => {
  if (value == null) return ""
  const rounded = Math.round(value * 10) / 10
  // A value too small for one decimal keeps its own, so it isn't shown as 0.
  return String(rounded === 0 && value !== 0 ? value : rounded)
}

// An interval as the form's hours and minutes boxes. Rounded to the minute
// first, so 1:59:40 reads 2 h 0 min rather than 1 h 60 min.
export function intervalParts(seconds: number) {
  const minutes = Math.round(seconds / 60)
  return {
    hours: String(Math.floor(minutes / 60)),
    minutes: String(minutes % 60),
  }
}

export function emptyValues(date: string): FormValues {
  return {
    date,
    time: "",
    siteId: null,
    duration: "",
    maxDepth: "",
    averageDepth: "",
    surfaceInterval: null,
    weight: "",
    diveType: "recreation",
    trainingAgency: "",
    trainingCourse: "",
    tripId: null,
    tags: [],
    cylinderMaterial: null,
    cylinderVolume: "",
    nitrox: false,
    oxygen: "",
    startPressure: "",
    endPressure: "",
    weather: null,
    surface: null,
    visibility: null,
    visibilityMetres: "",
    minTemperature: "",
    maxTemperature: "",
    entry: null,
    current: null,
    surge: null,
    workload: null,
    thermalComfort: null,
    buddies: [],
    diveProfessionals: [],
    diveCentreId: null,
    notableAnimals: "",
    gearDetails: "",
    notes: "",
    ignored: false,
    adopt: [],
    dismiss: [],
    created: [],
  }
}

// A local date for today: the phone's calendar day, which is the dive's
// local day when it is logged on site.
export function today(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// A new dive: blank apart from today's date and the new-dive defaults,
// which count as typed values. Never ignored, whatever the defaults.
export function newDiveValues(settings: Settings, date = today()): FormValues {
  const defaults = settings.newDiveDefaults
  return {
    ...emptyValues(date),
    diveType: defaults.diveType ?? "recreation",
    cylinderMaterial: defaults.cylinderMaterial ?? null,
    cylinderVolume: shown(
      defaults.cylinderVolume != null ? defaults.cylinderVolume / 1000 : null
    ),
    startPressure: shown(defaults.startPressure),
    nitrox: defaults.nitrox ?? false,
    oxygen: shown(defaults.oxygen != null ? defaults.oxygen / 10 : null),
    weight: shown(defaults.weight),
    visibility: defaults.visibilityMode === "metres" ? "metres" : null,
  }
}

// A saved dive (or a draft) as the form shows it.
export function fromDive(dive: Dive, log: LogView): FormValues {
  const links = log.links.get(dive.id)
  return {
    ...emptyValues(dive.startTime.slice(0, 10)),
    time: dive.startTime.slice(11, 16),
    siteId: dive.siteId,
    // At least a minute, so a dive of seconds never reads as 0 and fails
    // the check on a field the diver didn't touch.
    duration: String(Math.max(1, Math.round(dive.duration / 60))),
    maxDepth: shown(dive.maxDepth),
    averageDepth: shown(dive.averageDepth),
    surfaceInterval: !dive.surfaceIntervalOverride
      ? null
      : dive.surfaceInterval === "none"
        ? "none"
        : intervalParts(dive.surfaceInterval),
    weight: shown(dive.weight),
    diveType: dive.diveType as DiveType,
    trainingAgency: dive.trainingAgency ?? "",
    trainingCourse: dive.trainingCourse ?? "",
    tripId: dive.tripId,
    tags: (links?.tags ?? []) as Tag[],
    cylinderMaterial: dive.cylinderMaterial as CylinderMaterial | null,
    cylinderVolume: shown(
      dive.cylinderVolume != null ? dive.cylinderVolume / 1000 : null
    ),
    nitrox: dive.nitrox,
    oxygen: shown(dive.oxygen != null ? dive.oxygen / 10 : null),
    startPressure: shown(dive.startPressure),
    endPressure: shown(dive.endPressure),
    weather: dive.weather as Weather | null,
    surface: dive.surface as Surface | null,
    visibility:
      dive.visibility != null
        ? "metres"
        : (dive.visibilityRating as VisibilityRating | null),
    visibilityMetres: shown(dive.visibility),
    minTemperature: shown(dive.minTemperature),
    maxTemperature: shown(dive.maxTemperature),
    entry: dive.entry as Entry | null,
    current: dive.current as Current | null,
    surge: dive.surge as Surge | null,
    workload: dive.workload as Workload | null,
    thermalComfort: dive.thermalComfort as ThermalComfort | null,
    buddies: links?.buddies ?? [],
    diveProfessionals: links?.professionals ?? [],
    diveCentreId: dive.diveCentreId,
    notableAnimals: dive.notableAnimals ?? "",
    gearDetails: dive.gearDetails ?? "",
    notes: dive.notes ?? "",
    ignored: dive.ignored,
  }
}

// Copy from last dive: the setting and kit of the last dive, leaving the
// number, date and time, depths, duration, pressures, temperatures, animals
// and notes to fill (see Add or edit in the spec). Never Ignore.
export function copyFromDive(
  values: FormValues,
  last: Dive,
  log: LogView
): FormValues {
  const from = fromDive(last, log)
  return {
    ...values,
    siteId: from.siteId,
    tripId: from.tripId,
    buddies: from.buddies,
    diveProfessionals: from.diveProfessionals,
    diveCentreId: from.diveCentreId,
    entry: from.entry,
    weight: from.weight,
    cylinderMaterial: from.cylinderMaterial,
    cylinderVolume: from.cylinderVolume,
    nitrox: from.nitrox,
    oxygen: from.oxygen,
    gearDetails: from.gearDetails,
    current: from.current,
    surge: from.surge,
    surface: from.surface,
    weather: from.weather,
    visibility: from.visibility,
    visibilityMetres: from.visibilityMetres,
    tags: from.tags,
  }
}

export type Errors = Partial<Record<FieldName, string>>

// The form field each schema field is typed in, where the names differ.
const schemaField: Record<string, FieldName> = {
  startTime: "time",
  siteId: "siteId",
  duration: "duration",
  maxDepth: "maxDepth",
  averageDepth: "averageDepth",
  surfaceInterval: "surfaceInterval",
  weight: "weight",
  cylinderVolume: "cylinderVolume",
  oxygen: "oxygen",
  startPressure: "startPressure",
  endPressure: "endPressure",
  visibility: "visibilityMetres",
  minTemperature: "minTemperature",
  maxTemperature: "maxTemperature",
  notableAnimals: "notableAnimals",
  gearDetails: "gearDetails",
  notes: "notes",
  trainingAgency: "trainingAgency",
  trainingCourse: "trainingCourse",
}

const required = "Required"

// The form's values in database units, as core's dive schema takes them,
// with a message for each field that can't be saved as it is.
export function toFields(values: FormValues): {
  fields: DraftFields
  errors: Errors
} {
  const errors: Errors = {}
  const fields: Record<string, unknown> = {
    diveType: values.diveType,
    nitrox: values.nitrox,
    ignored: values.ignored,
  }

  const decimal = (
    name: FieldName,
    { positive = false, min }: { positive?: boolean; min?: number } = {}
  ) => {
    const text = values[name] as string
    if (!text.trim()) return null
    const value = parseDecimal(text)
    if (value == null) errors[name] = "Not a number"
    else if (positive && value <= 0) errors[name] = "Must be above 0"
    else if (min != null && value < min) errors[name] = "Can't be negative"
    else return value
    return null
  }
  const whole = (name: FieldName) => {
    const text = values[name] as string
    if (!text.trim()) return null
    const value = parseWhole(text)
    if (value == null) errors[name] = "Whole numbers only"
    return value
  }

  // In the form's order, so a save scrolls to the first one on screen.
  if (!values.siteId) errors.siteId = "Choose a site"
  else fields.siteId = values.siteId
  if (!values.time) errors.time = required
  else fields.startTime = `${values.date}T${values.time}:00`

  const duration = whole("duration")
  if (duration === 0) errors.duration = "Must be above 0"
  else if (duration != null) fields.duration = minutesToSeconds(duration)
  else if (!errors.duration) errors.duration = required

  const maxDepth = decimal("maxDepth", { positive: true })
  if (maxDepth != null) fields.maxDepth = maxDepth
  else if (!errors.maxDepth) errors.maxDepth = required

  const averageDepth = decimal("averageDepth", { positive: true })
  if (averageDepth != null) {
    if (maxDepth != null && averageDepth > maxDepth)
      errors.averageDepth = "Deeper than the max depth"
    fields.averageDepth = averageDepth
  }

  const interval = values.surfaceInterval
  if (interval === "none") fields.surfaceInterval = "none"
  else if (interval) {
    const hours = interval.hours.trim() ? parseWhole(interval.hours) : 0
    const minutes = interval.minutes.trim() ? parseWhole(interval.minutes) : 0
    if (hours == null || minutes == null)
      errors.surfaceInterval = "Whole numbers only"
    else if (!interval.hours.trim() && !interval.minutes.trim())
      errors.surfaceInterval = "Enter hours or minutes"
    else fields.surfaceInterval = hours * 3600 + minutes * 60
  }

  const weight = decimal("weight", { min: 0 })
  if (weight != null) fields.weight = weight

  if (values.diveType === "training") {
    fields.trainingAgency = values.trainingAgency
    fields.trainingCourse = values.trainingCourse
  }
  if (values.tripId) fields.tripId = values.tripId
  if (values.tags.length) fields.tags = values.tags

  if (values.cylinderMaterial) fields.cylinderMaterial = values.cylinderMaterial
  // Checked once rounded to the stored unit, as the schema checks it, so
  // 0.0001 L or 21.04 % can't pass here and fail as the draft is queued.
  const volume = decimal("cylinderVolume", { positive: true })
  if (volume != null) {
    if (litresToMillilitres(volume) <= 0) errors.cylinderVolume = "Too small"
    else fields.cylinderVolume = litresToMillilitres(volume)
  }

  if (values.nitrox) {
    const oxygen = decimal("oxygen")
    const tenths = oxygen == null ? null : percentToTenths(oxygen)
    if (tenths != null && (tenths <= 210 || tenths > 1000))
      errors.oxygen = "Between 21.1 and 100"
    else if (tenths != null) fields.oxygen = tenths
    else if (!errors.oxygen) errors.oxygen = "Required for nitrox"
  }

  // Bar, as the spec stores it: a computer or import may give a fraction.
  const start = decimal("startPressure", { min: 0 })
  if (start != null) fields.startPressure = start
  const end = decimal("endPressure", { min: 0 })
  if (end != null) fields.endPressure = end

  if (values.weather) fields.weather = values.weather
  if (values.surface) fields.surface = values.surface
  if (values.visibility === "metres") {
    const metres = decimal("visibilityMetres", { min: 0 })
    if (metres != null) fields.visibility = metres
  } else if (values.visibility) {
    fields.visibilityRating = values.visibility
  }

  const min = decimal("minTemperature")
  const max = decimal("maxTemperature")
  if (min != null) fields.minTemperature = min
  if (max != null) fields.maxTemperature = max
  if (min != null && max != null && min > max)
    errors.minTemperature = "Above the maximum"

  for (const name of [
    "entry",
    "current",
    "surge",
    "workload",
    "thermalComfort",
  ] as const) {
    if (values[name]) fields[name] = values[name]
  }
  if (values.buddies.length) fields.buddies = values.buddies
  if (values.diveProfessionals.length)
    fields.diveProfessionals = values.diveProfessionals
  if (values.diveCentreId) fields.diveCentreId = values.diveCentreId
  for (const name of ["notableAnimals", "gearDetails", "notes"] as const) {
    if (values[name].trim()) fields[name] = values[name]
  }
  // The limits and cross-field rules live in core's schema, which the server
  // applies too: its message goes under any field the checks above passed.
  const checked = diveFieldsSchema.safeParse(fields)
  for (const issue of checked.success ? [] : checked.error.issues) {
    const name = schemaField[String(issue.path[0])]
    if (name && !errors[name]) errors[name] = issue.message
  }
  return { fields: fields as DraftFields, errors }
}

// The entities the dive still refers to: a name added in a picker and then
// removed again, or a site replaced by another, is not created.
export function usedEntities(values: FormValues, entities: NewEntity[]) {
  const ids = new Set<string | null>([
    values.siteId,
    values.tripId,
    values.diveCentreId,
    ...values.buddies,
    ...values.diveProfessionals,
  ])
  const regions = new Set(
    entities.map((e) =>
      e.kind === "site" && ids.has(e.id) ? e.fields.regionId : undefined
    )
  )
  return entities.filter((e) =>
    e.kind === "region" ? regions.has(e.id) : ids.has(e.id)
  )
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// The fields an edit sends: only what changed, with null clearing an
// optional field, and adopted or dismissed fields left to `adopt` and
// `dismiss` (a field is either typed, adopted or dismissed).
export function changedFields(before: FormValues, after: FormValues) {
  const was = toFields(before).fields as Record<string, unknown>
  const now = toFields(after).fields as Record<string, unknown>
  const answered = new Set<string>([...after.adopt, ...after.dismiss])
  const patch: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
    if (answered.has(key) || same(was[key], now[key])) continue
    patch[key] = now[key] ?? null
  }
  return patch
}

// Where the form's text for a compared field comes from, so a computer
// value can be typed back in by ✓ or Reset.
export function comparedText(field: ComparedField, value: string | number) {
  if (field === "startTime") return String(value).slice(11, 16)
  if (field === "duration") return String(Math.round(Number(value) / 60))
  return shown(Number(value))
}

// A hand value the computer disagrees with and the diver hasn't answered:
// what the detail's banner counts and the form offers ✓ and ✕ for. A hand
// value that has come to match keeps its record, but isn't a difference.
export function differences(
  dive: Dive,
  meta: Map<string, FieldMeta> | undefined
) {
  return comparedFields.filter((field) => {
    const row = meta?.get(field)
    return (
      row?.source === "hand" &&
      row.computerValue != null &&
      !row.dismissed &&
      // As the form shows them: a hand 32.7 against the computer's 32.66
      // reads the same, so it isn't offered as a difference.
      (field === "startTime"
        ? String(row.computerValue).slice(0, 16) !== dive.startTime.slice(0, 16)
        : comparedText(field, row.computerValue) !==
          comparedText(field, dive[field] as number))
    )
  })
}

// "Suunto D4i" → "D4i": screens name the computer by its model (see For a
// matched dive), or "dive computer" when the export gives none.
export const computerName = (model: string | null) =>
  model ? model.replace(/^Suunto\s+/i, "") : "dive computer"
