import { z } from "zod"

import { idSchema } from "../ids.ts"
import { name } from "./common.ts"

// Caps that bound one request, far past any real kit list.
export const packingMaxSections = 50
export const packingMaxItems = 500

export const packingItemSchema = z.strictObject({
  id: idSchema("packingItem"),
  name,
})
export type PackingItem = z.output<typeof packingItemSchema>

export const packingSectionSchema = z.strictObject({
  id: idSchema("packingSection"),
  name,
  // Capped here too, so a huge section fails before its items are checked.
  items: z.array(packingItemSchema).max(packingMaxItems),
})
export type PackingSection = z.output<typeof packingSectionSchema>

// The whole checklist in order, saved at once: the phone's ticks are kept
// by item id, so an id must never stand for two things.
export const packingSchema = z
  .strictObject({
    sections: z.array(packingSectionSchema).max(packingMaxSections),
  })
  .refine(
    ({ sections }) =>
      sections.flatMap((section) => section.items).length <= packingMaxItems,
    `Up to ${packingMaxItems} items`
  )
  .refine(({ sections }) => {
    const ids = sections.flatMap((section) => [
      section.id,
      ...section.items.map((item) => item.id),
    ])
    return new Set(ids).size === ids.length
  }, "Listed twice")
export type Packing = z.output<typeof packingSchema>
