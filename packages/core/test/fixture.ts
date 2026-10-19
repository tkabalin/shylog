import { DOMParser, type Element } from "@xmldom/xmldom"

import type { Sample } from "../src/calc/samples.ts"
import { fractionToTenths, kelvinToCelsius } from "../src/units.ts"
import uddf from "../../../fixtures/subsurface/d4i-2026-10-12.uddf?raw"

// Test-only reader for the real D4i export, so calculations are checked
// against real dives. Dives are looked up by Subsurface's divenumber.
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

let dives: Map<number, FixtureDive> | undefined

function read() {
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

export function fixtureDive(number: number): FixtureDive {
  dives ??= read()
  const dive = dives.get(number)
  if (!dive) throw new Error(`No dive ${number} in the fixture`)
  return dive
}

// The 46 scuba dives: every dive with a gas, as freedives have none.
export function fixtureScubaDives(): FixtureDive[] {
  dives ??= read()
  return [...dives.values()].filter((dive) => dive.mix != null)
}
