import { createFileRoute, notFound } from "@tanstack/react-router"

import { DiveCard } from "@/components/dive-card"
import type { Dive, Region, Site } from "@/data/db"
import { useLog, type LogView } from "@/data/log"

// break-ui's toggle for the Log's dive card: the real log's newest dives, or
// the same dives given the worst names, places and figures a diver could
// log. Dev only; production builds 404 and leave the page component out.
export const Route = createFileRoute("/dev/cards")({
  validateSearch: (search): { data?: "worst" } =>
    search.data === "worst" ? { data: "worst" } : {},
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: import.meta.env.DEV ? DevCardsPage : () => null,
})

// Site and region names are capped at 120 characters (core's `name`).
const worst: {
  site: string
  region?: string
  country: string
  number: number | null
  maxDepth: number
  duration: number
  sparkline?: false
}[] = [
  {
    site: "Aliwal Shoal – Cathedral",
    region: "KwaZulu-Natal South Coast",
    country: "ZA",
    number: 312,
    maxDepth: 32.4,
    duration: 118 * 60,
  },
  {
    site: "Protea Banks Northern Pinnacles",
    country: "VC",
    number: 1003,
    maxDepth: 41.8,
    duration: 104 * 60,
  },
  {
    site: "Sodwana Bay Two Mile Reef",
    region: "iSimangaliso Wetland Park",
    country: "ZA",
    number: 311,
    maxDepth: 18.2,
    duration: 61 * 60,
  },
  { site: "Jo", country: "MT", number: null, maxDepth: 9, duration: 42 * 60 },
  {
    site: "Long Beach",
    region: "Simon’s Town",
    country: "ZA",
    number: 1,
    maxDepth: 3,
    duration: 7 * 60,
    sparkline: false,
  },
  {
    site: "Long Beach (Simon’s Town) – kelp forest off the slipway, south of the harbour wall, by the old naval jetty pilings",
    region: "Bosnia and Herzegovina Adriatic coast near Neum",
    country: "BA",
    number: 99,
    maxDepth: 12.6,
    duration: 55 * 60,
  },
]

function worstLog(log: LogView): LogView {
  const sites = new Map<string, Site>()
  const regions = new Map<string, Region>()
  const dives = log.dives.slice(0, worst.length).map((dive, i): Dive => {
    const w = worst[i]
    const base = log.sites.get(dive.siteId)!
    const regionId = w.region ? `region-worst-${i}` : null
    if (w.region)
      regions.set(regionId!, { id: regionId!, name: w.region } as Region)
    sites.set(dive.siteId + i, {
      ...base,
      id: dive.siteId + i,
      name: w.site,
      countryCode: w.country,
      regionId,
    })
    return {
      ...dive,
      siteId: dive.siteId + i,
      number: w.number,
      ignored: w.number === null,
      maxDepth: w.maxDepth,
      duration: w.duration,
      sparkline: w.sparkline === false ? null : dive.sparkline,
    }
  })
  return { ...log, dives, sites, regions }
}

function DevCardsPage() {
  const { data } = Route.useSearch()
  const { log } = useLog()
  if (!log) return null
  const view = data === "worst" ? worstLog(log) : log
  return (
    <div className="flex flex-col gap-2 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-24">
      <h1 className="sr-only">Dive cards</h1>
      {view.dives.slice(0, worst.length).map((dive) => (
        <DiveCard key={dive.id} dive={dive} log={view} />
      ))}
      <nav className="fixed bottom-24 left-1/2 flex -translate-x-1/2 rounded-full bg-neutral-200 p-1 font-sans text-xs">
        {(["demo", "worst"] as const).map((d) => (
          <a
            key={d}
            href={d === "worst" ? "?data=worst" : "?"}
            className={`rounded-full px-3 py-1.5 ${(data ?? "demo") === d ? "bg-white" : ""}`}
          >
            {d === "worst" ? "Worst case" : "Demo data"}
          </a>
        ))}
      </nav>
    </div>
  )
}
