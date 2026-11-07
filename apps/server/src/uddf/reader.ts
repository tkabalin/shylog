import {
  airOxygen,
  bodiesOfWater,
  countryCodes,
  cubicMetresToMillilitres,
  currents,
  cylinderMaterials,
  diveFieldsPatch,
  diveTypes,
  entityFields,
  entries,
  fractionToTenths,
  kelvinToCelsius,
  mergeDuplicateSamples,
  pascalsToBar,
  surfaces,
  surges,
  tags,
  thermalComforts,
  visibilityRatings,
  waterTypes,
  weathers,
  workloads,
  type BodyOfWater,
  type CountryCode,
  type DiveFieldsPatch,
  type Sample,
  type WaterType,
} from "@shylog/core"
import { DOMParser, XMLSerializer, type Element } from "@xmldom/xmldom"

import {
  generatorName,
  shylogNamespace,
  uddfNamespace,
} from "./shylog-namespace.ts"

// Reads a Subsurface export, or Shylog's own, into what the import and the
// seed script store: each dive's computer figures, gas and tank, weight,
// notes, samples and alarms, and from Shylog's own export everything else
// it holds. Subsurface's placeholders carry no data and read as nothing,
// whatever the computer.

export interface ProfileEvent {
  type: string
  // Seconds into the dive; an ascent alarm spans its pair.
  start: number
  end: number | null
}

export interface ReadDive {
  // The export's own id for the dive, which only links within the file.
  ref: string
  startTime: string
  duration: number
  maxDepth: number
  averageDepth: number | null
  // °C, only where the file gives one: the D4i's minimum comes from its
  // samples.
  minTemperature: number | null
  // Tenths of a per cent; null is air.
  oxygen: number | null
  // Helium or under 20.9 % oxygen, which v1 can't hold: read as air, and
  // the import review says so.
  unsupportedGas: boolean
  // Millilitres and bar.
  cylinderVolume: number | null
  startPressure: number | null
  endPressure: number | null
  // Two of the freedive signs: Subsurface writes tank data for a cylinder,
  // and a switchmix to set its gas at the start.
  hasTankData: boolean
  hasGas: boolean
  // Kilograms.
  weight: number | null
  notes: string | null
  computerModel: string | null
  // Merged, one per time.
  samples: Sample[]
  events: ProfileEvent[]
  // The other standard fields, in Shylog's keys: computer values, as any
  // computer's would be, though only a logbook such as Shylog writes them.
  standard: Pick<DiveFieldsPatch, StandardField>
  site: ReadSite | null
  people: ReadPerson[]
  // Shylog's own block, from its own export only.
  own: OwnFields | null
  // Written by Shylog, so its figures are all the log held: none is
  // missing for the import to fill from the samples.
  fromShylog: boolean
  // The dive's element and the mixes it links to, kept in import_raw;
  // only read when asked for, as only apply keeps it.
  fragment: string | null
}

type StandardField =
  | "cylinderMaterial"
  | "entry"
  | "current"
  | "diveType"
  | "workload"
  | "thermalComfort"
  | "visibility"
  | "notableAnimals"

export interface ReadSite {
  name: string
  // Null where the file gives none, or one that isn't ISO 3166.
  countryCode: CountryCode | null
  region: string | null
  bodyOfWater: BodyOfWater | null
}

export interface ReadPerson {
  name: string
  professional: boolean
}

type OwnField =
  | "trainingAgency"
  | "trainingCourse"
  | "tags"
  | "surge"
  | "surface"
  | "weather"
  | "maxTemperature"
  | "visibilityRating"
  | "gearDetails"
  | "ignored"
  | "surfaceInterval"

// What Shylog's <shylog> holds: what no computer records, so the import
// takes these as the hand values they were.
export interface OwnFields {
  fields: Pick<DiveFieldsPatch, OwnField>
  trip: string | null
  diveCentre: {
    name: string
    region: { name: string; countryCode: CountryCode } | null
  } | null
  // Only where the site's body of water doesn't imply it.
  waterType: WaterType | null
}

const ns = uddfNamespace
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
// Paragraphs of text, as Shylog and Subsurface write notes.
const paragraphs = (notes: Element[]) =>
  notes
    .flatMap((note) => children(note, "para"))
    .map((para) => para.textContent?.trim())
    .filter(Boolean)
    .join("\n\n") || null
// A choice by the string UDDF or <shylog> gives it; one Shylog doesn't know
// is read as none rather than refusing the file.
function choiceOf<O extends Record<string, { label: string; uddf?: string }>>(
  options: O,
  value: string | null | undefined,
  by: "uddf" | "key" = "uddf"
) {
  if (value == null) return undefined
  return (Object.keys(options) as (keyof O & string)[]).find((key) =>
    by === "key" ? key === value : options[key].uddf === value
  )
}
// An entity's name as the app would save it, or null for one it wouldn't.
function entityName(value: string | null | undefined) {
  const parsed = entityFields.trip.safeParse({ name: value ?? "" })
  return parsed.success ? parsed.data.name : null
}
const country = (value: string | null) =>
  countryCodes.find((code) => code === value) ?? null
const celsius = (kelvin: number | null) =>
  kelvin == null ? null : kelvinToCelsius(kelvin)
const bar = (pascals: number | null) =>
  pascals == null ? null : pascalsToBar(pascals)

// A file the import can't take, with a reason fit to show the diver.
export class UnreadableUddf extends Error {}

// A dive the database wouldn't take would fail part-way through an import,
// so the whole file is refused instead, naming the dive and the figure.
function refuse(position: number, what: string): never {
  throw new UnreadableUddf(`Dive ${position} in the file has no valid ${what}`)
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
  visibility: "visibility",
  visibilityRating: "visibility rating",
  notableAnimals: "notable animals",
  maxTemperature: "maximum temperature",
  trainingAgency: "training agency",
  trainingCourse: "training course",
  gearDetails: "gear details",
  surfaceInterval: "surface interval",
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

// Every dive in the file, freedives included: import/freedive.ts decides
// which are left out.
export function readUddf(xml: string, { fragments = false } = {}): ReadDive[] {
  // xmldom throws on what it can't parse at all, and reports the rest,
  // which is read as it stands.
  let root: Element | null
  try {
    root = new DOMParser({ onError: () => {} }).parseFromString(
      xml,
      "text/xml"
    ).documentElement
  } catch {
    throw new UnreadableUddf("Not an XML document")
  }
  if (!root) throw new UnreadableUddf("Not an XML document")
  // Subsurface's own .xml log also has <dive>s, which would be refused for
  // a missing figure rather than as the wrong kind of file.
  if (root.localName !== "uddf") throw new UnreadableUddf("Not a UDDF file")
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
  const mixElements = new Map(
    all(root, "mix").map((mix) => [mix.getAttribute("id"), mix])
  )
  const mixes = new Map(
    [...mixElements].map(([id, mix]) => {
      // A mix that gives no oxygen is air, not a hypoxic mix to flag.
      const o2 = number(mix, "o2")
      return [
        id,
        {
          o2: o2 == null ? air : fractionToTenths(o2),
          he: fractionToTenths(number(mix, "he") ?? 0),
        },
      ]
    })
  )

  const sites = new Map(
    all(root, "site").map((site) => {
      const geography = all(site, "geography")[0]
      const name = entityName(text(site, "name"))
      return [
        site.getAttribute("id"),
        name
          ? {
              name,
              countryCode: geography
                ? country(text(geography, "country"))
                : null,
              region: geography
                ? entityName(text(geography, "location"))
                : null,
              bodyOfWater:
                choiceOf(bodiesOfWater, text(site, "environment")) ?? null,
            }
          : null,
      ]
    })
  )
  // The owner's name is under <owner>, so <buddy> holds only the others.
  const buddies = new Map(
    all(root, "buddy").map((buddy) => [
      buddy.getAttribute("id"),
      entityName(
        [text(buddy, "firstname"), text(buddy, "lastname")]
          .filter(Boolean)
          .join(" ")
      ),
    ])
  )
  // A cylinder type in the owner's equipment, linked from tank data.
  const materials = new Map(
    all(root, "tank").map((tank) => [
      tank.getAttribute("id"),
      choiceOf(cylinderMaterials, text(tank, "tankmaterial")),
    ])
  )
  const serializer = new XMLSerializer()
  const generator = all(root, "generator")[0]
  const fromShylog = !!generator && text(generator, "name") === generatorName

  // The preview names dives by their ids, so two alike would be confused.
  const refs = new Set<string>()
  return all(root, "dive").map((dive, i) => {
    const position = i + 1
    // Subsurface and Shylog both write one; the position stands in if not.
    const ref = dive.getAttribute("id") || `dive ${position}`
    if (refs.has(ref)) {
      throw new UnreadableUddf(
        `Dive ${position} in the file repeats another's id`
      )
    }
    refs.add(ref)
    const tank = all(dive, "tankdata")[0]
    // The gas the dive starts on is the switchmix at 0 s; without one, the
    // tank's links name its mix, alongside the tank, in either order.
    const switchmixes = all(dive, "switchmix")
    const switchmix = switchmixes.find(
      (gas) => number(gas.parentNode as Element, "divetime") === 0
    )
    const mix = [switchmix, ...(tank ? all(tank, "link") : [])]
      .map((link) => link && mixes.get(link.getAttribute("ref")))
      .find((found) => found !== undefined)
    const unsupportedGas =
      mix !== undefined && (mix.he > 0 || mix.o2 < airOxygen)
    // A trimix's oxygen alone would read as nitrox, so it is air too.
    const o2 = unsupportedGas ? undefined : mix?.o2
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
    const notes = after ? paragraphs(children(after, "notes")) : null
    const standard = {
      cylinderMaterial: (tank ? all(tank, "link") : [])
        .map((found) => materials.get(found.getAttribute("ref")))
        .find(Boolean),
      entry: choiceOf(entries, before && text(before, "platform")),
      current: choiceOf(currents, after && text(after, "current")),
      diveType: choiceOf(diveTypes, after && text(after, "program")),
      workload: choiceOf(workloads, after && text(after, "workload")),
      thermalComfort: choiceOf(
        thermalComforts,
        after && text(after, "thermalcomfort")
      ),
      visibility: (after && number(after, "visibility")) ?? undefined,
      notableAnimals:
        (after &&
          paragraphs(
            children(after, "observations").flatMap((o) => children(o, "notes"))
          )) ??
        undefined,
    }
    const own = readOwn(dive, before)
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
    const checked = diveFieldsPatch.safeParse({
      ...figures,
      ...standard,
      ...own?.fields,
    })
    if (!checked.success)
      refuse(position, labels[String(checked.error.issues[0].path[0])])
    const kept = <K extends keyof DiveFieldsPatch>(keys: readonly K[]) =>
      Object.fromEntries(
        keys.flatMap((key) =>
          checked.data[key] == null ? [] : [[key, checked.data[key]]]
        )
      ) as Pick<DiveFieldsPatch, K>
    const professionals = new Set(own?.professionals)
    const links = before
      ? children(before, "link").map((found) => found.getAttribute("ref"))
      : []
    const site = links.map((id) => sites.get(id)).find(Boolean) ?? null
    const people = [...new Set(links)].flatMap((id) => {
      const name = buddies.get(id)
      return name ? [{ name, professional: professionals.has(id!) }] : []
    })
    // The mixes it links to, by a tank or a gas switch, go with it.
    const linkedMixes = new Set(
      [...all(dive, "link"), ...all(dive, "switchmix")].map((found) =>
        found.getAttribute("ref")
      )
    )
    const fragment = fragments
      ? [
          `<fragment xmlns="${ns}">`,
          ...[...mixElements]
            .filter(([id]) => linkedMixes.has(id))
            .map(([, mix]) => serializer.serializeToString(mix)),
          serializer.serializeToString(dive),
          "</fragment>",
        ].join("")
      : null
    return {
      ...figures,
      ref,
      startTime,
      duration,
      maxDepth,
      // Trimmed, with characters XML can't hold dropped.
      notes: checked.data.notes ?? null,
      oxygen: o2 == null || o2 <= air ? null : o2,
      unsupportedGas,
      hasTankData: tank !== undefined,
      hasGas: switchmixes.length > 0,
      computerModel: computerOf(dive),
      samples,
      events: events(
        waypoints,
        written.map((sample) => sample.time)
      ),
      standard: kept([
        "cylinderMaterial",
        "entry",
        "current",
        "diveType",
        "workload",
        "thermalComfort",
        "visibility",
        "notableAnimals",
      ]),
      site,
      people,
      own: own && {
        fields: kept([
          "trainingAgency",
          "trainingCourse",
          "tags",
          "surge",
          "surface",
          "weather",
          "maxTemperature",
          "visibilityRating",
          "gearDetails",
          "ignored",
          "surfaceInterval",
        ]),
        trip: own.trip,
        diveCentre: own.diveCentre,
        waterType: own.waterType,
      },
      fragment,
      fromShylog,
    }
  })
}

// Shylog's <shylog> block, which only its own export writes.
function readOwn(dive: Element, before: Element | undefined) {
  const block = Array.from(
    dive.getElementsByTagNameNS(shylogNamespace, "shylog")
  )[0]
  if (!block) return null
  const every = (name: string) =>
    Array.from(block.getElementsByTagNameNS(shylogNamespace, name)).map(
      (found) => found.textContent?.trim() ?? ""
    )
  const one = (name: string) => every(name)[0] || null
  // An override is the interval UDDF already holds; otherwise it was
  // worked out, and is worked out again.
  const interval = before && all(before, "surfaceintervalbeforedive")[0]
  const passed = interval && number(interval, "passedtime")
  const centre = entityName(one("diveCentreName"))
  const regionName = entityName(one("diveCentreRegion"))
  const regionCountry = country(one("diveCentreRegionCountry"))
  const maxTemperature = one("maxTemperature")
  return {
    fields: {
      trainingAgency: one("trainingAgency") ?? undefined,
      trainingCourse: one("trainingCourse") ?? undefined,
      tags: [
        ...new Set(
          every("tag").flatMap((tag) => choiceOf(tags, tag, "key") ?? [])
        ),
      ],
      surge: choiceOf(surges, one("surge"), "key"),
      surface: choiceOf(surfaces, one("surface"), "key"),
      weather: choiceOf(weathers, one("weather"), "key"),
      maxTemperature:
        celsius(maxTemperature == null ? null : Number(maxTemperature)) ??
        undefined,
      visibilityRating: choiceOf(
        visibilityRatings,
        one("visibilityRating"),
        "key"
      ),
      gearDetails: one("gearDetails") ?? undefined,
      ignored: one("ignored") === "true" || undefined,
      surfaceInterval:
        one("surfaceIntervalOverride") === "true" && interval
          ? all(interval, "infinity").length
            ? ("none" as const)
            : (passed ?? undefined)
          : undefined,
    },
    professionals: every("professional"),
    trip: entityName(one("tripName")),
    diveCentre: centre
      ? {
          name: centre,
          region:
            regionName && regionCountry
              ? { name: regionName, countryCode: regionCountry }
              : null,
        }
      : null,
    waterType: choiceOf(waterTypes, one("siteWaterType"), "key") ?? null,
  }
}
