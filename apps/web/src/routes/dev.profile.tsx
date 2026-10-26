import { useMemo } from "react"
import { mod } from "@shylog/core"
import { createFileRoute, notFound } from "@tanstack/react-router"

import type { Profile } from "@/api/client"
import { ProfileCard } from "@/components/profile-card"
import type { Dive } from "@/data/db"
import { useLog } from "@/data/log"
import { primeProfile } from "@/data/samples"

// break-ui's toggle for the dive detail's Profile card: a real dive, or the
// worst profiles a computer could hand over, fed through the samples cache
// the chart reads. Dev only; production builds 404 and leave the page out.
const sets = ["demo", "worst", "cold", "one", "loading"] as const
type Set = (typeof sets)[number]

export const Route = createFileRoute("/dev/profile")({
  validateSearch: (search): { data?: Exclude<Set, "demo"> } =>
    sets.includes(search.data as Set) && search.data !== "demo"
      ? { data: search.data as Exclude<Set, "demo"> }
      : {},
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: import.meta.env.DEV ? DevProfilePage : () => null,
})

type Sample = Profile["samples"][number]
type Event = Profile["events"][number]

// A 135 min trimix-free deep dive on a Shearwater logging every 4 s: a
// fast descent to 62.4 m, a ragged bottom, deco stops at 21, 15, 9, 6 and
// 3 m, a thermocline from 14.2 to 4.1 °C in 0.1 steps, and a dozen ascent
// alarms, some a second apart, one never closed, plus two other alarm types.
function deepDive(): Profile {
  const legs: [number, number][] = [
    [0, 0],
    [170, 62.38],
    [1100, 58.9],
    [1300, 61.2],
    [1500, 44],
    [1560, 21],
    [2000, 21],
    [2040, 15],
    [2700, 15],
    [2730, 9],
    [3600, 9],
    [3620, 6],
    [5000, 6],
    [5010, 3],
    [8060, 3],
    [8100, 0.4],
    [8124, 0],
  ]
  const samples: Sample[] = []
  let last: number | null = null
  for (let time = 4; time <= 8124; time += 4) {
    const i = legs.findIndex(([t]) => t >= time)
    const [t0, d0] = legs[i - 1]
    const [t1, d1] = legs[i]
    const wobble = time > 170 && time < 1500 ? Math.sin(time / 37) * 0.6 : 0
    const depth = Math.max(
      0,
      d0 + ((d1 - d0) * (time - t0)) / (t1 - t0) + wobble
    )
    const temperature =
      Math.round(
        (depth < 20 ? 14.2 - depth * 0.37 : 6.8 - (depth - 20) * 0.064) * 10
      ) / 10
    samples.push({
      time,
      depth: Math.round(depth * 100) / 100,
      temperature: temperature === last ? null : temperature,
      pressure: null,
    })
    last = temperature
  }
  const ascents: [number, number | null][] = [
    [1504, 1506],
    [1508, 1509],
    [1512, 1520],
    [1540, 1544],
    [2032, 2034],
    [2036, 2037],
    [2722, 2726],
    [3606, 3610],
    [5004, 5006],
    [8064, 8066],
    [8090, 8096],
    [8104, null],
  ]
  const events: Event[] = [
    { type: "surface", start: 0, end: null },
    ...ascents.map(([start, end]) => ({ type: "ascent", start, end })),
    { type: "microbubbles", start: 4200, end: null },
    { type: "rbt", start: 7900, end: null },
    { type: "surface", start: 8124, end: null },
  ]
  return { samples, events }
}

// An ice dive under 8.2 m for 18 min, the water below freezing.
function iceDive(): Profile {
  const samples: Sample[] = []
  for (let time = 10; time <= 1080; time += 10) {
    const depth = time < 120 ? time / 15 : time > 960 ? (1080 - time) / 15 : 8.2
    samples.push({
      time,
      depth: Math.round(depth * 100) / 100,
      temperature: Math.round((0.4 - Math.min(depth, 8) * 0.29) * 10) / 10,
      pressure: null,
    })
  }
  return { samples, events: [] }
}

const one: Profile = {
  samples: [{ time: 20, depth: 1.2, temperature: 21, pressure: null }],
  events: [],
}

function DevProfilePage() {
  const { data = "demo" } = Route.useSearch()
  const { log } = useLog()
  const base = log?.dives.find((dive) => dive.sparkline)
  const dive = useMemo((): Dive | null => {
    if (!base || data === "demo") return base ?? null
    const profile =
      data === "worst" ? deepDive() : data === "cold" ? iceDive() : one
    const deepest = Math.max(...profile.samples.map((s) => s.depth))
    const fake: Dive = {
      ...base,
      id: `dive-break-${data}`,
      maxDepth: data === "worst" ? 62.4 : deepest,
      computerModel:
        data === "worst"
          ? "Shearwater Perdix 2 Ti (firmware v95)"
          : data === "cold"
            ? "Suunto Zoop Novo"
            : base.computerModel,
      ascentAlarmCount: profile.events.filter((e) => e.type === "ascent")
        .length,
    }
    primeProfile(
      fake,
      data === "loading" ? new Promise(() => {}) : Promise.resolve(profile)
    )
    return fake
  }, [base, data])
  if (!dive) return null
  // EAN28 at 1.4 bar, inside the worst dive's axis.
  const modDepth =
    data === "worst" ? mod(280, 1.4, { waterType: "salt" }) : null
  return (
    <div className="flex flex-col gap-2 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-24">
      <h1 className="sr-only">Profile card</h1>
      <ProfileCard
        key={dive.id}
        dive={dive}
        mod={modDepth}
        expand={data === "demo"}
      />
      <nav className="fixed bottom-24 left-1/2 flex -translate-x-1/2 rounded-full bg-neutral-200 p-1 font-sans text-xs text-neutral-900">
        {sets.map((d) => (
          <a
            key={d}
            href={d === "demo" ? "?" : `?data=${d}`}
            className={`rounded-full px-3 py-1.5 ${data === d ? "bg-white" : ""}`}
          >
            {d === "demo" ? "Demo data" : d[0].toUpperCase() + d.slice(1)}
          </a>
        ))}
      </nav>
    </div>
  )
}
