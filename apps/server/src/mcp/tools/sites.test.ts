import { describe, expect, it } from "vitest"

import { fetched, siteById, sites } from "../../../../web/src/map/sites.ts"
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
    // By code unit, the capitals would put "drop" last.
    expect(
      (await search({ name: "bruce's" })).sites.map((site) => site.name)
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

  it("refuses an id the map doesn't have", async () => {
    const reply = await callTool(await client(), "get_map_site", {
      id: "site-long-beach",
    })
    expect(reply).toMatchObject({
      isError: true,
      text: "id: No map site has that id",
    })
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
