import { describe, expect, it, vi } from "vitest"

import {
  button,
  cleanup,
  click,
  render,
  testRegions,
  testSites,
  type,
} from "@/dive/form/testing"

import { SiteSheet, type RegionRow, type SiteRow } from "./site-sheet"

const sites: SiteRow[] = testSites.map((site) => ({
  id: site.id,
  name: site.name,
  countryCode: site.countryCode,
  region: testRegions.find((r) => r.id === site.regionId)?.name ?? null,
  count: 3,
  last: "2026-07-22T08:10:00",
}))
const regions: RegionRow[] = testRegions.map((region) => ({
  ...region,
  sites: 1,
}))

// An import's holding place for dives the file gave no site.
const unknown: SiteRow = {
  id: "site-unknown",
  name: "Unknown site",
  countryCode: "ZA",
  region: null,
  count: 4,
  last: "2026-08-01T08:00:00",
}

function show(rows = sites, create = true) {
  const onCreate = vi.fn()
  const onChange = vi.fn()
  render(
    <SiteSheet
      open
      onOpenChange={vi.fn()}
      sites={rows}
      regions={regions}
      defaultCountry="ZA"
      value={null}
      onChange={onChange}
      onCreate={onCreate}
    />
  )
  if (create) click(button("New site"))
  return { onCreate, onChange }
}

const field = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)

describe("a new site", () => {
  it("flags Long Beach in South Africa, not the one in Vietnam, with Use it", () => {
    const { onChange, onCreate } = show()
    type(field("site-name"), "long beach ")
    expect(document.body.textContent).toContain(
      "Long Beach already exists in South Africa"
    )
    expect(button("Add")).toHaveProperty("disabled", true)
    click(button("Use it"))
    expect(onChange).toHaveBeenCalledWith("site-za-long-beach")
    expect(onCreate).not.toHaveBeenCalled()
  })

  it("starts in the last dive's country, and picks another from the ISO list", () => {
    show()
    expect(button(/^Country/)!.textContent).toContain("South Africa")
    click(button(/^Country/))
    type(document.querySelector('input[aria-label="Search countries"]'), "viet")
    click(button("Vietnam"))
    expect(button(/^Country/)!.textContent).toContain("Vietnam")
    // Long Beach is free in Vietnam's neighbour list only once it's typed
    // there: the Vietnamese one is a duplicate now.
    type(field("site-name"), "Long Beach")
    expect(document.body.textContent).toContain(
      "Long Beach already exists in Vietnam"
    )
  })

  it("defaults the water type from the body of water, and lets it be changed", () => {
    const { onCreate } = show()
    type(field("site-name"), "Miracle Waters")
    click(button(/^Body of water/))
    click(button("Lake or quarry"))
    expect(button("Fresh")!.getAttribute("aria-pressed")).toBe("true")
    click(button("Salt"))
    click(button("Add"))
    const [[entities]] = onCreate.mock.calls
    expect(entities.at(-1)).toMatchObject({
      kind: "site",
      fields: {
        name: "Miracle Waters",
        countryCode: "ZA",
        bodyOfWater: "lakeQuarry",
        waterType: "salt",
      },
    })
  })

  it("offers the country's regions as you type, and reuses Sodwana", () => {
    const { onCreate } = show()
    type(field("site-name"), "Pinnacles")
    const region = field("site-region")!
    region.focus()
    type(region, "sod")
    expect(button(/Sodwana/)).toBeDefined()
    type(region, "sodwana ")
    click(button("Add"))
    const [[entities]] = onCreate.mock.calls
    // The existing region, so no new one is created.
    expect(entities).toHaveLength(1)
    expect(entities[0].fields.regionId).toBe("region-sodwana")
  })

  it("creates a new region before the site that sits in it", () => {
    const { onCreate } = show()
    type(field("site-name"), "Roman Rock")
    type(field("site-region"), "Kalk Bay")
    expect(document.body.textContent).toContain("New region in South Africa")
    click(button("Add"))
    const [[entities]] = onCreate.mock.calls
    expect(entities.map((e: { kind: string }) => e.kind)).toEqual([
      "region",
      "site",
    ])
    expect(entities[1].fields.regionId).toBe(entities[0].id)
  })
})

describe("the Unknown site", () => {
  it("is never offered, in the list or a search", () => {
    show([...sites, unknown], false)
    expect(document.body.textContent).toContain("Two Mile Reef")
    expect(document.body.textContent).not.toContain("Unknown site")
    type(
      document.querySelector('input[aria-label="Search or add a site"]'),
      "unknown"
    )
    expect(document.body.textContent).not.toContain("Unknown site")
  })

  it("can't be made, even before an import has, and isn't offered to use", () => {
    for (const rows of [[...sites, unknown], sites]) {
      const { onCreate } = show(rows)
      type(field("site-name"), "unknown site")
      expect(document.body.textContent).toContain(
        "Unknown site is kept for imported dives. Give it another name."
      )
      expect(button("Use it")).toBeFalsy()
      expect(button("Add")).toHaveProperty("disabled", true)
      expect(onCreate).not.toHaveBeenCalled()
      cleanup()
    }
  })
})
