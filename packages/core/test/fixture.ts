import { DOMParser, type Element } from "@xmldom/xmldom"

import type { Sample } from "../src/calc/samples.ts"
import { fractionToTenths, kelvinToCelsius } from "../src/units.ts"
import d4i from "../../../fixtures/subsurface/d4i-2026-10-12.uddf?raw"
import zoopNovo from "../../../fixtures/subsurface/zoop-novo-2026-11-01.uddf?raw"

// Test-only reader for the real exports, so calculations are checked against
// real dives. D4i dives are looked up by Subsurface's divenumber, and either
// export's by start time.
export interface FixtureDive {
  number: number
  startTime: string
  duration: number
  maxDepth: number
  averageDepth: number
  // The exported mix in tenths of a per cent; freedives have none.
  mix: number | null
  // As an import reads the mix: 21 % is air (D9), anything else nitrox.
  nitrox: boolean
  oxygen: number | null
  // As exported, repeated times included.
  samples: Sample[]
  // Times of the samples carrying an alarm, as the import stores events.
  alarmTimes: number[]
}

const ns = "http://www.streit.cc/uddf/3.2/"

const children = (parent: Element, name: string) =>
  Array.from(parent.getElementsByTagNameNS(ns, name))
const text = (parent: Element, name: string) =>
  children(parent, name)[0]?.textContent ?? null
const number = (parent: Element, name: string) => Number(text(parent, name))

const exports = { d4i, zoopNovo }
const read = new Map<keyof typeof exports, Map<number, FixtureDive>>()

function readExport(uddf: string) {
  const doc = new DOMParser().parseFromString(uddf, "text/xml")
  const mixes = new Map(
    children(doc.documentElement!, "mix").map((mix) => [
      mix.getAttribute("id"),
      fractionToTenths(number(mix, "o2")),
    ])
  )
  return new Map(
    children(doc.documentElement!, "dive").map((dive) => {
      const mix = children(dive, "tankdata")[0]
        ?.getElementsByTagNameNS(ns, "link")[0]
        ?.getAttribute("ref")
      const o2 = mix ? mixes.get(mix)! : null
      const nitrox = o2 != null && o2 !== 210
      const waypoints = children(dive, "waypoint")
      const samples = waypoints.map((waypoint) => {
        const kelvin = text(waypoint, "temperature")
        return {
          time: number(waypoint, "divetime"),
          depth: number(waypoint, "depth"),
          temperature: kelvin == null ? null : kelvinToCelsius(Number(kelvin)),
          pressure: null,
        }
      })
      const entry: FixtureDive = {
        number: number(dive, "divenumber"),
        startTime: text(dive, "datetime")!,
        duration: number(dive, "diveduration"),
        maxDepth: number(dive, "greatestdepth"),
        averageDepth: number(dive, "averagedepth"),
        mix: o2,
        nitrox,
        oxygen: nitrox ? o2 : null,
        samples,
        alarmTimes: waypoints
          .filter((waypoint) => children(waypoint, "alarm").length)
          .map((waypoint) => number(waypoint, "divetime")),
      }
      return [entry.number, entry]
    })
  )
}

function divesOf(from: keyof typeof exports) {
  if (!read.has(from)) read.set(from, readExport(exports[from]))
  return read.get(from)!
}

export function fixtureDive(number: number): FixtureDive {
  const dive = divesOf("d4i").get(number)
  if (!dive) throw new Error(`No dive ${number} in the fixture`)
  return dive
}

// The 46 scuba dives: every dive with a gas, as freedives have none.
export function fixtureScubaDives(): FixtureDive[] {
  return [...divesOf("d4i").values()].filter((dive) => dive.mix != null)
}

// The dive starting at a time, such as "2026-04-04T16:22", in either export.
export function fixtureDiveAt(
  start: string,
  from: keyof typeof exports = "d4i"
): FixtureDive {
  const dive = [...divesOf(from).values()].find((d) =>
    d.startTime.startsWith(start)
  )
  if (!dive) throw new Error(`No dive at ${start} in the ${from} export`)
  return dive
}
