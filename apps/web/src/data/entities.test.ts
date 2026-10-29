import { defaultSettings } from "@shylog/core"
import { describe, expect, it } from "vitest"

import type { Dive } from "./db"
import {
  duplicates,
  figuresOf,
  likelySameName,
  mergeCandidates,
  tripDates,
  usedBy,
} from "./entities"
import type { LogView } from "./log"

const dive = (id: string, fields: Partial<Dive>) =>
  ({
    id,
    siteId: "site-two-mile",
    startTime: "2026-07-25T09:00:00",
    maxDepth: 20,
    duration: 2400,
    ignored: false,
    deletedAt: null,
    diveCentreId: null,
    tripId: null,
    ...fields,
  }) as Dive

function view(dives: Dive[], buddies: Record<string, string[]> = {}) {
  const logged = dives
    .filter((d) => !d.deletedAt)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
  return {
    version: "v1",
    settings: defaultSettings,
    dives: logged,
    dive: new Map(dives.map((d) => [d.id, d])),
    sites: new Map([
      [
        "site-two-mile",
        {
          id: "site-two-mile",
          name: "Two Mile Reef",
          countryCode: "ZA",
          regionId: "region-sodwana",
        },
      ],
      [
        "site-2-mile",
        {
          id: "site-2-mile",
          name: "2 Mile Reef",
          countryCode: "ZA",
          regionId: "region-sodwana",
        },
      ],
      [
        "site-vn",
        {
          id: "site-vn",
          name: "2 Mile Reef",
          countryCode: "VN",
          regionId: null,
        },
      ],
    ]),
    regions: new Map([
      [
        "region-sodwana",
        { id: "region-sodwana", name: "Sodwana", countryCode: "ZA" },
      ],
    ]),
    people: new Map([
      ["person-sam", { id: "person-sam", name: "Sam Naidoo" }],
      ["person-sam-n", { id: "person-sam-n", name: "Sam N" }],
      ["person-lerato", { id: "person-lerato", name: "Lerato Mokoena" }],
    ]),
    diveCentres: new Map(),
    trips: new Map([
      ["trip-july", { id: "trip-july", name: "Sodwana, July 2026" }],
    ]),
    links: new Map(
      dives.map((d) => [
        d.id,
        { buddies: buddies[d.id] ?? [], professionals: [], tags: [] },
      ])
    ),
    fieldMeta: new Map(),
    pending: new Set<string>(),
  } as unknown as LogView
}

describe("likely duplicates", () => {
  it("pairs number words with digits, initials, and a name inside another", () => {
    expect(likelySameName("2 Mile Reef", "Two Mile Reef")).toBe(true)
    expect(likelySameName("Sam N", "Sam Naidoo")).toBe(true)
    expect(likelySameName("Sam N.", "Sam Naidoo")).toBe(true)
    expect(likelySameName("Coral Edge", "Coral Edge Diving")).toBe(true)
    expect(likelySameName("Long Beach ", "long beach")).toBe(true)
    // A double-barrelled surname is still one word to initial.
    expect(
      likelySameName("Aleksandra W", "Aleksandra Wiśniewska-Kowalczyk")
    ).toBe(true)
  })

  it("leaves names that only start alike", () => {
    expect(likelySameName("Sodwana, July 2026", "Sodwana, Easter")).toBe(false)
    expect(likelySameName("Seven Mile Reef", "Two Mile Reef")).toBe(false)
    expect(likelySameName("Sam Naidoo", "Sam Nkosi")).toBe(false)
    // Too short to say.
    expect(likelySameName("A", "A Frame")).toBe(false)
    // A number is no initial.
    expect(likelySameName("Wreck 1", "Wreck 12")).toBe(false)
    expect(likelySameName("Reef One", "Reef Twelve")).toBe(false)
  })

  it("points the less used at the more used, within one country", () => {
    const log = view([])
    const found = duplicates(
      log,
      "site",
      new Map([
        ["site-two-mile", 18],
        ["site-2-mile", 1],
        ["site-vn", 0],
      ])
    )
    expect(found.get("site-2-mile")?.name).toBe("Two Mile Reef")
    expect(found.has("site-two-mile")).toBe(false)
    // The Vietnamese one is in another country, so it can't be merged.
    expect(found.has("site-vn")).toBe(false)
    const people = duplicates(
      log,
      "person",
      new Map([
        ["person-sam", 22],
        ["person-sam-n", 1],
      ])
    )
    expect(people.get("person-sam-n")?.name).toBe("Sam Naidoo")
    expect(people.has("person-lerato")).toBe(false)
  })
})

describe("figures", () => {
  const dives = [
    dive("dive-a", { startTime: "2024-03-02T09:00:00", maxDepth: 18 }),
    dive("dive-b", { startTime: "2026-07-25T09:00:00", maxDepth: 32.7 }),
    // Ignored and deleted dives count for nothing here.
    dive("dive-c", {
      startTime: "2026-07-26T09:00:00",
      maxDepth: 40,
      ignored: true,
    }),
    dive("dive-d", {
      startTime: "2026-07-27T09:00:00",
      maxDepth: 45,
      deletedAt: "2026-10-01T00:00:00Z",
    }),
  ]

  it("gives a site its dives, deepest and last dive", () => {
    expect(figuresOf(view(dives), "site", "site-two-mile").figures).toEqual([
      { term: "Dives", value: 2, kind: "count" },
      { term: "Deepest", value: 32.7, kind: "depth" },
      { term: "Last dive", value: "2026-07-25T09:00:00", kind: "date" },
    ])
  })

  it("gives a person dives together, as buddy and buddy since", () => {
    const log = view(
      [...dives, dive("dive-e", { startTime: "2025-01-01T09:00:00" })],
      {
        "dive-a": ["person-sam"],
        "dive-b": ["person-sam"],
        "dive-c": ["person-sam"],
      }
    )
    log.links.get("dive-e")!.professionals.push("person-sam")
    const { figures, since } = figuresOf(log, "person", "person-sam")
    expect(figures.map((f) => [f.term, f.value])).toEqual([
      ["Dives together", 3],
      ["As buddy", 2],
      ["Last dive", "2026-07-25T09:00:00"],
    ])
    expect(since).toBe("March 2024")
  })

  it("dates a trip from its dives", () => {
    const trip = [
      dive("dive-1", {
        tripId: "trip-july",
        startTime: "2026-07-18T09:00:00",
        maxDepth: 12,
      }),
      dive("dive-2", {
        tripId: "trip-july",
        startTime: "2026-07-18T14:00:00",
        maxDepth: 30,
      }),
      dive("dive-3", {
        tripId: "trip-july",
        startTime: "2026-07-27T09:00:00",
        maxDepth: 20,
      }),
    ]
    expect(tripDates(trip)).toEqual({ text: "18 – 27 Jul 2026", days: 2 })
    expect(
      figuresOf(view(trip), "trip", "trip-july").figures.map((f) => f.value)
    ).toEqual([3, 2, 30])
    expect(
      tripDates([
        dive("dive-x", { startTime: "2025-12-28T09:00:00" }),
        dive("dive-y", { startTime: "2026-01-03T09:00:00" }),
      ])?.text
    ).toBe("28 Dec 2025 – 3 Jan 2026")
  })
})

describe("usedBy", () => {
  it("blocks a delete while anything uses it, deleted dives included", () => {
    const log = view([
      dive("dive-d", {
        siteId: "site-2-mile",
        deletedAt: "2026-10-01T00:00:00Z",
      }),
    ])
    expect(usedBy(log, "site", "site-2-mile")).toBe(
      "1 dive in Recently deleted"
    )
    expect(usedBy(log, "site", "site-vn")).toBe("")
    expect(usedBy(log, "region", "region-sodwana")).toBe("2 sites")
    // Deleting a trip unlinks its dives instead.
    expect(usedBy(log, "trip", "trip-july")).toBe("")
  })
})

describe("merging", () => {
  it("offers sites across countries but suggests them only within one", () => {
    const log = view([])
    expect(
      mergeCandidates(log, "site", "site-two-mile").map((site) => site.id)
    ).toEqual(["site-2-mile", "site-vn"])
  })

  it("leaves out what only a draft has created", () => {
    const log = view([])
    log.pending.add("site-2-mile")
    expect(
      mergeCandidates(log, "site", "site-two-mile").map((site) => site.id)
    ).toEqual(["site-vn"])
    expect(duplicates(log, "site", new Map([["site-two-mile", 18]])).size).toBe(
      0
    )
  })

  it("holds a trip back while a dive on the phone uses it", () => {
    const log = view([
      dive("dive-new", { tripId: "trip-july", draft: true } as Partial<Dive>),
    ])
    expect(usedBy(log, "trip", "trip-july")).toBe("1 dive not synced yet")
  })
})
