// The web app's typed client brings this file into programs that don't
// include the server's src, such as its e2e tests', and a script of ambient
// declarations can't be imported.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../map.d.ts" />
import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

// Explore's own files and rules, as the app ships them, so Claude reads the
// same sites, page text and zones the map shows. The build bundles them.
import {
  divingLimit,
  searchSites,
  siteZone,
  type DivingLimit,
} from "../../../../web/src/map/find.ts"
import featuresJson from "../../../../web/src/map/features.json" with { type: "json" }
import { siteText, type Part } from "../../../../web/src/map/page-text.ts"
import pagesJson from "../../../../web/src/map/pages.json" with { type: "json" }
import {
  areas,
  fetched,
  siteById,
  type Access,
  type Area,
  type Site,
  type SiteFeature,
  type SiteType,
  wikivoyage,
} from "../../../../web/src/map/sites.ts"
import { mpaRules, zoneRules } from "../../../../web/src/map/zone-rules.ts"
import { Rejected } from "../../apply/rejected.ts"
import { addTool, readHints as read } from "../tool.ts"
import { compact, paged } from "../view.ts"

const pages = pagesJson as unknown as Record<string, Part[]>
// The features inside a site that aren't sites of their own: pinnacles, a
// wreck's bow and stern, swim-throughs, anchors, the shore entry.
const features = featuresJson as Record<string, SiteFeature[]>

const areaKeys = Object.keys(areas) as [Area, ...Area[]]
const types = ["reef", "wreck", "fresh"] as const satisfies SiteType[]
const ways = ["shore", "boat", "both"] as const satisfies Access[]
const limits = [
  "allowed",
  "business-only",
  "shore-only",
  "no-diving",
] as const satisfies (DivingLimit | "allowed")[]

const searchInput = z.strictObject({
  name: z
    .string()
    .optional()
    .describe(
      "Part of the site's name, ignoring case, accents, punctuation and spaces"
    ),
  areas: z
    .array(z.enum(areaKeys))
    .optional()
    .describe(
      `Any of these: ${areaKeys.map((key) => `${key} (${areas[key]})`).join(", ")}`
    ),
  types: z.array(z.enum(types)).optional().describe("Any of these"),
  access: z
    .array(z.enum(ways))
    .optional()
    .describe(
      "Any of these, how its page says you get in: shore (usually from the shore), boat, or both (either way, including a boat dive whose page gives a shore entry, which shoreEntry marks as a long swim or a climb where the page calls it hard); pass shore and both for every site dived from the shore. A site whose page doesn't say is left out"
    ),
  minDepthM: z.number().optional().describe("On the site's max depth"),
  maxDepthM: z
    .number()
    .optional()
    .describe(
      "On the site's max depth; a site whose depth isn't known is left out once either bound is set"
    ),
  diving: z
    .array(z.enum(limits))
    .optional()
    .describe(
      "Any of these, from the strictest zone the site lies in: allowed (no limit, no-take zones included), business-only (scuba only with an authorised dive business, round Robben Island), shore-only (Cape Point's inner abalone band), no-diving"
    ),
  near: z
    .strictObject({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      withinKm: z.number().positive().optional(),
    })
    .optional()
    .describe(
      "A point in decimal degrees; rows then give the distance from it"
    ),
  sort: z
    .enum(["name", "distance", "deepest"])
    .optional()
    .describe("Distance when near is given, otherwise name"),
  limit: z.int().min(1).max(200).default(50),
  offset: z.int().min(0).default(0),
})

// One collation everywhere, as the default follows the machine's locale.
const names = new Intl.Collator("en")

// Great-circle distance in kilometres, plenty close over a coast this size.
function distanceKm(a: { lat: number; lon: number }, b: Site) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

const zoneOf = (site: Site) => {
  const zone = siteZone(site)
  return zone && zoneRules[zone.id]
}

// What a row and the full site share: the figures the list shows, who may
// dive there, and the description.
const summary = (site: Site) =>
  compact({
    id: site.id,
    name: site.name,
    area: areas[site.area],
    type: site.type,
    access: site.access,
    shoreEntry: site.shoreEntry,
    maxDepthM: site.depth,
    approximateDepth: site.approximate,
    diving: divingLimit(site) ?? "allowed",
    zone: zoneOf(site)?.name,
    lat: site.lat,
    lon: site.lon,
    description: site.description,
  })

// The site's own section first, as its sheet shows it, then its page under
// the page's name.
function fullText(site: Site) {
  const parts = site.page && pages[site.page]
  if (!parts) return undefined
  const { own, rest } = siteText(parts, site.id)
  return own ? `${own}\n\n# ${site.page}\n\n${rest}` : rest
}

// Explore's dive sites, read-only and the same on every instance, so they
// are registered only where the instance shows the map.
export function siteTools(server: McpServer) {
  addTool(server, "search_map_sites", {
    title: "Search the dive site map",
    description:
      "Find dive sites on the Explore map of the Cape Peninsula and False Bay, from Wikivoyage, by name, area, type, shore or boat access, max depth, who may dive there and distance from a point. These are not the log's own sites. Returns one short row per site with its id, which get_map_site takes for the site's full text.",
    input: searchInput,
    hints: read,
    run(search) {
      const sort = search.sort ?? (search.near ? "distance" : "name")
      if (sort === "distance" && !search.near) {
        throw new Rejected("Sorting by distance needs near", 422, ["sort"])
      }
      const { near } = search
      const bounded =
        search.minDepthM !== undefined || search.maxDepthM !== undefined
      const found = searchSites(search.name ?? "")
        .filter(
          (site) =>
            (!search.areas?.length || search.areas.includes(site.area)) &&
            (!search.types?.length || search.types.includes(site.type)) &&
            (!search.access?.length ||
              (site.access !== undefined &&
                search.access.includes(site.access))) &&
            (!bounded ||
              (site.depth !== undefined &&
                site.depth >= (search.minDepthM ?? -Infinity) &&
                site.depth <= (search.maxDepthM ?? Infinity))) &&
            (!search.diving?.length ||
              search.diving.includes(divingLimit(site) ?? "allowed"))
        )
        .map((site) => ({
          site,
          km: near ? distanceKm(near, site) : undefined,
        }))
        .filter(({ km }) => !near?.withinKm || km! <= near.withinKm)
        .sort((a, b) =>
          sort === "distance"
            ? a.km! - b.km!
            : sort === "deepest"
              ? (b.site.depth ?? -1) - (a.site.depth ?? -1)
              : names.compare(a.site.name, b.site.name)
        )
      const { page, showing } = paged(found, search.offset, search.limit)
      return {
        showing,
        sites: page.map(({ site, km }) =>
          compact({
            ...summary(site),
            distanceKm: km === undefined ? undefined : Math.round(km * 10) / 10,
          })
        ),
      }
    },
  })

  addTool(server, "get_map_site", {
    title: "Get a dive site from the map",
    description:
      "One dive site on the Explore map by its id from search_map_sites: its figures, the zone it lies in with that marine protected area's rules, grouped by where they apply, the named features inside it (pinnacles, a wreck's bow and stern, anchors, the shore entry) with their positions, and its Wikivoyage page as Markdown, with sections such as Conditions (which swell and wind suit it), Get in, Hazards and Nearby. On a page several sites share, the site's own section comes first. A link to another site reads site:<id>.",
    input: z.strictObject({ id: z.string() }),
    hints: read,
    run({ id }) {
      const site = siteById.get(id)
      if (!site) {
        throw new Rejected("No map site has that id", 404, ["id"])
      }
      const zone = zoneOf(site)
      const mpa = zone && mpaRules.find(({ id }) => id === zone.mpa)
      const text = fullText(site)
      return compact({
        ...summary(site),
        zone:
          zone &&
          compact({
            name: zone.name,
            rule: zone.title ? `${zone.title}. ${zone.rule}` : zone.rule,
          }),
        mpaRules: mpa?.groups.map(({ heading, where, rules }) =>
          compact({
            heading,
            where,
            rules: rules.map(({ text, source }) => ({ text, source })),
          })
        ),
        features: features[site.id],
        page: site.page,
        wikivoyage: wikivoyage(site),
        text,
        credit: text
          ? `Text adapted from Wikivoyage's contributors under CC BY-SA 4.0, read ${fetched}`
          : undefined,
      })
    },
  })
}
