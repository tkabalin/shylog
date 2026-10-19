import { z } from "zod"

import {
  defaultedDiveFields,
  nitroxOxygen,
  optionalDiveFields,
} from "./dive.ts"

// Filled into every new dive as hand values, in the dive form's own shapes.
// As on a dive, oxygen is saved only with nitrox, which must have it.
const newDiveDefaults = nitroxOxygen(
  z.strictObject({
    cylinderMaterial: optionalDiveFields.cylinderMaterial.optional(),
    cylinderVolume: optionalDiveFields.cylinderVolume.optional(),
    startPressure: optionalDiveFields.startPressure.optional(),
    nitrox: defaultedDiveFields.nitrox.optional(),
    oxygen: optionalDiveFields.oxygen.optional(),
    weight: optionalDiveFields.weight.optional(),
    diveType: defaultedDiveFields.diveType.optional(),
    visibilityMode: z.enum(["metres", "rating"]),
  })
)

export const settingsFields = {
  diverName: z.string().trim().max(120),
  // Bar, in the 0.1 bar steps dive computers offer. It should match the
  // computer's own setting so Shylog agrees with the computer's alarm.
  maxPo2: z.number().min(1).max(2).multipleOf(0.1),
  newDiveDefaults,
}

export const settingsSchema = z.strictObject({
  diverName: settingsFields.diverName.default(""),
  maxPo2: settingsFields.maxPo2.default(1.4),
  newDiveDefaults: newDiveDefaults.prefault({ visibilityMode: "metres" }),
})
export type Settings = z.output<typeof settingsSchema>

export const defaultSettings: Settings = settingsSchema.parse({})
