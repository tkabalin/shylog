import {
  litresToMillilitres,
  parseDecimal,
  percentToTenths,
  settingsFields,
  type CylinderMaterial,
  type DiveType,
  type Settings,
} from "@shylog/core"

type Defaults = Settings["newDiveDefaults"]

// The Diving section as typed: the new-dive defaults in the dive form's
// own controls, and the maximum PO₂ above them.
export interface DivingValues {
  maxPo2: string
  cylinderMaterial: CylinderMaterial | null
  cylinderVolume: string
  startPressure: string
  nitrox: boolean
  oxygen: string
  weight: string
  diveType: DiveType | null
  visibilityMode: Defaults["visibilityMode"]
}

export type DivingErrors = Partial<Record<keyof DivingValues, string>>

// As stored, unlike the form's one decimal: the defaults are saved again as
// a whole, so a rounded 11.15 L would come back as 11.2.
const exact = (value: number | null | undefined) =>
  value == null ? "" : String(value)

export function divingValues(settings: Settings): DivingValues {
  const defaults = settings.newDiveDefaults
  return {
    maxPo2: settings.maxPo2.toFixed(1),
    cylinderMaterial: defaults.cylinderMaterial ?? null,
    cylinderVolume: exact(
      defaults.cylinderVolume != null ? defaults.cylinderVolume / 1000 : null
    ),
    startPressure: exact(defaults.startPressure),
    nitrox: defaults.nitrox ?? false,
    oxygen: exact(defaults.oxygen != null ? defaults.oxygen / 10 : null),
    weight: exact(defaults.weight),
    diveType: (defaults.diveType as DiveType | undefined) ?? null,
    visibilityMode: defaults.visibilityMode,
  }
}

// The request for `PUT /api/settings`, or the problem under each field. An
// empty field is no default. The schema's own limits apply, as they do to
// a dive (Limits under v1 fields).
export function parseDiving(values: DivingValues): {
  errors: DivingErrors
  request?: Pick<Settings, "maxPo2" | "newDiveDefaults">
} {
  const errors: DivingErrors = {}
  const number = (name: keyof DivingValues) => {
    const text = (values[name] as string).trim()
    if (!text) return undefined
    const value = parseDecimal(text)
    if (value == null) errors[name] = "Not a number"
    return value ?? undefined
  }

  const maxPo2 = number("maxPo2")
  if (maxPo2 === undefined && !errors.maxPo2) errors.maxPo2 = "Required"
  else if (
    maxPo2 !== undefined &&
    !settingsFields.maxPo2.safeParse(maxPo2).success
  )
    errors.maxPo2 = "From 1.0 to 2.0 bar, in steps of 0.1"

  const volume = number("cylinderVolume")
  const oxygen = values.nitrox ? number("oxygen") : undefined
  if (values.nitrox && oxygen === undefined && !errors.oxygen)
    errors.oxygen = "Required for nitrox"
  const defaults = {
    cylinderMaterial: values.cylinderMaterial ?? undefined,
    cylinderVolume:
      volume !== undefined ? litresToMillilitres(volume) : undefined,
    startPressure: number("startPressure"),
    nitrox: values.nitrox,
    oxygen: oxygen !== undefined ? percentToTenths(oxygen) : undefined,
    weight: number("weight"),
    diveType: values.diveType ?? undefined,
    visibilityMode: values.visibilityMode,
  }
  const parsed = settingsFields.newDiveDefaults.safeParse(defaults)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof DivingValues
      if (field === "oxygen") errors.oxygen ??= "Between 21.1 and 100"
      else if (field === "cylinderVolume")
        errors.cylinderVolume ??=
          volume !== undefined && volume > 0 ? issue.message : "Must be above 0"
      else if (field in values)
        errors[field] ??=
          issue.code === "too_small" ? "Can't be negative" : issue.message
    }
  }
  if (Object.keys(errors).length || !parsed.success || maxPo2 === undefined)
    return { errors }
  return { errors, request: { maxPo2, newDiveDefaults: parsed.data } }
}
