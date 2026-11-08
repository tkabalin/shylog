import { z } from "zod"

import { dropUnwritable } from "./common.ts"
import { defaultedDiveFields, optionalDiveFields } from "./dive.ts"

// Filled into every new dive as hand values, in the dive form's own shapes.
// Kit only: a gas or start pressure would record a reading nobody took, so
// a new dive starts on air with its start pressure empty.
const newDiveDefaults = z.strictObject({
  cylinderMaterial: optionalDiveFields.cylinderMaterial.optional(),
  cylinderVolume: optionalDiveFields.cylinderVolume.optional(),
  weight: optionalDiveFields.weight.optional(),
  diveType: defaultedDiveFields.diveType.optional(),
})

export const settingsFields = {
  diverName: z.string().overwrite(dropUnwritable).trim().max(120),
  // Bar, in the 0.1 bar steps dive computers offer. It should match the
  // computer's own setting so Shylog agrees with the computer's alarm.
  maxPo2: z.number().min(1).max(2).multipleOf(0.1),
  newDiveDefaults,
}

export const settingsSchema = z.strictObject({
  diverName: settingsFields.diverName.default(""),
  maxPo2: settingsFields.maxPo2.default(1.4),
  newDiveDefaults: newDiveDefaults.prefault({}),
})
export type Settings = z.output<typeof settingsSchema>

export const defaultSettings: Settings = settingsSchema.parse({})
