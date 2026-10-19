import {
  fractionToTenths,
  kelvinToCelsius,
  mergeDuplicateSamples,
  type Sample,
} from "@shylog/core"
import { DOMParser, type Element } from "@xmldom/xmldom"

// A small reader for seeding (D1): enough of a Subsurface export for dives,
// samples, alarms and the gas. The Suunto import grows out of it later.

export interface ProfileEvent {
  type: string
  // Seconds into the dive; an ascent alarm spans its pair.
  start: number
  end: number | null
}

export interface ReadDive {
  startTime: string
  duration: number
  maxDepth: number
  averageDepth: number | null
  // Tenths of a per cent; null is air.
  oxygen: number | null
  computerModel: string | null
  // Merged, one per time.
  samples: Sample[]
  events: ProfileEvent[]
}

const ns = "http://www.streit.cc/uddf/3.2/"
const all = (parent: Element, name: string) =>
  Array.from(parent.getElementsByTagNameNS(ns, name))
const text = (parent: Element, name: string) =>
  all(parent, name)[0]?.textContent?.trim() || null
const number = (parent: Element, name: string) => {
  const value = text(parent, name)
  return value == null ? null : Number(value)
}

// Air is written as 0.21 and read as air, as Subsurface does (D9); core
// takes nitrox from 21.1 %.
const air = 210

// The D4i writes each ascent alarm as a pair, matched in order, and marks
// surfacings with single alarms.
function events(waypoints: Element[]): ProfileEvent[] {
  const found: ProfileEvent[] = []
  let ascent: number | null = null
  for (const waypoint of waypoints) {
    const time = number(waypoint, "divetime")!
    for (const alarm of all(waypoint, "alarm")) {
      const type = alarm.textContent?.trim() ?? ""
      if (type !== "ascent") {
        found.push({ type, start: time, end: null })
      } else if (ascent == null) {
        ascent = time
      } else {
        found.push({ type, start: ascent, end: time })
        ascent = null
      }
    }
  }
  if (ascent != null) found.push({ type: "ascent", start: ascent, end: null })
  return found
}

// Scuba dives only. A freedive has no tank data, the one sign this reader
// uses; the import applies the full rule.
export function readUddf(xml: string): ReadDive[] {
  const root = new DOMParser().parseFromString(xml, "text/xml").documentElement
  if (!root) throw new Error("Not an XML document")
  const computers = new Map(
    all(root, "divecomputer").map((computer) => [
      computer.getAttribute("id"),
      text(computer, "model"),
    ])
  )
  // A dive names its computer by a link; an export from one computer
  // (Subsurface's) may leave the link out.
  const computerOf = (dive: Element) => {
    for (const link of all(dive, "link")) {
      const model = computers.get(link.getAttribute("ref"))
      if (model !== undefined) return model
    }
    return computers.size === 1 ? [...computers.values()][0] : null
  }
  const mixes = new Map(
    all(root, "mix").map((mix) => [
      mix.getAttribute("id"),
      fractionToTenths(number(mix, "o2")!),
    ])
  )

  return all(root, "dive").flatMap((dive) => {
    const tank = all(dive, "tankdata")[0]
    if (!tank) return []
    const mix = all(tank, "link")[0]?.getAttribute("ref")
    const o2 = mix ? mixes.get(mix) : undefined
    const waypoints = all(dive, "waypoint")
    const samples = mergeDuplicateSamples(
      waypoints.map((waypoint) => {
        const kelvin = number(waypoint, "temperature")
        return {
          time: number(waypoint, "divetime")!,
          depth: number(waypoint, "depth")!,
          temperature: kelvin == null ? null : kelvinToCelsius(kelvin),
          pressure: null,
        }
      })
    )
    return [
      {
        startTime: text(dive, "datetime")!,
        duration: number(dive, "diveduration")!,
        maxDepth: number(dive, "greatestdepth")!,
        averageDepth: number(dive, "averagedepth"),
        oxygen: o2 == null || o2 <= air ? null : o2,
        computerModel: computerOf(dive),
        samples,
        events: events(waypoints),
      },
    ]
  })
}
