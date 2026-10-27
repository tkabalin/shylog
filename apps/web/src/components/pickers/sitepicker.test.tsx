import { afterEach, describe, expect, it, vi } from "vitest"

import {
  button,
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

function show() {
  const onCreate = vi.fn()
  const onChange = vi.fn()
  render(
    <SiteSheet
      open
      onOpenChange={vi.fn()}
      sites={sites}
      regions={regions}
      defaultCountry="ZA"
      value={null}
      onChange={onChange}
      onCreate={onCreate}
    />
  )
  click(button("New site"))
  return { onCreate, onChange }
}

const field = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)

afterEach(() => {
  document.body.innerHTML = ""
})

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
