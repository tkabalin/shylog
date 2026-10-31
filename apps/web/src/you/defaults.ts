import {
  litresToMillilitres,
  parseDecimal,
  percentToTenths,
  settingsFields,
  type CylinderMaterial,
  type DiveType,
  type Settings,
} from "@shylog/core"

// The Defaults section as typed: the new-dive defaults in the dive form's
// own controls.
export interface DefaultsValues {
  cylinderMaterial: CylinderMaterial | null
  cylinderVolume: string
  startPressure: string
  nitrox: boolean
  oxygen: string
  weight: string
  diveType: DiveType | null
}

export type DefaultsErrors = Partial<Record<keyof DefaultsValues, string>>

// As stored, unlike the form's one decimal: the defaults are saved again as
// a whole, so a rounded 11.15 L would come back as 11.2.
const exact = (value: number | null | undefined) =>
  value == null ? "" : String(value)

export function defaultsValues(settings: Settings): DefaultsValues {
  const defaults = settings.newDiveDefaults
  return {
    cylinderMaterial: defaults.cylinderMaterial ?? null,
    cylinderVolume: exact(
      defaults.cylinderVolume != null ? defaults.cylinderVolume / 1000 : null
    ),
    startPressure: exact(defaults.startPressure),
    nitrox: defaults.nitrox ?? false,
    oxygen: exact(defaults.oxygen != null ? defaults.oxygen / 10 : null),
    weight: exact(defaults.weight),
    diveType: (defaults.diveType as DiveType | undefined) ?? null,
  }
}

// The request for `PUT /api/settings`, or the problem under each field. An
// empty field is no default. The schema's own limits apply, as they do to
// a dive (Limits under v1 fields).
export function parseDefaults(values: DefaultsValues): {
  errors: DefaultsErrors
  request?: Pick<Settings, "newDiveDefaults">
} {
  const errors: DefaultsErrors = {}
  const number = (name: keyof DefaultsValues) => {
    const text = (values[name] as string).trim()
    if (!text) return undefined
    const value = parseDecimal(text)
    if (value == null) errors[name] = "Not a number"
    return value ?? undefined
  }

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
  }
  const parsed = settingsFields.newDiveDefaults.safeParse(defaults)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof DefaultsValues
      if (field === "oxygen") errors.oxygen ??= "Between 21.1 and 100"
      else if (field === "cylinderVolume")
        errors.cylinderVolume ??=
          volume !== undefined && volume > 0 ? issue.message : "Must be above 0"
      else if (field in values)
        errors[field] ??=
          issue.code === "too_small" ? "Can't be negative" : issue.message
    }
  }
  if (Object.keys(errors).length || !parsed.success) return { errors }
  return { errors, request: { newDiveDefaults: parsed.data } }
}

// The Preferences section's maximum PO₂ as a number, or the problem under
// it.
export function parseMaxPo2(text: string): { error?: string; value?: number } {
  if (!text.trim()) return { error: "Required" }
  const value = parseDecimal(text.trim())
  if (value == null) return { error: "Not a number" }
  if (!settingsFields.maxPo2.safeParse(value).success)
    return { error: "From 1.0 to 2.0 bar, in steps of 0.1" }
  return { value }
}
