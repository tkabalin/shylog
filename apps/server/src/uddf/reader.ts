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
  mapSiteId,
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
import {
  DOMParser,
  XMLSerializer,
  type Element,
  type Node,
} from "@xmldom/xmldom"

import {
  downloadGeneratorName,
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
  // The dive site on Explore's map the site was added from.
  mapSite: string | null
}

const ns = uddfNamespace
// The elements under parent in document order, as getElementsByTagNameNS
// gives them, until visit returns true. Its live lists walk the whole
// subtree on every call, a dive's hundreds of samples included.
function walk(parent: Node, visit: (element: Element) => boolean | void) {
  let node = parent.firstChild
  while (node) {
    if (node.nodeType === node.ELEMENT_NODE && visit(node as Element)) return
    if (node.firstChild) {
      node = node.firstChild
      continue
    }
    while (node !== parent && !node.nextSibling) node = node.parentNode!
    node = node === parent ? null : node.nextSibling
  }
}
// Several names' elements from one walk: a dive's figures come after its
// samples, so even the first of each is a walk of the whole dive. Names
// are UDDF's unless namespaces gives another.
function gather<N extends string>(
  parent: Element,
  names: readonly N[],
  namespaces: Partial<Record<N, string>> = {}
) {
  const found = new Map<string | null, Element[]>(
    names.map((name) => [name, []])
  )
  walk(parent, (element) => {
    const list = found.get(element.localName)
    const name = element.localName as N
    if (list && element.namespaceURI === (namespaces[name] ?? ns))
      list.push(element)
  })
  return (name: N) => found.get(name)!
}
const all = (parent: Element, name: string, namespace = ns) =>
  gather(parent, [name], { [name]: namespace })(name)
const first = (parent: Element, name: string) => {
  let found: Element | undefined
  walk(parent, (element) => {
    if (element.localName === name && element.namespaceURI === ns)
      found = element
    return !!found
  })
  return found
}
const valueOf = (element: Element | undefined) =>
  element?.textContent?.trim() || null
const numberOf = (element: Element | undefined) => {
  const value = valueOf(element)
  return value == null ? null : Number(value)
}
const text = (parent: Element, name: string) => valueOf(first(parent, name))
const number = (parent: Element, name: string) => numberOf(first(parent, name))
const children = (parent: Element, name: string) => {
  const found: Element[] = []
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    const element = node as Element
    if (
      node.nodeType === node.ELEMENT_NODE &&
      element.localName === name &&
      element.namespaceURI === ns
    )
      found.push(element)
  }
  return found
}
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
// surfacings with single alarms. A download writes a computer's mandatory
// stop as a pair of deco alarms, begin and end ("pair"); Shylog's export
// names its stops apart, so one deco alarm for each of their seconds is
// skipped (`stops` says so); any other deco alarm is single.
function events(
  waypoints: Element[],
  times: number[],
  stops: "pair" | ((time: number) => boolean)
): ProfileEvent[] {
  const found: ProfileEvent[] = []
  const open = new Map<string, number>()
  for (const [i, waypoint] of waypoints.entries()) {
    const time = times[i]
    for (const alarm of all(waypoint, "alarm")) {
      const alarmed = alarm.textContent?.trim() ?? ""
      if (alarmed === "deco" && stops !== "pair" && stops(time)) continue
      const type =
        alarmed === "ascent"
          ? "ascent"
          : alarmed === "deco" && stops === "pair"
            ? "mandatory-stop"
            : undefined
      const start = type ? open.get(type) : undefined
      if (!type) {
        found.push({ type: alarmed, start: time, end: null })
      } else if (start == null) {
        open.set(type, time)
      } else {
        found.push({ type, start, end: time })
        open.delete(type)
      }
    }
  }
  for (const [type, start] of open) found.push({ type, start, end: null })
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
  const inFile = gather(root, [
    "divecomputer",
    "mix",
    "site",
    "buddy",
    "tank",
    "generator",
    "dive",
  ])
  const computers = new Map(
    inFile("divecomputer").map((computer) => [
      computer.getAttribute("id"),
      text(computer, "model"),
    ])
  )
  // What each dive is read for, gathered before any is read, as finding
  // the file's links needs every dive's.
  const dives = inFile("dive").map((dive) => ({
    dive,
    inDive: gather(
      dive,
      [
        "link",
        "switchmix",
        "tankdata",
        "waypoint",
        "informationbeforedive",
        "informationafterdive",
        "shylog",
        "datetime",
        "diveduration",
        "greatestdepth",
        "averagedepth",
        "lowesttemperature",
      ],
      { shylog: shylogNamespace }
    ),
  }))
  // A dive names its computer by a link. Subsurface's export from one
  // computer leaves every link out; in a file that links any (Shylog's), a
  // dive without one was logged by hand.
  const linked = (links: Element[]) =>
    links
      .map((link) => computers.get(link.getAttribute("ref")))
      .find((model) => model !== undefined)
  const anyLinked = dives.some(
    ({ inDive }) => linked(inDive("link")) !== undefined
  )
  const computerOf = (links: Element[]) =>
    linked(links) ??
    (!anyLinked && computers.size === 1 ? [...computers.values()][0] : null)
  const mixElements = new Map(
    inFile("mix").map((mix) => [mix.getAttribute("id"), mix])
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
    inFile("site").map((site) => {
      const geography = first(site, "geography")
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
    inFile("buddy").map((buddy) => [
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
    inFile("tank").map((tank) => [
      tank.getAttribute("id"),
      choiceOf(cylinderMaterials, text(tank, "tankmaterial")),
    ])
  )
  const serializer = new XMLSerializer()
  const generator = inFile("generator")[0]
  const fromShylog = !!generator && text(generator, "name") === generatorName
  const fromDownload =
    !!generator && text(generator, "name") === downloadGeneratorName

  // The preview names dives by their ids, so two alike would be confused.
  const refs = new Set<string>()
  return dives.map(({ dive, inDive }, i) => {
    const position = i + 1
    // Subsurface and Shylog both write one; the position stands in if not.
    const ref = dive.getAttribute("id") || `dive ${position}`
    if (refs.has(ref)) {
      throw new UnreadableUddf(
        `Dive ${position} in the file repeats another's id`
      )
    }
    refs.add(ref)
    const tank = inDive("tankdata")[0]
    const tankLinks = tank ? all(tank, "link") : []
    // The gas the dive starts on is the switchmix at 0 s; without one, the
    // tank's links name its mix, alongside the tank, in either order.
    const switchmixes = inDive("switchmix")
    const switchmix = switchmixes.find(
      (gas) => number(gas.parentNode as Element, "divetime") === 0
    )
    const mix = [switchmix, ...tankLinks]
      .map((link) => link && mixes.get(link.getAttribute("ref")))
      .find((found) => found !== undefined)
    const unsupportedGas =
      mix !== undefined && (mix.he > 0 || mix.o2 < airOxygen)
    // A trimix's oxygen alone would read as nitrox, so it is air too.
    const o2 = unsupportedGas ? undefined : mix?.o2
    const waypoints = inDive("waypoint")
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
    const before = inDive("informationbeforedive")[0]
    const after = inDive("informationafterdive")[0]
    const weight =
      (after && number(after, "leadquantity")) ??
      ((before && number(before, "leadquantity")) || null)
    // The dive's own notes, not the notable animals under observations.
    // Subsurface writes an empty paragraph when there are none.
    const notes = after ? paragraphs(children(after, "notes")) : null
    const standard = {
      cylinderMaterial: tankLinks
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
    const own = readOwn(inDive("shylog")[0], before)
    // The figures must pass the rules a dive saved in the app does, so what
    // an import stores always fits the database. Start, duration and depth
    // must be there; the start is site time with no offset.
    const figures = {
      startTime: valueOf(inDive("datetime")[0]),
      duration: numberOf(inDive("diveduration")[0]),
      maxDepth: numberOf(inDive("greatestdepth")[0]),
      averageDepth: numberOf(inDive("averagedepth")[0]),
      minTemperature: celsius(numberOf(inDive("lowesttemperature")[0])),
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
      [...inDive("link"), ...switchmixes].map((found) =>
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
      computerModel: computerOf(inDive("link")),
      samples,
      // A download's deco alarms are all stops. Shylog's export names its
      // stops' seconds, read from there: a stop added to a dive imported
      // from Subsurface can end between its samples, where no alarm goes.
      events: fromDownload
        ? events(
            waypoints,
            written.map((sample) => sample.time),
            "pair"
          )
        : [
            ...events(
              waypoints,
              written.map((sample) => sample.time),
              stopAlarms(own?.stopTimes)
            ),
            ...(own?.stops ?? []),
          ].sort((a, b) => a.start - b.start),
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
        mapSite: own.mapSite,
      },
      fragment,
      fromShylog,
    }
  })
}

// Skips one deco alarm for each a stop put at that second, so another
// tool's deco alarm at the same second is still read.
function stopAlarms(counts: ReadonlyMap<number, number> | undefined) {
  const left = new Map(counts)
  return (time: number) => {
    const count = left.get(time) ?? 0
    if (!count) return false
    left.set(time, count - 1)
    return true
  }
}

// Shylog's <shylog> block, which only its own export writes.
function readOwn(block: Element | undefined, before: Element | undefined) {
  if (!block) return null
  const every = (name: string) =>
    all(block, name, shylogNamespace).map(
      (found) => found.textContent?.trim() ?? ""
    )
  const one = (name: string) => every(name)[0] || null
  // An override is the interval UDDF already holds; otherwise it was
  // worked out, and is worked out again.
  const interval = before && first(before, "surfaceintervalbeforedive")
  const passed = interval && number(interval, "passedtime")
  const centre = entityName(one("diveCentreName"))
  const regionName = entityName(one("diveCentreRegion"))
  const regionCountry = country(one("diveCentreRegionCountry"))
  const maxTemperature = one("maxTemperature")
  // Each stop's begin and end ("1699 3293"), or its begin alone; one that
  // isn't a number of seconds is dropped.
  const stops: ProfileEvent[] = every("mandatoryStop").flatMap((times) => {
    const [start, end] = times.split(" ").filter(Boolean).map(Number)
    if (!Number.isInteger(start)) return []
    return [
      {
        type: "mandatory-stop",
        start,
        end: Number.isInteger(end) ? end : null,
      },
    ]
  })
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
          ? first(interval, "infinity")
            ? ("none" as const)
            : (passed ?? undefined)
          : undefined,
    },
    professionals: every("professional"),
    // How many deco alarms the export wrote at each second for its stops.
    stopTimes: stops
      .flatMap(({ start, end }) => (end == null ? [start] : [start, end]))
      .reduce(
        (counts, time) => counts.set(time, (counts.get(time) ?? 0) + 1),
        new Map<number, number>()
      ),
    stops,
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
    // One that isn't a map id is dropped, as an unknown choice is.
    mapSite: mapSiteId.safeParse(one("siteMapLink")).data ?? null,
  }
}
