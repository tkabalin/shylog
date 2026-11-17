import { latestSchemaVersion } from "@shylog/core"
import type { CSSProperties, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Log } from "@/api/client"
import { LogDb } from "@/data/db"
import { QueueDb } from "@/data/drafts"
import { readLog, type LogView } from "@/data/log"
import { syncLog } from "@/data/sync"
import { render } from "@/dive/form/testing"
import { cardDay } from "@/format/dates"

import { cardProps, DiveCard } from "./dive-card"

// A plain link: where the card leads isn't what this checks.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    style,
  }: {
    children?: ReactNode
    className?: string
    style?: CSSProperties
  }) => (
    <a href="#" className={className} style={style}>
      {children}
    </a>
  ),
}))
// Called once each time a card renders, so it counts them.
vi.mock("@/format/dates", async (original) => {
  const dates = await original<typeof import("@/format/dates")>()
  return { ...dates, cardDay: vi.fn(dates.cardDay) }
})

const dive = (n: number, overrides: Partial<Log["dives"][number]> = {}) =>
  ({
    id: `dive-${n}`,
    number: n,
    startTime: `2026-07-${String(n).padStart(2, "0")}T08:00:00`,
    siteId: n % 2 ? "site-a" : "site-b",
    duration: 2520,
    maxDepth: 20 + n,
    sparkline: [4, 12, 18, 16, 5],
    deletedAt: null,
    ...overrides,
  }) as Log["dives"][number]

const log = (version: string, dives: Log["dives"]): Log => ({
  schemaVersion: latestSchemaVersion,
  version,
  serverTime: "2026-10-22T10:00:00.000Z",
  dives,
  sites: [
    {
      id: "site-a",
      name: "Two Mile Reef",
      countryCode: "ZA",
      regionId: "region-sodwana",
      bodyOfWater: "oceanSea",
      waterType: "salt",
    },
    {
      id: "site-b",
      name: "Long Beach",
      countryCode: "ZA",
      regionId: null,
      bodyOfWater: "oceanSea",
      waterType: "salt",
    },
  ],
  countries: ["ZA"],
  regions: [{ id: "region-sodwana", name: "Sodwana", countryCode: "ZA" }],
  people: [],
  diveCentres: [],
  trips: [],
  links: [],
  fieldMeta: dives.map((dive) => ({
    diveId: dive.id,
    field: "maxDepth",
    source: "hand" as const,
    computerValue: dive.maxDepth + 0.4,
    dismissed: false,
  })),
  settings: { diverName: "", maxPo2: 1.4, newDiveDefaults: {} },
  cards: [],
  packing: { sections: [] },
})

// The Log's cards as MonthGroup renders them.
const Cards = ({ view }: { view: LogView }) =>
  view.dives.map((dive) => (
    <DiveCard key={dive.id} dive={dive} {...cardProps(dive, view)} />
  ))

let db: LogDb
let queue: QueueDb
beforeEach(() => {
  db = new LogDb(`test-${crypto.randomUUID()}`)
  queue = new QueueDb(`test-queue-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await Promise.all([db.delete(), queue.delete()])
})

async function synced(body: Log) {
  await syncLog({ db, fetch: vi.fn(async () => Response.json(body)) })
  return (await readLog(db, queue)).log!
}

describe("DiveCard", () => {
  it("renders again only for the dive a sync changed", async () => {
    const dives = Array.from({ length: 6 }, (_, i) => dive(i + 1))
    const { rerender, container } = render(
      <Cards view={await synced(log("v1", dives))} />
    )
    expect(container.querySelectorAll("a")).toHaveLength(6)
    const rendered = vi.mocked(cardDay)
    rendered.mockClear()

    // Another device edits dive 3's notes, which no card shows, and dive 4's
    // depth, which its card does.
    const next = dives.map((one) =>
      one.id === "dive-3"
        ? { ...one, notes: "Turtle" }
        : one.id === "dive-4"
          ? { ...one, maxDepth: 30.2 }
          : one
    )
    rerender(<Cards view={await synced(log("v2", next))} />)

    expect(rendered.mock.calls.map(([startTime]) => startTime).sort()).toEqual([
      next[2]!.startTime,
      next[3]!.startTime,
    ])
    expect(container.textContent).toContain("30.2 m")
  })
})
