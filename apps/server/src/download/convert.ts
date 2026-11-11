import { underwater } from "@shylog/core"
import { DOMParser, type Element } from "@xmldom/xmldom"

import { downloadGeneratorName } from "../uddf/shylog-namespace.ts"
import { element, leaf, type Xml } from "../uddf/xml.ts"

// Turns what dctool parses from a download into the UDDF Subsurface would
// have exported for the same dives, so the import reads both alike and a
// dive gets the fingerprint its exported self got. The rules come from
// Subsurface's libdivecomputer.cpp, fixup_dive() and uddf-export.xslt.

// One dive as `dctool parse` writes it.
export type DctoolDive = string

interface Event {
  time: number
  name: string
  flags: number
}

interface Sample {
  time: number
  depth: number
  temperature: number | null
  gasmix: number | null
}

// libdivecomputer's names for the events Subsurface's UDDF export writes,
// as the alarms it writes them as; it leaves the rest out. Its deco alarm
// for a violation is left out too, as here a deco alarm is a mandatory stop
// (neither watch reports a violation).
const alarms: Record<string, string> = {
  ascent: "ascent",
  surface: "surface",
  divetime: "rbt",
  ceiling: "error",
  unknown: "error",
}

// Stock libdivecomputer reports no stop events for these watches, so
// Subsurface never saw them. The image's patched build does, and the moment
// a stop becomes mandatory is kept as a UDDF deco alarm, begin and end.
const stopEvents = new Set([
  "safety stop (mandatory)",
  "safety stop (voluntary)",
])
const mandatoryStop = "safety stop (mandatory)"

const minutesSeconds = (value: string) => {
  const [minutes, seconds] = value.split(":").map(Number)
  return minutes * 60 + seconds
}
const child = (parent: Element, name: string) =>
  Array.from(parent.childNodes).find(
    (node): node is Element => (node as Element).localName === name
  )
const childText = (parent: Element, name: string) =>
  child(parent, name)?.textContent?.trim() ?? null
const childrenNamed = (parent: Element, name: string) =>
  Array.from(parent.childNodes).filter(
    (node): node is Element => (node as Element).localName === name
  )

// A mix's id, from its oxygen and helium percentages, as Subsurface makes
// them but valid as an XML id.
const percent = (value: number) => String(Math.round(value * 10) / 10)
const mixId = (mix: Mix) => `mix-${percent(mix.o2)}-${percent(mix.he)}`
interface Mix {
  o2: number
  he: number
}

// add_event() keeps the events in time order, a new one after any at its
// second.
function insertEvent(events: Event[], event: Event) {
  const at = events.findIndex((found) => found.time > event.time)
  events.splice(at === -1 ? events.length : at, 0, event)
}

// fixup_dc_events(): an event repeating one of the same name and flags up
// to a minute before it is dropped. The first event is never compared, and
// gas changes are kept.
function dropRepeats(events: Event[]) {
  const dropped = new Set<number>()
  events.forEach((event, i) => {
    if (event.name === "bookmark" || event.name === "heading") return
    for (let j = i - 1; j > 0; j--) {
      const earlier = events[j]
      if (event.time - earlier.time > 60) break
      if (dropped.has(j)) continue
      if (
        event.name !== "gaschange" &&
        earlier.name === event.name &&
        earlier.flags === event.flags
      ) {
        dropped.add(i)
        break
      }
    }
  })
  return events.filter((_, i) => !dropped.has(i))
}

function readDive(xml: DctoolDive) {
  const root = new DOMParser().parseFromString(xml, "text/xml").documentElement
  const dive = root && (root.localName === "dive" ? root : child(root, "dive"))
  if (!dive) throw new Error("dctool wrote no dive")
  const mixes = childrenNamed(dive, "gasmix").map((mix) => ({
    o2: Number(childText(mix, "o2") ?? 0),
    he: Number(childText(mix, "he") ?? 0),
  }))
  const samples: Sample[] = []
  const events: Event[] = []
  const stops: Event[] = []
  for (const node of childrenNamed(dive, "sample")) {
    const time = minutesSeconds(childText(node, "time") ?? "0:00")
    const temperature = childText(node, "temperature")
    const gasmix = childText(node, "gasmix")
    samples.push({
      time,
      depth: Number(childText(node, "depth") ?? 0),
      temperature: temperature == null ? null : Number(temperature),
      gasmix: gasmix == null ? null : Number(gasmix),
    })
    // A gas change counts as an event at its sample, before the sample's own.
    if (gasmix != null)
      insertEvent(events, {
        time,
        name: "gaschange",
        flags: Number(gasmix) + 1,
      })
    for (const found of childrenNamed(node, "event")) {
      const event = {
        time: time + Number(found.getAttribute("time") ?? 0),
        name: found.textContent?.trim() ?? "",
        flags: Number(found.getAttribute("flags") ?? 0),
      }
      if (stopEvents.has(event.name)) stops.push(event)
      else insertEvent(events, event)
    }
  }
  return {
    start: (childText(dive, "datetime") ?? "").replace(" ", "T"),
    divetime: minutesSeconds(childText(dive, "divetime") ?? "0:00"),
    maxDepth: Number(childText(dive, "maxdepth") ?? 0),
    mixes,
    samples,
    events: dropRepeats(events),
    stops: mandatoryStops(stops),
  }
}

// Each mandatory stop's begin and end second, by the event's begin (1) and
// end (2) flags: a second begin while one is open, or an end with none,
// adds nothing, and a stop the dive ended in has no end.
function mandatoryStops(events: Event[]) {
  const spans: { start: number; end: number | null }[] = []
  let open: number | null = null
  for (const event of events
    .filter((found) => found.name === mandatoryStop)
    .sort((a, b) => a.time - b.time)) {
    if (event.flags === 1 && open == null) open = event.time
    if (event.flags === 2 && open != null) {
      spans.push({ start: open, end: event.time })
      open = null
    }
  }
  if (open != null) spans.push({ start: open, end: null })
  return spans
}

// A dive's start on the watch's clock, as the import reads it.
export const diveStart = (xml: DctoolDive) => readDive(xml).start

const mm = (metres: number) => Math.round(metres * 1000)

// uddf-export.xslt's depth for an event between samples: straight between
// the samples either side, to the centimetre.
function depthAt(samples: readonly Sample[], time: number) {
  const before = samples.findLast((sample) => sample.time <= time)
  const after = samples.find((sample) => sample.time >= time)
  const depth =
    before && after && before.time !== after.time
      ? ((time - before.time) / (after.time - before.time)) *
          (mm(after.depth) - mm(before.depth)) +
        mm(before.depth)
      : mm((before ?? after)?.depth ?? 0)
  return Math.round(depth / 10) / 100
}

interface Waypoint {
  time: number
  depth: number
  alarms: string[]
  mix: Mix | null
  temperature: number | null
}

function convertDive(dive: ReturnType<typeof readDive>, id: string): Xml {
  const mixOf = (index: number | null) =>
    index == null ? null : (dive.mixes[index] ?? null)
  // fixup_dc_temp() keeps a temperature only where it changed.
  let last: number | null = null
  const waypoints: Waypoint[] = dive.samples.map((sample) => {
    const changed =
      sample.temperature != null && sample.temperature !== last
        ? sample.temperature
        : null
    if (sample.temperature != null) last = sample.temperature
    return {
      time: sample.time,
      depth: Math.round(sample.depth * 100) / 100,
      alarms: [],
      mix: mixOf(sample.gasmix),
      temperature: changed,
    }
  })
  const sampled = new Set(dive.samples.map((sample) => sample.time))
  // An event at a sample's second goes on that sample's waypoint; one
  // between samples gets its own, at the depth between them.
  const waypointAt = (time: number, share: boolean) => {
    const found =
      sampled.has(time) || share
        ? waypoints.find((waypoint) => waypoint.time === time)
        : undefined
    if (found) return found
    const added: Waypoint = {
      time,
      depth: depthAt(dive.samples, time),
      alarms: [],
      mix: null,
      temperature: null,
    }
    waypoints.push(added)
    return added
  }
  for (const event of dive.events) {
    if (event.name === "gaschange") continue
    // The export writes a waypoint for each event between samples, even
    // one it writes no alarm for.
    const waypoint = waypointAt(event.time, false)
    if (alarms[event.name]) waypoint.alarms.push(alarms[event.name])
  }
  // Subsurface writes no stop, so its alarm joins any waypoint at its time.
  for (const stop of dive.stops) {
    waypointAt(stop.start, true).alarms.push("deco")
    if (stop.end != null) waypointAt(stop.end, true).alarms.push("deco")
  }
  waypoints.sort((a, b) => a.time - b.time)

  const figures = underwater(
    dive.samples.map((sample) => ({
      time: sample.time,
      depth: sample.depth,
      temperature: null,
      pressure: null,
    }))
  )
  // fixup_dc_depths(): a sample below the surface deeper than the
  // computer's maximum raises it.
  const maxDepth = Math.max(
    mm(dive.maxDepth),
    ...dive.samples
      .map((sample) => mm(sample.depth))
      .filter((depth) => depth > 750)
  )
  const mix = dive.mixes[0]
  return element(
    "dive",
    [
      element("informationbeforedive", [leaf("datetime", dive.start)]),
      element(
        "samples",
        waypoints.map((waypoint) =>
          element("waypoint", [
            ...waypoint.alarms.map((alarm) => leaf("alarm", alarm)),
            leaf("depth", waypoint.depth),
            leaf("divetime", waypoint.time),
            waypoint.mix ? [`<switchmix ref="${mixId(waypoint.mix)}"/>`] : null,
            leaf(
              "temperature",
              waypoint.temperature == null
                ? null
                : (waypoint.temperature + 273.15).toFixed(2)
            ),
          ])
        )
      ),
      mix ? element("tankdata", [[`<link ref="${mixId(mix)}"/>`]]) : null,
      element("informationafterdive", [
        leaf("greatestdepth", maxDepth / 1000),
        leaf("averagedepth", figures?.averageDepth ?? null),
        leaf("diveduration", figures?.duration ?? dive.divetime),
      ]),
    ],
    ` id="${id}"`
  )
}

// The download as one UDDF file, the computer named as Subsurface names it
// ("Suunto D4i"), the dives in the order given.
export function downloadToUddf(
  dives: readonly { id: string; xml: DctoolDive }[],
  model: string
) {
  const mixes = new Map<string, Mix>()
  const converted = dives.map(({ id, xml }) => {
    const dive = readDive(xml)
    for (const mix of dive.mixes) mixes.set(mixId(mix), mix)
    return convertDive(dive, id)
  })
  const name = (mix: Mix) =>
    mix.he > 0
      ? `TMx ${percent(mix.o2)}/${percent(mix.he)}`
      : Math.round(mix.o2 * 10) === 210
        ? "air"
        : `EANx ${percent(mix.o2)}`
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    ...element(
      "uddf",
      [
        element("generator", [
          leaf("name", downloadGeneratorName),
          leaf("type", "converter"),
          element("manufacturer", [leaf("name", "Shylog")], ` id="shylog"`),
          leaf("version", "0.9.0"),
        ]),
        element("diver", [
          element(
            "owner",
            [
              element("personal", [
                leaf("firstname", "Owner"),
                leaf("lastname", "Owner"),
              ]),
              element("equipment", [
                element(
                  "divecomputer",
                  [leaf("name", model), leaf("model", model)],
                  ` id="computer"`
                ),
              ]),
            ],
            ` id="owner"`
          ),
        ]),
        mixes.size
          ? element("gasdefinitions", [
              ...[...mixes].map(([id, mix]) =>
                element(
                  "mix",
                  [
                    leaf("name", name(mix)),
                    leaf("o2", (mix.o2 / 100).toFixed(2)),
                    leaf("he", (mix.he / 100).toFixed(2)),
                  ],
                  ` id="${id}"`
                )
              ),
            ])
          : null,
        element("profiledata", [
          element("repetitiongroup", converted, ` id="group"`),
        ]),
      ],
      ` xmlns="http://www.streit.cc/uddf/3.2/" version="3.2.1"`
    ),
  ].join("\n")
}
