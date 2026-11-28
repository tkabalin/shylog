// @vitest-environment node
import { describe, expect, it } from "vitest"

import { divingLimit, searchSites, zoneNote } from "./find"
import {
  isPage,
  mapLink,
  pageById,
  pageOf,
  pages,
  searchPages,
  siteById,
  sites,
} from "./sites"

const site = (id: string) => siteById.get(id)!

describe("searchSites", () => {
  const names = (query: string) => searchSites(query).map(({ name }) => name)

  it("ignores case, accents, punctuation and spaces", () => {
    expect(names("millers point")).toContain("Miller's Point slipway")
    expect(names("a frame")).toContain("A-Frame")
    expect(names("SAO JOSE")).toContain("São José Paquete d' Africa")
  })

  it("searches only the sites the filters leave", () => {
    const wrecks = sites.filter(({ type }) => type === "wreck")
    const found = searchSites("rock", wrecks)
    expect(found.length).toBeGreaterThan(0)
    expect(found.every(({ type }) => type === "wreck")).toBe(true)
  })

  it("finds every site for an empty search", () => {
    expect(searchSites("  ")).toBe(sites)
  })
})

describe("pages", () => {
  it("groups the sites a page shares under its id, deepest depth and area", () => {
    const castle = pageById.get("page:castle-rocks")!
    expect(castle).toMatchObject({ name: "Castle Rocks", area: "false-bay" })
    expect(castle.sites.map(({ id }) => id)).toEqual([
      "castle-rocks/north-castle",
      "castle-rocks/point-reefs",
      "castle-rocks/inner-castle",
    ])
    expect(castle.depth).toBe(
      Math.max(...castle.sites.map(({ depth }) => depth ?? 0))
    )
    expect(pageOf(site("castle-rocks/inner-castle"))).toBe(castle)
    expect(mapLink("page:castle-rocks")).toBe(castle)
  })

  it("gives a page its sites' one way in, or both where they differ", () => {
    for (const page of pages) {
      const ways = new Set(page.sites.flatMap(({ access }) => access ?? []))
      expect(page.access, page.id).toBe(
        ways.size === 0 ? undefined : ways.size === 1 ? [...ways][0] : "both"
      )
    }
  })

  it("keeps a page apart from the site that has its slug", () => {
    expect(mapLink("ss-lusitania")).toBe(site("ss-lusitania"))
    expect(isPage(mapLink("page:ss-lusitania")!)).toBe(true)
    expect(isPage(site("ss-lusitania"))).toBe(false)
  })

  it("leaves out a page with one site, which is that site", () => {
    expect(mapLink("page:a-frame")).toBeUndefined()
    expect(pageOf(site("a-frame"))).toBeUndefined()
    expect(pages.every(({ sites }) => sites.length > 1)).toBe(true)
  })

  it("searches pages by name as sites are", () => {
    expect(searchPages("castor rock").map(({ id }) => id)).toEqual([
      "page:castor-rock",
    ])
  })
})

describe("divingLimit", () => {
  it("names who may dive where the strictest zone limits it", () => {
    expect(divingLimit(site("anvil-rock/anvil-rock-caves"))).toBe("no-diving")
    expect(divingLimit(site("bordjiesrif"))).toBe("shore-only")
    expect(divingLimit(site("blomvlei"))).toBe("business-only")
    expect(divingLimit(site("a-frame"))).toBeUndefined()
  })
})

describe("zoneNote", () => {
  it("names only zones that limit who may dive", () => {
    expect(zoneNote(site("anvil-rock/anvil-rock-caves"))).toEqual({
      text: "No diving",
      warn: true,
    })
    expect(zoneNote(site("bordjiesrif"))).toEqual({ text: "Shore dives only" })
    // A boat site there says what the zone rules out.
    expect(zoneNote(site("albatross-rock"))).toEqual({ text: "No boat dives" })
    expect(zoneNote(site("blomvlei"))).toEqual({ text: "Dive business only" })
    // In Boulders' no-take zone, where diving is free.
    expect(zoneNote(site("a-frame"))).toBeUndefined()
  })
})
