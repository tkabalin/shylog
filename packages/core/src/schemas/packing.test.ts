import { describe, expect, it } from "vitest"

import { packingMaxItems, packingSchema } from "./packing.ts"

const section = (id: string, items: string[] = []) => ({
  id: `section-${id}`,
  name: id,
  items: items.map((item) => ({ id: `item-${item}`, name: item })),
})

describe("packingSchema", () => {
  it("takes sections of items, trimmed, and an empty list", () => {
    expect(
      packingSchema.parse({
        sections: [{ ...section("gear", ["mask"]), name: "  Gear " }],
      })
    ).toEqual({
      sections: [
        {
          id: "section-gear",
          name: "Gear",
          items: [{ id: "item-mask", name: "mask" }],
        },
      ],
    })
    expect(packingSchema.parse({ sections: [] })).toEqual({ sections: [] })
  })

  it("refuses a blank name and an id of the wrong kind", () => {
    expect(
      packingSchema.safeParse({ sections: [{ ...section("gear"), name: " " }] })
        .success
    ).toBe(false)
    expect(
      packingSchema.safeParse({
        sections: [{ ...section("gear"), id: "item-gear" }],
      }).success
    ).toBe(false)
  })

  it("refuses an id used twice, across sections too", () => {
    expect(
      packingSchema.safeParse({
        sections: [section("a", ["mask"]), section("b", ["mask"])],
      }).success
    ).toBe(false)
  })

  it("caps the items over all sections", () => {
    const many = Array.from(
      { length: packingMaxItems / 2 + 1 },
      (_, i) => `${i}`
    )
    expect(
      packingSchema.safeParse({
        sections: [
          section("a", many),
          section(
            "b",
            many.map((n) => `b${n}`)
          ),
        ],
      }).success
    ).toBe(false)
  })
})
