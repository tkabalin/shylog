// @vitest-environment node
import { statSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { apart, printed } from "../../scripts/map/wikitext"
import pins from "../../scripts/map/wikivoyage.json"
import pages from "./pages.json"
import type { Part } from "./page-text"
import raw from "./sites.geojson?raw"

// What the refresh script writes, checked as it lands in a pull request.
type Feature = {
  type: "Feature"
  geometry: { type: "Point"; coordinates: [number, number] }
  properties: Record<string, unknown> & { id: string; page?: string }
}
const collection = JSON.parse(raw) as {
  type: string
  fetched: string
  features: Feature[]
}
const sites = collection.features
const text = Object.values(pages as Record<string, Part[]>).map((parts) =>
  parts.map((part) => (typeof part === "string" ? part : part.text)).join("\n")
)

describe("sites.geojson", () => {
  it("is one site to a line, so a refresh's diff shows each that changed", () => {
    const lines = raw.trimEnd().split("\n")
    expect(lines).toHaveLength(sites.length + 2)
    expect(collection.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("gives every site a unique id, a place on the map and a kind", () => {
    const ids = new Set(sites.map((site) => site.properties.id))
    expect(ids.size).toBe(sites.length)
    for (const { geometry, properties } of sites) {
      const [lon, lat] = geometry.coordinates
      expect(lon, properties.id).toBeGreaterThan(17.9)
      expect(lon, properties.id).toBeLessThan(19.3)
      expect(lat, properties.id).toBeGreaterThan(-34.75)
      expect(lat, properties.id).toBeLessThan(-33.3)
      expect(properties.id).toMatch(
        /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9-]+)?$/
      )
      expect(["atlantic", "false-bay", "offshore", "east", "fresh"]).toContain(
        properties.area
      )
      expect(["reef", "wreck", "fresh"]).toContain(properties.type)
    }
  })

  // A distance read as a depth ("a 500 m swim out") would show here.
  it("keeps depths to whole metres a diver can reach", () => {
    for (const { properties } of sites) {
      if (properties.depth === undefined) continue
      expect(Number.isInteger(properties.depth), properties.id).toBe(true)
      expect(properties.depth, properties.id).toBeGreaterThan(0)
      expect(properties.depth, properties.id).toBeLessThanOrEqual(100)
    }
  })

  it("has every site's page, and names none Wikivoyage doesn't have", () => {
    for (const { properties } of sites) {
      if (properties.page === undefined) continue
      expect(pins.missing, properties.id).not.toContain(properties.page)
      expect(pages, properties.id).toHaveProperty([properties.page])
    }
  })

  // Depths the pages' wording once hid: a placeholder sentence took a whole
  // line with it, "maximum width" read as a depth, a misspelt &nbsp; hid a
  // figure, and Steenbras Ridge's depth variation stood for its depth.
  it("gives the depths its pages state", () => {
    const depths: Record<string, string> = {
      "a-frame": "10",
      balcony: "≈10",
      bordjiesrif: "",
      "sandy-top-ridge": "≈48",
      "sickle-reef": "42",
      "noahs-ark/twin-barges": "23",
      "roman-rock/roman-rock-south": "21",
      "pie-rock-and-outer-castle-reefs/outer-castle": "25",
      "steenbras-ridge/choirboys-reef": "26",
      "steenbras-ridge/sterretjies-reef": "25",
      "steenbras-ridge/steenbras-koppie": "36",
      "steenbras-ridge/steenbras-ridge-edge": "32",
      "steenbras-ridge/steenbras-ridge-outpost": "",
    }
    for (const [id, depth] of Object.entries(depths)) {
      const { properties } = sites.find((site) => site.properties.id === id)!
      const shown =
        properties.depth === undefined
          ? ""
          : `${properties.approximate ? "≈" : ""}${properties.depth}`
      expect(shown, id).toBe(depth)
    }
  })

  // A typo in the list's position puts a pin kilometres out (Hermes, Rocky
  // Ridge); site-fixes.json moves it to where its page prints it. These
  // pages' own printed positions are the typo, or aren't the site's.
  it("puts each site where its page prints it", () => {
    const misprinted = new Set([
      // The page prints S33° for S34°, E19° for E18°, 16.80' for 16.08',
      // 24.968' for 25.968', and stops after the longitude's degrees.
      "froggy-pond",
      "st-godetia",
      "sas-good-hope",
      "simons-town-jetty",
      "joshs-reef/ne-pinnacle",
      // Its bow first, where the list places the main section.
      "ss-bia",
      // A position the page calls approximate.
      "rocky-bay/noble-reef",
    ])
    let checked = 0
    for (const { geometry, properties } of sites) {
      if (!properties.page || misprinted.has(properties.id)) continue
      const parts = (pages as Record<string, Part[]>)[properties.page]
      const own = parts.find(
        (part) => typeof part === "object" && part.sites.includes(properties.id)
      )
      // Its own section's position, or else its page's Position section.
      const whole = parts
        .map((part) => (typeof part === "string" ? part : part.text))
        .join("\n\n")
      const at = whole.search(/^### Position$/m)
      const said = printed(
        typeof own === "object"
          ? own.text.slice(0, 200)
          : at < 0
            ? ""
            : whole.slice(at, at + 400)
      )
      if (!said) continue
      checked++
      expect(apart(said, geometry.coordinates), properties.id).toBeLessThan(150)
    }
    expect(checked).toBeGreaterThan(350)
  })

  it("names and describes its sites in plain words", () => {
    for (const { properties } of sites) {
      const { id, name, description } = properties as {
        id: string
        name: string
        description?: string
      }
      expect(name, id).not.toMatch(/&#?\w+;|[*[\]{}<>|]/)
      if (description === undefined) continue
      expect(description, id).not.toMatch(/&#?\w+;|[*[\]{}<>|]|''/)
      expect(description, id).toMatch(/^[A-Z"“‘0-9]/)
    }
  })
})

describe("pages.json", () => {
  // The service worker precaches it, and vite-plugin-pwa fails the build
  // over a file past 2 MiB with an error that doesn't name the refresh.
  it("stays small enough to precache", () => {
    const { size } = statSync(new URL("./pages.json", import.meta.url))
    expect(size).toBeLessThan(2 * 1024 * 1024)
  })

  it("links only sites the map has", () => {
    const ids = new Set(sites.map((site) => site.properties.id))
    const links = text.flatMap((page) =>
      [...page.matchAll(/\]\(site:([^)]+)\)/g)].map((match) => match[1])
    )
    expect(links.length).toBeGreaterThan(1000)
    expect(links.filter((id) => !ids.has(id))).toEqual([])
  })

  // Nothing that would load from elsewhere when a sheet opens.
  it("links nowhere but sites, and has no images", () => {
    for (const page of text) {
      expect(page).not.toMatch(/!\[|\]\((?!site:)/)
    }
  })

  it("leaves no wikitext behind", () => {
    for (const page of text) {
      expect(page).not.toMatch(
        /\{\{|\}\}|\[\[|\]\]|''|<\/?[a-z]+[ >/]|^[{|]\|/m
      )
      // An entity left as it was typed, such as "24&npsp;m".
      expect(page).not.toMatch(/&#?\w+;/)
    }
  })

  // The Table Mountain MPA's dive permit ended in 2024; Robben Island's
  // pages still say what its MPA asks.
  it("says no Table Mountain site needs a permit", () => {
    const told = text.filter((page) =>
      page
        .split("\n\n")
        .some(
          (paragraph) =>
            /permit (?:for recreational diving )?is\s+required/.test(
              paragraph
            ) && !/\b2019\b|Robben/.test(paragraph)
        )
    )
    expect(told).toEqual([])
  })

  // Each site the list gives a section of a shared page has words of its
  // own, which its sheet shows first.
  it("gives every site with a section a part of its own", () => {
    const own = new Set(
      Object.values(pages as Record<string, Part[]>).flatMap((parts) =>
        parts.flatMap((part) => (typeof part === "object" ? part.sites : []))
      )
    )
    for (const { properties } of sites) {
      if (properties.section === undefined) continue
      expect(own.has(properties.id), properties.id).toBe(true)
    }
  })
})
