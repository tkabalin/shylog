import { normaliseName } from "@shylog/core"

import { sites, type Site } from "./sites"
import { zoneAt } from "./zone-at"

// How the list finds a site and what its rows say about diving there, kept
// free of the app's own modules, as the MCP server's site tools import them
// to answer as the list does.

// The list's search, among the sites the filters leave, as the Log's search
// narrows its filtered cards: names alone, ignoring case, accents,
// punctuation and spaces, so "millers" finds Miller's Point and "a frame"
// A-Frame.
const fold = (text: string) =>
  normaliseName(text).replace(/[^\p{L}\p{N}\p{M}]/gu, "")
const folded = new Map<string, string>()
export function searchSites(query: string, among: readonly Site[] = sites) {
  const needle = fold(query)
  if (!needle) return among
  return among.filter((site) => {
    let name = folded.get(site.id)
    if (name === undefined) folded.set(site.id, (name = fold(site.name)))
    return name.includes(needle)
  })
}

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
  return limit && notes[limit]
}
