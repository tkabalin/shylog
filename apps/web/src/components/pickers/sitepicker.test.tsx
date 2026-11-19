import { act } from "react"
import { describe, expect, it, onTestFinished, vi } from "vitest"

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

// Explore is on unless a test turns it off, as on an instance whose diver
// dives away from Cape Town.
const explore = vi.hoisted(() => ({ on: true }))
vi.mock("@/map/enabled", () => ({
  get exploreOn() {
    return explore.on
  },
}))

// A phone unless a test sits at a desk, where the sheet is a dialog.
const desk = vi.hoisted(() => ({ on: false }))
vi.mock("@/hooks/use-desk", () => ({ useDesk: () => desk.on }))

const sites: SiteRow[] = testSites.map((site) => ({
  id: site.id,
  name: site.name,
  countryCode: site.countryCode,
  region: testRegions.find((r) => r.id === site.regionId)?.name ?? null,
  mapSite: site.mapSite,
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
  mapSite: null,
  count: 4,
  last: "2026-08-01T08:00:00",
}

function show(
  rows = sites,
  create = true,
  country: "ZA" | null = "ZA",
  regionRows = regions
) {
  const onCreate = vi.fn()
  const onChange = vi.fn()
  render(
    <SiteSheet
      open
      onOpenChange={vi.fn()}
      sites={rows}
      regions={regionRows}
      defaultCountry={country}
      value={null}
      onChange={onChange}
      onCreate={onCreate}
    />
  )
  if (create) click(button("New custom site"))
  return { onCreate, onChange }
}

const search = (label: string, text: string) =>
  type(document.querySelector(`input[aria-label="${label}"]`), text)
const headings = () =>
  [...document.querySelectorAll("h3")].map((h) => h.textContent)

// Explore's sites come in from the map's chunk once the sheet mounts: the
// same import the sheet asked for, so its rows are in once this is, however
// long a cold import takes on a busy runner.
async function showWithMap(rows = sites, regionRows = regions) {
  const shown = show(rows, false, "ZA", regionRows)
  await act(() => import("@/map/sites"))
  return shown
}

describe("at a desk", () => {
  // Mid-slide the field sits past the dialog's edge, where scrolling to it
  // shifted the dialog sideways and jolted the view as the slide ended.
  it("focuses a view's field without scrolling to it", async () => {
    desk.on = true
    onTestFinished(() => void (desk.on = false))
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    onTestFinished(() => focus.mockRestore())
    await showWithMap()
    click(button("From Explore"))
    const search = document.querySelector(
      'input[aria-label="Search dive sites"]'
    )
    expect(document.activeElement).toBe(search)
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
    click(button("Sites"))
    click(button("New custom site"))
    expect(document.activeElement).toBe(document.getElementById("site-name"))
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
  })
})

describe("a site from Explore", () => {
  it("isn't offered where Explore is off", () => {
    explore.on = false
    onTestFinished(() => void (explore.on = true))
    show(sites, false)
    expect(button("From Explore")).toBeFalsy()
    search("Search or add a site", "a frame")
    expect(document.body.textContent).toContain("No sites match.")
  })

  it("is found by the picker's search under the log's own, without the ones it has", async () => {
    await showWithMap()
    search("Search or add a site", "long beach")
    // The log's Long Beach in South Africa is the map's, so it shows once.
    expect(headings()).not.toContain("Explore dive sites")
    search("Search or add a site", "a frame")
    expect(headings()).toContain("Explore dive sites")
    expect(button(/^A-Frame/)!.textContent).toContain("False Bay coast · 10 m")
  })

  it("shows the first few the search finds, and the rest in the Dive sites list with the search", async () => {
    await showWithMap()
    search("Search or add a site", "pinnacle")
    const all = button(/^Show all/)!
    const count = Number(all.textContent!.replace(/\D/g, ""))
    expect(count).toBeGreaterThan(8)
    click(all)
    const query = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search dive sites"]'
    )!
    expect(query.value).toBe("pinnacle")
  })

  it("tells apart two of the map's pinnacles with one name", async () => {
    const castor: SiteRow = {
      id: "site-castor",
      name: "Central Pinnacle",
      countryCode: "ZA",
      region: "Offshore False Bay",
      mapSite: "castor-rock/central-pinnacle",
      count: 2,
      last: "2026-02-01T09:00:00",
    }
    const { onCreate, onChange } = await showWithMap([...sites, castor])
    click(button("From Explore"))
    search("Search dive sites", "central pinnacle")
    const rows = [...document.querySelectorAll("button")].filter((b) =>
      /^Central [Pp]innacle/.test(b.textContent!)
    )
    // Castor Rock's is the log's, with its dives; Josh's Reef's isn't.
    expect(rows.map((row) => row.textContent!.includes("2 dives"))).toContain(
      false
    )
    click(rows.find((row) => !row.textContent!.includes("2 dives"))!)
    const [[entities]] = onCreate.mock.calls
    expect(entities.at(-1).fields).toMatchObject({
      name: "Central pinnacle, Josh's Reef",
      mapSite: "joshs-reef/central-pinnacle",
    })
    expect(onChange).toHaveBeenCalledWith(entities.at(-1).id)
  })

  it("offers a typed name that's one of Explore's sites filled in", async () => {
    const { onCreate } = await showWithMap()
    click(button("New custom site"))
    type(field("site-name"), "a-frame")
    expect(document.body.textContent).toContain("A-Frame is on Explore")
    click(button("Use it"))
    const [[entities]] = onCreate.mock.calls
    expect(entities.at(-1).fields).toMatchObject({ mapSite: "a-frame" })
  })

  it("adds a custom site from a Dive sites search that finds none", async () => {
    await showWithMap()
    click(button("From Explore"))
    search("Search dive sites", "Jetty dive")
    click(button("Add “Jetty dive”"))
    expect(field("site-name")!.value).toBe("Jetty dive")
  })

  it("adds the site filled in from the map, in a new region named after its area", async () => {
    const { onCreate, onChange } = await showWithMap()
    search("Search or add a site", "a frame")
    click(button(/^A-Frame/))
    const [[entities]] = onCreate.mock.calls
    expect(entities).toMatchObject([
      {
        kind: "region",
        fields: { name: "False Bay coast", countryCode: "ZA" },
      },
      {
        kind: "site",
        fields: {
          name: "A-Frame",
          countryCode: "ZA",
          regionId: entities[0].id,
          bodyOfWater: "oceanSea",
          waterType: "salt",
          mapSite: "a-frame",
        },
      },
    ])
    expect(onChange).toHaveBeenCalledWith(entities[1].id)
  })

  it("lists every map site by area, and takes Blue Rock Quarry as fresh water in its own region", async () => {
    const fresh = {
      id: "region-fresh",
      name: "blue rock quarry",
      countryCode: "ZA",
      sites: 0,
    }
    const { onCreate } = await showWithMap(sites, [...regions, fresh])
    click(button("From Explore"))
    expect(headings()).toEqual([
      "Atlantic coast",
      "False Bay coast",
      "Offshore False Bay",
      "East False Bay",
      "Fresh water",
    ])
    search("Search dive sites", "deep end")
    click(button(/^Deep End/))
    const [[entities]] = onCreate.mock.calls
    expect(entities).toHaveLength(1)
    expect(entities[0].fields).toMatchObject({
      regionId: "region-fresh",
      bodyOfWater: "lakeQuarry",
      waterType: "fresh",
      mapSite: "blue-rock-quarry/deep-end",
    })
  })

  it("picks the log's own site where it has the map's, by link or by name", async () => {
    const castle: SiteRow = {
      id: "site-castle",
      name: "Castle Rocks",
      countryCode: "ZA",
      region: "False Bay",
      mapSite: "castle-rocks/point-reefs",
      count: 1,
      last: "2026-01-14T09:00:00",
    }
    const { onCreate, onChange } = await showWithMap([...sites, castle])
    click(button("From Explore"))
    search("Search dive sites", "point reefs")
    expect(button(/^Castle Rocks Point Reefs/)!.textContent).toContain("1 dive")
    click(button(/^Castle Rocks Point Reefs/))
    expect(onChange).toHaveBeenLastCalledWith("site-castle")
    // The test's sheet stays open on the list after a pick.
    search("Search dive sites", "long beach")
    click(button(/^Long Beach/))
    expect(onChange).toHaveBeenLastCalledWith("site-za-long-beach")
    expect(onCreate).not.toHaveBeenCalled()
  })
})

const field = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)

const pressReturn = (input: HTMLInputElement) =>
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  })

describe("a new site", () => {
  it("moves Return from the name on to the region", () => {
    show()
    const name = field("site-name")!
    expect(name.getAttribute("enterkeyhint")).toBe("next")
    name.focus()
    pressReturn(name)
    expect(document.activeElement).toBe(field("site-region"))
  })

  it("closes the keyboard on Return while the region waits for a country", () => {
    show(sites, true, null)
    const name = field("site-name")!
    expect(name.getAttribute("enterkeyhint")).toBe("done")
    name.focus()
    pressReturn(name)
    expect(document.activeElement).toBe(document.body)
  })

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

describe("the keyboard's padding", () => {
  // jsdom has no visualViewport, so a stand-in the test can raise a
  // keyboard on: 300px of a 768px window covered.
  function fakeViewport() {
    const viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      offsetTop: 0,
    })
    vi.stubGlobal("visualViewport", viewport)
    onTestFinished(() => void vi.unstubAllGlobals())
    return viewport
  }
  const frame = () =>
    act(() => new Promise((done) => requestAnimationFrame(() => done(null))))
  const scroller = () =>
    document.querySelector<HTMLElement>(
      "[data-slot=drawer-content] .overflow-y-auto"
    )
  const pad = () => scroller()?.style.getPropertyValue("--keyboard")

  it("follows the keyboard, and reaches a view that mounts with it up", async () => {
    const viewport = fakeViewport()
    show(sites, false)
    expect(pad()).toBe("0px")
    viewport.height = window.innerHeight - 300
    viewport.dispatchEvent(new Event("resize"))
    viewport.dispatchEvent(new Event("scroll"))
    await frame()
    expect(pad()).toBe("300px")
    // New custom site swaps the view, which remounts the scroller.
    const was = scroller()
    click(button("New custom site"))
    expect(scroller()).not.toBe(was)
    expect(pad()).toBe("300px")
    viewport.height = window.innerHeight
    viewport.dispatchEvent(new Event("resize"))
    await frame()
    expect(pad()).toBe("0px")
  })
})
