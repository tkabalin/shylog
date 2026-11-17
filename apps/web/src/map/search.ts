import type { Mpa } from "./zone-rules"

// Explore's address: the picked site, the filters, and on a phone the
// screen over the map (the list, or the rules at an MPA).
export type ExploreSearch = {
  site?: string
  types?: string
  depth?: string
  view?: "list" | "rules"
  mpa?: Mpa
}

// Every marine protected area, for checking the address; a Record so a new
// one in zone-rules.ts has to be added here too.
export const mpas = Object.keys({
  "table-mountain": true,
  "robben-island": true,
  "bettys-bay": true,
  helderberg: true,
} satisfies Record<Mpa, true>) as Mpa[]

// Keeps the filters and the rest of the address, changing only the site.
export const withSite =
  (site: string | undefined) => (prev: ExploreSearch) => ({
    ...prev,
    site,
  })

// Back from the list or the rules to the map, as it was.
export const withoutView = (prev: ExploreSearch) => ({
  ...prev,
  view: undefined,
  mpa: undefined,
})
