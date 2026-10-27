import type { LogView } from "@/data/log"

// How each site, person, dive centre and trip has been used, for the
// pickers' lists: dives counted as the entity screens count them, leaving
// out ignored dives (D20, D23), and the latest dive, ignored or not, so the
// list leads with what was used last (D29).
export interface Usage {
  count: number
  last: string
}

export interface LogUsage {
  sites: Map<string, Usage>
  buddies: Map<string, Usage>
  professionals: Map<string, Usage>
  // Dives together in either role, as the rows say.
  people: Map<string, Usage>
  diveCentres: Map<string, Usage>
  trips: Map<string, Usage>
}

export function logUsage(log: LogView): LogUsage {
  const usage: LogUsage = {
    sites: new Map(),
    buddies: new Map(),
    professionals: new Map(),
    people: new Map(),
    diveCentres: new Map(),
    trips: new Map(),
  }
  const add = (
    map: Map<string, Usage>,
    id: string | null,
    dive: { startTime: string; ignored: boolean }
  ) => {
    if (!id) return
    const entry = map.get(id) ?? { count: 0, last: "" }
    if (!dive.ignored) entry.count++
    if (dive.startTime > entry.last) entry.last = dive.startTime
    map.set(id, entry)
  }
  for (const dive of log.dives) {
    add(usage.sites, dive.siteId, dive)
    add(usage.diveCentres, dive.diveCentreId, dive)
    add(usage.trips, dive.tripId, dive)
    const links = log.links.get(dive.id)
    for (const id of links?.buddies ?? []) {
      add(usage.buddies, id, dive)
      add(usage.people, id, dive)
    }
    for (const id of links?.professionals ?? []) {
      add(usage.professionals, id, dive)
      add(usage.people, id, dive)
    }
  }
  return usage
}

// Most recently used first, then most used, then by name.
export function byRecent<T extends { id: string; name: string }>(
  rows: T[],
  usage: Map<string, Usage>
) {
  return [...rows].sort((a, b) => {
    const ua = usage.get(a.id)
    const ub = usage.get(b.id)
    return (
      (ub?.last ?? "").localeCompare(ua?.last ?? "") ||
      (ub?.count ?? 0) - (ua?.count ?? 0) ||
      a.name.localeCompare(b.name)
    )
  })
}
