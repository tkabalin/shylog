// Test only: small hand-built logs for the cases the seeded fixture lacks.
import type { Dive, Person, Region, Site } from "@/data/db"
import type { DiveLinks, LogView } from "@/data/log"

let n = 0

export const dive = (fields: Partial<Dive> = {}): Dive =>
  ({
    id: `dive-${++n}`,
    number: n,
    startTime: "2026-07-22T08:12:19",
    siteId: "site-a",
    duration: 2520,
    maxDepth: 18,
    nitrox: false,
    oxygen: null,
    ignored: false,
    minTemperature: null,
    maxTemperature: null,
    visibility: null,
    visibilityRating: null,
    ...fields,
  }) as Dive

const byId = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((row) => [row.id, row]))

export function syntheticLog(
  dives: Dive[],
  extras: {
    sites?: Site[]
    regions?: Region[]
    people?: Person[]
    links?: Record<string, Partial<DiveLinks>>
  } = {}
): LogView {
  const sites = extras.sites ?? [
    {
      id: "site-a",
      name: "Long Beach",
      countryCode: "ZA",
      regionId: null,
      bodyOfWater: "oceanSea",
      waterType: "salt",
    } as Site,
  ]
  return {
    version: "1",
    settings: { diverName: "", maxPo2: 1.4, newDiveDefaults: {} },
    // Newest first, as the mirror keeps them.
    dives: [...dives].sort((a, b) => b.startTime.localeCompare(a.startTime)),
    dive: byId(dives),
    sites: byId(sites),
    regions: byId(extras.regions ?? []),
    people: byId(extras.people ?? []),
    diveCentres: new Map(),
    trips: new Map(),
    links: new Map(
      Object.entries(extras.links ?? {}).map(([id, links]) => [
        id,
        { buddies: [], professionals: [], tags: [], ...links },
      ])
    ),
    fieldMeta: new Map(),
    cards: [],
    pending: new Set(),
  } as LogView
}
