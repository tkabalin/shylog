import { z } from "zod"

import { countryCodes } from "../countries.ts"
import { keysOf } from "../enums.ts"

export const choice = <O extends Record<string, { label: string }>>(
  options: O
) => z.enum(keysOf(options))

export const name = z.string().trim().min(1).max(120)
// An emptied text field is null, so a form can send what is in the box and an
// edit clears the field.
export const text = z
  .string()
  .trim()
  .max(10_000)
  .transform((value) => value || null)

export const countryCode = z.enum(
  countryCodes,
  "Expected an ISO 3166 country code"
)

// Local wall-clock time at the site with whole seconds, never a zone or
// offset, so it sorts as text (see Time zones in the spec).
export const localDateTime = z.iso
  .datetime({ local: true, precision: 0 })
  .regex(/\d$/, "Expected a local time with no zone or offset")

export const uniqueList = <T extends z.ZodType<string>>(item: T) =>
  z
    .array(item)
    .refine((list) => new Set(list).size === list.length, "Listed twice")

// An edit sends only changed fields: required ones can be left out but not
// cleared, and optional ones are cleared with null.
export function patchShape<
  R extends Record<string, z.ZodType>,
  O extends Record<string, z.ZodType>,
>(required: R, optional: O) {
  return {
    ...z.object(required).partial().shape,
    ...(Object.fromEntries(
      Object.entries(optional).map(([key, schema]) => [
        key,
        schema.nullable().optional(),
      ])
    ) as { [K in keyof O]: z.ZodOptional<z.ZodNullable<O[K]>> }),
  }
}
