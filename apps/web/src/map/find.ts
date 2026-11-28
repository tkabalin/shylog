import type { Site } from "./sites"
import { zoneAt } from "./zone-at"

// How the list finds a site and what its rows say about diving there, kept
// free of the app's own modules, as the MCP server's site tools import them
// to answer as the list does.

// The search lives with the sites, so the dive form's site picker can use
// it without the zones' shapes.
export { searchSites } from "./sites"

// The strictest zone a site lies in, worked out once per site, as testing
// every zone's shapes is the slow part.
const zones = new Map<string, ReturnType<typeof zoneAt> | null>()
export function siteZone(site: Site) {
  let zone = zones.get(site.id)
  if (zone === undefined) {
    zone = zoneAt([site.lon, site.lat]) ?? null
    zones.set(site.id, zone)
  }
  return zone ?? undefined
}

// Who may dive at a site, from the strictest zone it lies in: only where
// that is limited, as no-take zones leave diving free.
export type DivingLimit = "no-diving" | "shore-only" | "business-only"
export function divingLimit(site: Site): DivingLimit | undefined {
  const zone = siteZone(site)
  return zone?.kind === "no-dive"
    ? "no-diving"
    : zone?.kind === "shore-only"
      ? "shore-only"
      : zone?.id === "robben-island" || zone?.id === "robben-abalone"
        ? "business-only"
        : undefined
}

// What a list row says about it.
export type ZoneNote = { text: string; warn?: true }
const notes: Record<DivingLimit, ZoneNote> = {
  "no-diving": { text: "No diving", warn: true },
  "shore-only": { text: "Shore dives only" },
  "business-only": { text: "Dive business only" },
}
export function zoneNote(site: Site): ZoneNote | undefined {
  const limit = divingLimit(site)
  // Beside "Boat", "Shore dives only" read as a mistake in the data, so a
  // site with a boat way in says what the zone rules out.
  if (
    limit === "shore-only" &&
    (site.access === "boat" || site.access === "both")
  )
    return { text: "No boat dives" }
  return limit && notes[limit]
}
