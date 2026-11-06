import {
  cubicMetresToMillilitres,
  diveFieldsPatch,
  fractionToTenths,
  kelvinToCelsius,
  mergeDuplicateSamples,
  pascalsToBar,
  type Sample,
} from "@shylog/core"
import { DOMParser, type Element } from "@xmldom/xmldom"

// Reads a Subsurface export, or Shylog's own, into what the import and the
// seed script store: each dive's computer figures, gas and tank, weight,
// notes, samples and alarms. Subsurface's placeholders carry no data and
// read as nothing, whatever the computer.

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
  // °C, only where the file gives one: the D4i's minimum comes from its
  // samples.
  minTemperature: number | null
  // Tenths of a per cent; null is air.
  oxygen: number | null
  // Millilitres and bar.
  cylinderVolume: number | null
  startPressure: number | null
  endPressure: number | null
  // Kilograms.
  weight: number | null
  notes: string | null
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
const children = (parent: Element, name: string) =>
  all(parent, name).filter((child) => child.parentNode === parent)
const celsius = (kelvin: number | null) =>
  kelvin == null ? null : kelvinToCelsius(kelvin)
const bar = (pascals: number | null) =>
  pascals == null ? null : pascalsToBar(pascals)

// A dive the database wouldn't take would fail part-way through an import,
// so the whole file is refused instead, naming the dive and the figure.
function refuse(position: number, what: string): never {
  throw new Error(`Dive ${position} in the file has no valid ${what}`)
}
const labels: Record<string, string> = {
  startTime: "start time",
  duration: "duration",
  maxDepth: "depth",
  averageDepth: "average depth",
  minTemperature: "minimum temperature",
  weight: "weight",
  cylinderVolume: "cylinder volume",
  startPressure: "start pressure",
  endPressure: "end pressure",
  notes: "notes",
}

// Air is written as 0.21 and read as air, as Subsurface does; core
// takes nitrox from 21.1 %.
export const air = 210

// The D4i writes each ascent alarm as a pair, matched in order, and marks
// surfacings with single alarms.
function events(waypoints: Element[], times: number[]): ProfileEvent[] {
  const found: ProfileEvent[] = []
  let ascent: number | null = null
  for (const [i, waypoint] of waypoints.entries()) {
    const time = times[i]
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
  // A dive names its computer by a link. Subsurface's export from one
  // computer leaves every link out; in a file that links any (Shylog's), a
  // dive without one was logged by hand.
  const linked = (dive: Element) =>
    all(dive, "link")
      .map((link) => computers.get(link.getAttribute("ref")))
      .find((model) => model !== undefined)
  const anyLinked = all(root, "dive").some((dive) => linked(dive) !== undefined)
  const computerOf = (dive: Element) =>
    linked(dive) ??
    (!anyLinked && computers.size === 1 ? [...computers.values()][0] : null)
  const mixes = new Map(
    all(root, "mix").map((mix) => [
      mix.getAttribute("id"),
      fractionToTenths(number(mix, "o2")!),
    ])
  )

  return all(root, "dive").flatMap((dive, i) => {
    const position = i + 1
    const tank = all(dive, "tankdata")[0]
    if (!tank) return []
    // The gas the dive starts on is the switchmix at 0 s; without one, the
    // tank's links name its mix, alongside the tank, in either order.
    const switchmix = all(dive, "switchmix").find(
      (gas) => number(gas.parentNode as Element, "divetime") === 0
    )
    const o2 = [switchmix, ...(tank ? all(tank, "link") : [])]
      .map((link) => link && mixes.get(link.getAttribute("ref")))
      .find((fraction) => fraction !== undefined)
    const waypoints = all(dive, "waypoint")
    const written = waypoints.map((waypoint) => {
      const time = number(waypoint, "divetime")
      const depth = number(waypoint, "depth")
      if (time == null || !Number.isInteger(time) || time < 0)
        refuse(position, "sample time")
      if (depth == null || !Number.isFinite(depth))
        refuse(position, "sample depth")
      return {
        time,
        depth,
        temperature: celsius(number(waypoint, "temperature")),
        pressure: bar(number(waypoint, "tankpressure")),
      }
    })
    const samples = mergeDuplicateSamples(written)
    // Merging only joins neighbours, so a time out of order would break the
    // samples' key, or an ascent pair's end before its start.
    if (
      samples.some((sample, i) => i > 0 && sample.time <= samples[i - 1].time)
    )
      refuse(position, "sample time")
    const volume = tank && number(tank, "tankvolume")
    // Subsurface writes the weight under informationbeforedive, and 0 when
    // none was logged; UDDF and Shylog put it under informationafterdive,
    // where 0 kg is a weight someone entered.
    const before = all(dive, "informationbeforedive")[0]
    const after = all(dive, "informationafterdive")[0]
    const weight =
      (after && number(after, "leadquantity")) ??
      ((before && number(before, "leadquantity")) || null)
    // The dive's own notes, not the notable animals under observations.
    // Subsurface writes an empty paragraph when there are none.
    const notes =
      (after &&
        children(after, "notes")
          .flatMap((note) => children(note, "para"))
          .map((para) => para.textContent?.trim())
          .filter(Boolean)
          .join("\n\n")) ||
      null
    // The figures must pass the rules a dive saved in the app does, so what
    // an import stores always fits the database. Start, duration and depth
    // must be there; the start is site time with no offset.
    const figures = {
      startTime: text(dive, "datetime"),
      duration: number(dive, "diveduration"),
      maxDepth: number(dive, "greatestdepth"),
      averageDepth: number(dive, "averagedepth"),
      minTemperature: celsius(number(dive, "lowesttemperature")),
      cylinderVolume: volume ? cubicMetresToMillilitres(volume) : null,
      startPressure: tank ? bar(number(tank, "tankpressurebegin")) : null,
      endPressure: tank ? bar(number(tank, "tankpressureend")) : null,
      weight,
      notes,
    }
    const { startTime, duration, maxDepth } = figures
    if (startTime == null) refuse(position, labels.startTime)
    if (duration == null) refuse(position, labels.duration)
    if (maxDepth == null) refuse(position, labels.maxDepth)
    const checked = diveFieldsPatch.safeParse(figures)
    if (!checked.success)
      refuse(position, labels[String(checked.error.issues[0].path[0])])
    return [
      {
        ...figures,
        startTime,
        duration,
        maxDepth,
        // Trimmed, with characters XML can't hold dropped.
        notes: checked.data.notes ?? null,
        oxygen: o2 == null || o2 <= air ? null : o2,
        computerModel: computerOf(dive),
        samples,
        events: events(
          waypoints,
          written.map((sample) => sample.time)
        ),
      },
    ]
  })
}
