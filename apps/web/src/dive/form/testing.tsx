import { act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { defaultSettings } from "@shylog/core"

import type { Dive, FieldMeta, Region, Site } from "@/data/db"
import type { LogView } from "@/data/log"

// Test helpers for the form and its pickers: a small log, and rendering
// with React's own act, so no testing library is needed.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom has neither matchMedia, which picks the phone or desktop layout and
// the motion preference, nor scrollIntoView or scrollTo. Every query is
// false, so the form renders as on a phone, and scrolling does nothing.
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.scrollTo ??= () => {}
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList

export function testDive(fields: Partial<Dive> & { id: string }): Dive {
  return {
    number: 1,
    startTime: "2026-07-22T08:10:00",
    siteId: "site-za-long-beach",
    duration: 2520,
    maxDepth: 20,
    diveType: "recreation",
    trainingAgency: null,
    trainingCourse: null,
    tripId: null,
    diveCentreId: null,
    entry: null,
    current: null,
    surge: null,
    surface: null,
    weather: null,
    minTemperature: null,
    maxTemperature: null,
    visibility: null,
    visibilityRating: null,
    workload: null,
    thermalComfort: null,
    averageDepth: null,
    surfaceInterval: "none",
    surfaceIntervalOverride: false,
    weight: null,
    cylinderMaterial: null,
    cylinderVolume: null,
    nitrox: false,
    oxygen: null,
    startPressure: null,
    endPressure: null,
    notableAnimals: null,
    gearDetails: null,
    notes: null,
    ignored: false,
    computerModel: null,
    cns: null,
    otu: null,
    sparkline: null,
    ascentAlarmCount: 0,
    sampleDuration: null,
    sampleAverageDepth: null,
    deletedAt: null,
    ...fields,
  } as Dive
}

export const testSites: Site[] = [
  {
    id: "site-za-long-beach",
    name: "Long Beach",
    countryCode: "ZA",
    regionId: "region-simons-town",
    bodyOfWater: "oceanSea",
    waterType: "salt",
  },
  {
    id: "site-vn-long-beach",
    name: "Long Beach",
    countryCode: "VN",
    regionId: null,
    bodyOfWater: "oceanSea",
    waterType: "salt",
  },
  {
    id: "site-two-mile",
    name: "Two Mile Reef",
    countryCode: "ZA",
    regionId: "region-sodwana",
    bodyOfWater: "oceanSea",
    waterType: "salt",
  },
]

export const testRegions: Region[] = [
  { id: "region-simons-town", name: "Simon's Town", countryCode: "ZA" },
  { id: "region-sodwana", name: "Sodwana", countryCode: "ZA" },
]

export function testLog({
  dives = [],
  meta = [],
  links = [],
}: {
  dives?: Dive[]
  meta?: FieldMeta[]
  links?: {
    diveId: string
    type: "buddy" | "professional" | "tag"
    target: string
  }[]
} = {}): LogView {
  const linkMap: LogView["links"] = new Map()
  for (const link of links) {
    const entry = linkMap.get(link.diveId) ?? {
      buddies: [],
      professionals: [],
      tags: [],
    }
    ;(link.type === "buddy"
      ? entry.buddies
      : link.type === "professional"
        ? entry.professionals
        : entry.tags
    ).push(link.target)
    linkMap.set(link.diveId, entry)
  }
  const fieldMeta: LogView["fieldMeta"] = new Map()
  for (const row of meta) {
    if (!fieldMeta.has(row.diveId)) fieldMeta.set(row.diveId, new Map())
    fieldMeta.get(row.diveId)!.set(row.field, row)
  }
  return {
    version: "v1",
    settings: defaultSettings as LogView["settings"],
    dives: [...dives].sort((a, b) => b.startTime.localeCompare(a.startTime)),
    dive: new Map(dives.map((dive) => [dive.id, dive])),
    sites: new Map(testSites.map((site) => [site.id, site])),
    regions: new Map(testRegions.map((region) => [region.id, region])),
    people: new Map([
      ["person-sam", { id: "person-sam", name: "Sam Naidoo" }],
      ["person-lerato", { id: "person-lerato", name: "Lerato Mokoena" }],
    ]),
    diveCentres: new Map([
      [
        "centre-coral",
        { id: "centre-coral", name: "Coral Edge Diving", regionId: null },
      ],
    ]),
    trips: new Map([
      ["trip-sodwana", { id: "trip-sodwana", name: "Sodwana, July 2026" }],
    ]),
    links: linkMap,
    fieldMeta,
    cards: [],
    pending: new Set(),
  }
}

export function render(ui: ReactNode) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(ui))
  return {
    container,
    rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

// React tracks an input's value itself, so a test sets it through the
// native setter and fires the event React listens for.
export function type(input: Element | null, value: string) {
  if (!(
    input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
  ))
    throw new Error("Not an input")
  const proto = Object.getPrototypeOf(input) as object
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

export function click(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error("Nothing to click")
  act(() => element.click())
}

// The button or link whose accessible text (aria-label or content) matches.
export function button(name: string | RegExp, root: ParentNode = document) {
  const matches = (text: string | null) =>
    text != null &&
    (typeof name === "string" ? text.trim() === name : name.test(text.trim()))
  return [
    ...root.querySelectorAll<HTMLElement>("button, a, [role=option]"),
  ].find(
    (el) => matches(el.getAttribute("aria-label")) || matches(el.textContent)
  )
}
