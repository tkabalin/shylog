import { describe, expect, it } from "vitest"

import {
  fetched,
  pageById,
  siteById,
  sites,
} from "../../../../web/src/map/sites.ts"
import { testApp } from "../../../test/app.ts"
import { callTool, mcpClient } from "../../../test/mcp.ts"

type Row = Record<string, unknown>

const client = () => mcpClient(testApp())
const search = async (args: Record<string, unknown>) =>
  (await callTool(await client(), "search_map_sites", args)).json() as {
    showing: string
    sites: Row[]
  }

describe("search_map_sites", () => {
  it("finds a site by name as the list does, with its figures", async () => {
    // The figures come from the snapshot, which a refresh may change; the
    // zone and who may dive come from the rules.
    const site = siteById.get("a-frame")!
    expect((await search({ name: "a frame" })).sites).toEqual([
      {
        id: "a-frame",
        name: "A-Frame",
        area: "False Bay coast",
        type: "reef",
        access: "shore",
        goodInWind: site.wind,
        exposedToSwell: site.swell,
        bestSeason: site.season,
        noSpecialSkills: site.noSpecialSkills,
        needs: site.needs,
        goodFor: site.goodFor,
        maxDepthM: site.depth,
        diving: "allowed",
        zone: "Boulders no-take zone",
        lat: site.lat,
        lon: site.lon,
        description: site.description,
      },
    ])
  })

  it("filters by area, type and max depth, leaving out unknown depths", async () => {
    const { sites: found } = await search({
      areas: ["atlantic"],
      types: ["wreck"],
      minDepthM: 20,
      maxDepthM: 30,
    })
    expect(found.length).toBeGreaterThan(0)
    for (const site of found) {
      expect(site).toMatchObject({ area: "Atlantic coast", type: "wreck" })
      expect(site.maxDepthM).toBeGreaterThanOrEqual(20)
      expect(site.maxDepthM).toBeLessThanOrEqual(30)
    }
    // Ben's Reef has no known depth.
    expect(siteById.get("bens-reef")!.depth).toBeUndefined()
    expect((await search({ name: "ben's reef" })).sites).toHaveLength(1)
    expect(
      (await search({ name: "ben's reef", maxDepthM: 100 })).sites
    ).toHaveLength(0)
  })

  it("filters by how its page says you get in", async () => {
    const shore = await search({ access: ["shore"], limit: 200 })
    const ids = shore.sites.map((site) => site.id)
    expect(ids).toContain("a-frame")
    // A site dived both ways is a shore dive too, as on the map.
    expect(ids).toContain("sentinel")
    expect(
      shore.sites.every(
        (site) => site.access === "shore" || site.access === "both"
      )
    ).toBe(true)
    // Noble Reef is a boat dive off Rocky Bay's shore entry.
    expect(siteById.get("rocky-bay")!.access).toBe("both")
    expect(siteById.get("rocky-bay/noble-reef")!.access).toBe("boat")
    // A boat dive whose page gives a long swim from the shore is both.
    const [dFrame] = (await search({ name: "d-frame" })).sites
    expect(dFrame).toMatchObject({ access: "both", shoreEntry: "long swim" })
  })

  it("filters on the page tags as Explore's filters do", async () => {
    const { sites: found } = await search({
      wind: ["se"],
      swell: ["sw"],
      noSpecialSkills: true,
      limit: 200,
    })
    expect(found.length).toBeGreaterThan(0)
    for (const site of found) {
      // A south-easter keeps the sites good in it or a point either side.
      const winds = site.goodInWind as string[]
      expect(winds.filter((w) => ["e", "se", "s"].includes(w))).not.toEqual([])
      expect(site.exposedToSwell ?? []).not.toContain("sw")
      expect(site.noSpecialSkills).toBe(true)
    }
    const night = await search({ limit: 200, goodFor: ["night"] })
    expect(night.sites.length).toBeGreaterThan(0)
    for (const site of night.sites) expect(site.goodFor).toContain("night")
    // Sites pinned in and out: Blouklip is a summer dive in a south-easter,
    // SS Maori is exposed to north-west swell, Sentinel asks for fitness.
    const ids = async (args: Record<string, unknown>) =>
      (await search({ limit: 200, ...args })).sites.map((site) => site.id)
    expect(await ids({ wind: ["se"], season: ["summer"] })).toContain(
      "blouklip"
    )
    // A-Frame is good in a westerly, which a north-westerly's neighbour is.
    expect(await ids({ wind: ["nw"] })).toContain("a-frame")
    expect(await ids({ wind: ["n"] })).not.toContain("a-frame")
    expect(await ids({ swell: ["nw"] })).not.toContain("ss-maori")
    expect(await ids({ swell: ["se"] })).toContain("ss-maori")
    expect(await ids({ avoid: ["fitness"] })).not.toContain("sentinel")
    expect(await ids({ avoid: ["dsmb"] })).toContain("sentinel")
  })

  it("collapses a page's sites into its first row on request", async () => {
    // Every row, page by page.
    const collapsed = async (args: Record<string, unknown>) => {
      const rows: Row[] = []
      for (let offset = 0; ; offset += 200) {
        const { sites: page } = await search({
          ...args,
          collapseSubsites: true,
          limit: 200,
          offset,
        })
        rows.push(...page)
        if (page.length < 200) return rows
      }
    }
    const of = (row: Row) => (row.alsoOnPage ?? []) as { id: string }[]
    const rows = await collapsed({})
    // One row per page, and a site with no page on its own.
    expect(rows).toHaveLength(
      new Set(sites.map((site) => site.page ?? site.id)).size
    )
    const pages = rows.map((row) => row.page).filter(Boolean)
    expect(new Set(pages).size).toBe(pages.length)
    // The page covering the most sites: its row names it and the rest.
    const counts = new Map<string, number>()
    for (const { page } of sites) {
      if (page) counts.set(page, (counts.get(page) ?? 0) + 1)
    }
    const [busiest, size] = [...counts].sort((a, b) => b[1] - a[1])[0]!
    expect(of(rows.find((row) => row.page === busiest)!)).toHaveLength(size - 1)
    // The row kept is the first in the sort order: here the deepest.
    for (const row of await collapsed({ sort: "deepest" })) {
      for (const { id } of of(row)) {
        expect(siteById.get(id)!.depth ?? -1).toBeLessThanOrEqual(
          (row.maxDepthM as number | undefined) ?? -1
        )
      }
    }
    // Only matches fold in: with wrecks asked for, no reef of their pages.
    for (const row of await collapsed({ types: ["wreck"] })) {
      for (const { id } of of(row)) {
        expect(siteById.get(id)!.type).toBe("wreck")
      }
    }
    // Without it, every site has its own row and none carries the others.
    const plain = await search({ name: "whittle", limit: 200 })
    for (const row of plain.sites) {
      expect(row).not.toHaveProperty("alsoOnPage")
      expect(row).not.toHaveProperty("page")
    }
  })

  it("finds a page's sites by the page's name, each naming its page", async () => {
    // Castor Rock's pinnacles have names of their own.
    const found = (await search({ name: "castor rock" })).sites
    expect(found.map((row) => row.id).sort()).toEqual(
      pageById
        .get("page:castor-rock")!
        .sites.map((site) => site.id)
        .sort()
    )
    for (const row of found) expect(row.pageId).toBe("page:castor-rock")
    // A site alone on its page has no page to link.
    expect((await search({ name: "a frame" })).sites[0]).not.toHaveProperty(
      "pageId"
    )
  })

  it("refuses a value the tags don't have", async () => {
    const reply = await callTool(await client(), "search_map_sites", {
      wind: ["up"],
    })
    expect(reply).toMatchObject({ isError: true })
  })

  it("filters by who may dive there", async () => {
    const shore = await search({ diving: ["shore-only"], limit: 200 })
    expect(shore.sites.map((site) => site.id)).toContain("bordjiesrif")
    expect(shore.sites.every((site) => site.diving === "shore-only")).toBe(true)
    const banned = await search({ diving: ["no-diving"], limit: 200 })
    expect(banned.sites.map((site) => site.id)).toContain(
      "anvil-rock/anvil-rock-caves"
    )
  })

  it("sorts by distance from a point, within a radius", async () => {
    const { lat, lon } = siteById.get("a-frame")!
    const { sites: found } = await search({ near: { lat, lon, withinKm: 2 } })
    expect(found[0]).toMatchObject({ id: "a-frame", distanceKm: 0 })
    const distances = found.map((site) => site.distanceKm as number)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
    expect(distances.at(-1)).toBeLessThanOrEqual(2)
    // With no radius, every site, each with its distance.
    const offset = sites.length - 2
    const all = await search({ near: { lat, lon }, offset })
    expect(all.showing).toBe(`${offset + 1}–${sites.length} of ${sites.length}`)
    expect(all.sites.every((site) => site.distanceKm !== undefined)).toBe(true)
  })

  it("sorts the deepest first, with unknown depths last", async () => {
    const rows: Row[] = []
    for (let offset = 0; offset < sites.length; offset += 200) {
      rows.push(
        ...(await search({ sort: "deepest", limit: 200, offset })).sites
      )
    }
    const known = rows.findIndex((site) => site.maxDepthM === undefined)
    const depths = rows.slice(0, known).map((site) => site.maxDepthM as number)
    expect(depths).toEqual([...depths].sort((a, b) => b - a))
    expect(rows.slice(known).every((site) => !("maxDepthM" in site))).toBe(true)
    expect(rows).toHaveLength(sites.length)
  })

  it("sorts names as English does, whatever the machine's locale", async () => {
    // By code unit, the capitals would put "drop" last. The page's other
    // sites, found by its name, sort among them too.
    expect(
      (await search({ name: "bruce's" })).sites
        .map((site) => site.name as string)
        .filter((name) => name.startsWith("Bruce's"))
    ).toEqual(["Bruce's drop", "Bruce's Mark", "Bruce's Reef"])
  })

  it("marks a depth the page gives only roughly", async () => {
    expect((await search({ name: "balcony" })).sites[0]).toMatchObject({
      maxDepthM: siteById.get("balcony")!.depth,
      approximateDepth: true,
    })
  })

  it("refuses a distance sort with no point, naming the parameter", async () => {
    const reply = await callTool(await client(), "search_map_sites", {
      sort: "distance",
    })
    expect(reply).toMatchObject({
      isError: true,
      text: "sort: Sorting by distance needs near",
    })
  })

  it("pages through every site", async () => {
    const four = await search({ limit: 4 })
    const second = await search({ limit: 2, offset: 2 })
    expect(four.showing).toBe(`1–4 of ${sites.length}`)
    expect(second.showing).toBe(`3–4 of ${sites.length}`)
    expect(second.sites).toEqual(four.sites.slice(2))
    const past = await search({ offset: sites.length })
    expect(past).toEqual({ showing: `0 of ${sites.length}`, sites: [] })
  })

  it("refuses a page longer than 200", async () => {
    const reply = await callTool(await client(), "search_map_sites", {
      limit: 201,
    })
    expect(reply).toMatchObject({
      isError: true,
      text: expect.stringContaining("limit"),
    })
  })
})

describe("get_map_site", () => {
  const get = async (id: string) =>
    (await callTool(await client(), "get_map_site", { id })).json()
  const getPage = async (id: string) =>
    (await get(id)) as Row & { sites: Row[]; text: string }

  it("gives the site's page, zone and its marine protected area's rules", async () => {
    const site = await get("a-frame")
    expect(site).toMatchObject({
      name: "A-Frame",
      zone: {
        name: "Boulders no-take zone",
        rule: "Diving allowed. No fishing, spearfishing or collecting.",
      },
      page: "A-Frame",
      wikivoyage:
        "https://en.wikivoyage.org/wiki/Diving_the_Cape_Peninsula_and_False_Bay/A-Frame",
      credit: `Text adapted from Wikivoyage's contributors under CC BY-SA 4.0, read ${fetched}`,
    })
    expect(site.text).toMatch(/^The dive site \*\*A-Frame\*\*/)
    expect(site.text).toContain("## Conditions")
    expect(site.mpaRules).toContainEqual({
      heading: "No-take zones",
      where:
        "Karbonkelberg, Cape of Good Hope, Paulsberg, Castle Rock, Boulders and St James",
      rules: expect.arrayContaining([
        {
          text: "No fishing, spearfishing or collecting. Diving is allowed.",
          source: "GN R.695 of 2004, reg 6",
        },
      ]),
    })
  })

  it("puts a section site's own words before its shared page", async () => {
    const text = (await get("whittle-rock/west-pinnacle")).text as string
    expect(text).toMatch(/^\*\*Whittle Rock West Pinnacle\*\*/)
    expect(text).toContain("\n\n# Whittle Rock\n\n")
    // Its own section isn't repeated in the page below it.
    expect(text.split("**Whittle Rock West Pinnacle**")).toHaveLength(2)
  })

  it("lists the features inside a site, where it has some", async () => {
    const { features } = await get("mv-treasure")
    expect(features).toContainEqual(
      // The page writes "51&nbsp;m", as the page text keeps it.
      expect.objectContaining({
        name: expect.stringMatching(/Propeller 51\sm/),
      })
    )
    expect(await get("a-frame")).not.toHaveProperty("features")
  })

  it("titles a zone's rule with what bans diving there", async () => {
    expect((await get("anvil-rock/anvil-rock-caves")).zone).toEqual({
      name: "Cape Point abalone area",
      rule: "No diving. No snorkelling either, and no dive gear on boats.",
    })
  })

  it("leaves the text out for a site whose page nobody wrote", async () => {
    const site = await get("bens-reef")
    expect(site).toMatchObject({ name: "Ben's Reef", diving: "allowed" })
    expect(site).not.toHaveProperty("text")
    expect(site).not.toHaveProperty("credit")
  })

  it("gives a whole page by its pageId: its sites and its text from the top", async () => {
    const page = await getPage("page:castle-rocks")
    expect(page).toMatchObject({
      id: "page:castle-rocks",
      name: "Castle Rocks",
      area: "False Bay coast",
      maxDepthM: pageById.get("page:castle-rocks")!.depth,
      wikivoyage:
        "https://en.wikivoyage.org/wiki/Diving_the_Cape_Peninsula_and_False_Bay/Castle_Rocks",
      credit: `Text adapted from Wikivoyage's contributors under CC BY-SA 4.0, read ${fetched}`,
    })
    expect(page.sites.map(({ id }) => id)).toEqual([
      "castle-rocks/north-castle",
      "castle-rocks/point-reefs",
      "castle-rocks/inner-castle",
    ])
    expect(page.sites[0]).toMatchObject({
      name: "North Castle",
      diving: "allowed",
      zone: "Castle Rock no-take zone",
    })
    // The page from its top, every section in its place.
    expect(page.text).not.toMatch(/^# /)
    expect(page.text).toContain("North Castle")
    expect(page.text).toContain("Inner Castle")
  })

  it("tells a page from the site that has its slug", async () => {
    expect((await get("ss-lusitania")).name).toBe("SS Lusitania")
    expect((await get("ss-lusitania")).type).toBe("wreck")
    const page = await getPage("page:ss-lusitania")
    expect(page.sites.length).toBeGreaterThan(1)
    expect(page).not.toHaveProperty("type")
  })

  it("refuses an id the map doesn't have", async () => {
    for (const id of ["site-long-beach", "page:a-frame"]) {
      const reply = await callTool(await client(), "get_map_site", { id })
      expect(reply).toMatchObject({
        isError: true,
        text: "id: No map site or page has that id",
      })
    }
  })
})

describe("on an instance with Explore off", () => {
  it("has no site tools and doesn't mention them", async () => {
    const off = await mcpClient(testApp({ env: { SHYLOG_EXPLORE: "off" } }))
    const { tools } = await off.listTools()
    expect(tools.map((tool) => tool.name)).not.toContain("search_map_sites")
    expect(off.getInstructions()).not.toContain("search_map_sites")
    const on = await client()
    expect(on.getInstructions()).toContain("search_map_sites")
  })
})
