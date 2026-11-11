import { createHash } from "node:crypto"

import type { Element } from "@xmldom/xmldom"

import {
  barToPascals,
  bodiesOfWater,
  celsiusToKelvin,
  currents,
  cylinderMaterials,
  defaultWaterType,
  diveTypes,
  entries,
  fractionToTenths,
  keysOf,
  millilitresToCubicMetres,
  tags,
  tenthsToFraction,
  thermalComforts,
  workloads,
  type BodyOfWater,
  type CylinderMaterial,
  type Current,
  type DiveType,
  type Entry,
  type ThermalComfort,
  type WaterType,
  type Workload,
} from "@shylog/core"

import { readSettings } from "../apply/settings.ts"
import { byDive } from "../db/by-dive.ts"
import type { Db } from "../db/open.ts"
import { selectEvents, selectSamples } from "../profile.ts"
import {
  passedMix,
  passThrough,
  schemaOrder,
  type Passed,
} from "./passthrough.ts"
// Air as the import reads it; a dive with Nitrox off breathes it.
import { air as airTenths, type ProfileEvent } from "./reader.ts"
import {
  generatorName,
  shylogNamespace,
  uddfNamespace,
} from "./shylog-namespace.ts"
import { element, leaf, link, personal, type Xml } from "./xml.ts"

export { uddfNamespace }

// The whole log as UDDF 3.2.1 (see UDDF export in the spec), read in one
// transaction and built synchronously, so no write lands part-way through.
// Nothing in it changes unless the log does, so two runs are byte-identical.

interface DiveRow {
  id: string
  number: number | null
  startTime: string
  siteId: string
  duration: number
  maxDepth: number
  diveType: DiveType
  trainingAgency: string | null
  trainingCourse: string | null
  tripId: string | null
  diveCentreId: string | null
  entry: Entry | null
  current: Current | null
  surge: string | null
  surface: string | null
  weather: string | null
  minTemperature: number | null
  maxTemperature: number | null
  visibility: number | null
  visibilityRating: string | null
  workload: Workload | null
  thermalComfort: ThermalComfort | null
  averageDepth: number | null
  surfaceInterval: number | null
  override: number
  weight: number | null
  cylinderMaterial: CylinderMaterial | null
  cylinderVolume: number | null
  oxygen: number | null
  startPressure: number | null
  endPressure: number | null
  notableAnimals: string | null
  gearDetails: string | null
  notes: string | null
  ignored: number
  computerModel: string | null
}

const diveColumns = `
  id, number, start_time AS startTime, site_id AS siteId, duration,
  max_depth AS maxDepth, dive_type AS diveType,
  training_agency AS trainingAgency, training_course AS trainingCourse,
  trip_id AS tripId, dive_centre_id AS diveCentreId, entry, current, surge,
  surface, weather, min_temperature AS minTemperature,
  max_temperature AS maxTemperature, visibility,
  visibility_rating AS visibilityRating, workload,
  thermal_comfort AS thermalComfort, average_depth AS averageDepth,
  surface_interval AS surfaceInterval,
  surface_interval_override AS override, weight,
  cylinder_material AS cylinderMaterial, cylinder_volume AS cylinderVolume,
  oxygen, start_pressure AS startPressure, end_pressure AS endPressure,
  notable_animals AS notableAnimals, gear_details AS gearDetails, notes,
  ignored, computer_model AS computerModel`

const kelvin = (celsius: number | null) =>
  celsius == null ? null : celsiusToKelvin(celsius)

const mixId = (tenths: number) => `mix-${tenths}`

// A cylinder type, not a cylinder: dives with the same material and volume
// share one tank, and a dive with neither has none.
const tankId = (dive: DiveRow) =>
  dive.cylinderMaterial || dive.cylinderVolume
    ? `tank-${dive.cylinderMaterial ?? "unknown"}-${dive.cylinderVolume ?? "unknown"}`
    : null

// Named after the model and nothing else, so it stays the same whatever
// other models the log gains; the short hash of the exact name keeps
// models that read alike ("Perdix 2", "perdix-2") apart.
const computerId = (model: string) =>
  `computer-${model.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${createHash("sha256").update(model).digest("hex").slice(0, 6)}`

// Children in the schema's order, Shylog's own and those passed through
// alike, each known by its tag; the sort is stable, so repeats keep theirs.
function inPlace(order: readonly string[], children: (Xml | null)[]) {
  return children
    .filter((child) => child != null)
    .map((xml) => ({ xml, at: order.indexOf(/^<(\w+)/.exec(xml[0])![1]) }))
    .sort((a, b) => a.at - b.at)
    .map((child) => child.xml)
}
const lines = (passed: Passed[] = []) => passed.map((item) => [item.xml])

export function writeUddf(db: Db): { xml: string; dives: number } {
  return db.transaction(() => build(db))()
}

function build(db: Db) {
  const all = <R>(sql: string, ...params: unknown[]) =>
    db.prepare<unknown[], R>(sql).all(...params)
  const names = (table: string) =>
    new Map(
      all<{ id: string; name: string }>(`SELECT id, name FROM ${table}`).map(
        (row) => [row.id, row.name]
      )
    )

  // Deleted dives are left out (see Rules for edits); ignored ones are in.
  const dives = all<DiveRow>(
    `SELECT ${diveColumns} FROM dives WHERE deleted_at IS NULL ORDER BY start_time, seq`
  )
  const trips = names("trips")
  const diveCentres = names("dive_centres")
  const regions = new Map(
    all<{ id: string; name: string; countryCode: string }>(
      "SELECT id, name, country_code AS countryCode FROM regions"
    ).map((row) => [row.id, row])
  )
  const centreRegions = new Map(
    all<{ id: string; regionId: string }>(
      "SELECT id, region_id AS regionId FROM dive_centres WHERE region_id IS NOT NULL"
    ).map((row) => [row.id, regions.get(row.regionId)!])
  )

  const linked = (table: string) =>
    byDive(
      all<{ diveId: string; personId: string }>(
        `SELECT dive_id AS diveId, person_id AS personId FROM ${table} ORDER BY dive_id, position`
      ),
      (row) => row.personId
    )
  const buddies = linked("dive_buddies")
  const professionals = linked("dive_professionals")
  const tagsOf = byDive(
    all<{ diveId: string; tag: string }>(
      "SELECT dive_id AS diveId, tag FROM dive_tags"
    ),
    (row) => row.tag
  )

  const samplesOf = selectSamples(db)
  const eventsOf = selectEvents(db)
  const fragments = new Map(
    all<{ diveId: string; fragment: string }>(
      "SELECT dive_id AS diveId, fragment FROM import_raw"
    ).map((row) => [row.diveId, row.fragment])
  )

  const tanks = new Map<string, DiveRow>()
  const oxygens = new Set<number>()
  const models = new Set<string>()
  for (const dive of dives) {
    const tank = tankId(dive)
    if (tank) tanks.set(tank, dive)
    oxygens.add(dive.oxygen ?? airTenths)
    if (dive.computerModel) models.add(dive.computerModel)
  }

  const { diverName } = readSettings(db)
  const owner = element(
    "owner",
    [
      personal(diverName),
      element("equipment", [
        ...[...models]
          .sort()
          .map((model) =>
            element(
              "divecomputer",
              [leaf("name", model), leaf("model", model)],
              ` id="${computerId(model)}"`
            )
          ),
        ...[...tanks.keys()].sort().map((id) => {
          const { cylinderMaterial: material, cylinderVolume: ml } =
            tanks.get(id)!
          return element(
            "tank",
            [
              leaf(
                "name",
                [
                  ml ? `${ml / 1000} L` : null,
                  material ? cylinderMaterials[material].label : null,
                ]
                  .filter(Boolean)
                  .join(" ")
              ),
              material
                ? leaf("tankmaterial", cylinderMaterials[material].uddf)
                : null,
              ml ? leaf("tankvolume", millilitresToCubicMetres(ml)) : null,
            ],
            ` id="${id}"`
          )
        }),
      ]),
    ],
    ' id="owner"'
  )

  // Every person, dive professionals too, as UDDF has no other kind; the
  // role on each dive is marked in its <shylog>.
  const people = all<{ id: string; name: string }>(
    "SELECT id, name FROM people ORDER BY id"
  ).map(({ id, name }) => element("buddy", [personal(name)], ` id="${id}"`))

  const siteRows = all<{
    id: string
    name: string
    countryCode: string
    regionId: string | null
    bodyOfWater: BodyOfWater | null
    waterType: WaterType
  }>(
    "SELECT id, name, country_code AS countryCode, region_id AS regionId, body_of_water AS bodyOfWater, water_type AS waterType FROM sites ORDER BY id"
  )
  // UDDF has no water type, so a dive's <shylog> carries its site's when it
  // isn't the one the body of water implies, which a re-import assumes.
  const waterTypes = new Map(
    siteRows
      .filter(
        (site) =>
          site.waterType !== defaultWaterType(site.bodyOfWater ?? undefined)
      )
      .map((site) => [site.id, site.waterType])
  )
  const sites = siteRows.map((site) =>
    element(
      "site",
      [
        leaf("name", site.name),
        leaf(
          "environment",
          site.bodyOfWater && bodiesOfWater[site.bodyOfWater].uddf
        ),
        // The schema requires a location, so a site with no region writes
        // an empty one, which a re-import reads as no region.
        element("geography", [
          leaf(
            "location",
            site.regionId ? regions.get(site.regionId)!.name : ""
          ),
          element("address", [leaf("country", site.countryCode)]),
        ]),
      ],
      ` id="${site.id}"`
    )
  )

  // A mix a passed-through gas switch names: one of Shylog's own when it is
  // oxygen alone, else the file's own under an id made from its make-up.
  const passedMixes = new Map<string, string>()
  function passedMixId(mix: Element) {
    const amount = (name: string) => {
      const value = mix
        .getElementsByTagNameNS(uddfNamespace, name)[0]
        ?.textContent?.trim()
      return value ? Number(value) : null
    }
    const o2 = amount("o2")
    const he = amount("he") ?? 0
    const tenths = o2 == null ? airTenths : fractionToTenths(o2)
    if (!he) {
      oxygens.add(tenths)
      return mixId(tenths)
    }
    const id = `${mixId(tenths)}-${fractionToTenths(he)}`
    if (!passedMixes.has(id)) passedMixes.set(id, passedMix(mix, id))
    return id
  }

  const groups = dives.map((dive) =>
    element(
      "repetitiongroup",
      [writeDive(dive)],
      // Each dive in its own group, named after it so the id is stable.
      ` id="group-${dive.id}"`
    )
  )

  // After the dives, which add the mixes their gas switches name.
  const mixes = [...oxygens]
    .sort((a, b) => a - b)
    .map((tenths) =>
      element(
        "mix",
        [
          leaf("name", tenths === airTenths ? "air" : `EANx ${tenths / 10}`),
          leaf("o2", tenthsToFraction(tenths)),
        ],
        ` id="${mixId(tenths)}"`
      )
    )
    .concat([...passedMixes.keys()].sort().map((id) => [passedMixes.get(id)!]))

  function writeDive(dive: DiveRow): Xml {
    // Read once, for <shylog>'s stops and for the samples' alarms.
    const events = eventsOf.all(dive.id)
    const tagKeys = tagsOf.get(dive.id)
    const centreRegion = dive.diveCentreId
      ? centreRegions.get(dive.diveCentreId)
      : undefined
    const shylog = element(
      "shylog",
      [
        leaf("trainingAgency", dive.trainingAgency),
        leaf("trainingCourse", dive.trainingCourse),
        ...keysOf(tags)
          .filter((key) => tagKeys?.includes(key))
          .map((key) => leaf("tag", key)),
        // UDDF knows only buddies, so the professionals among the links.
        ...(professionals.get(dive.id) ?? []).map((id) =>
          leaf("professional", id)
        ),
        // UDDF's trips and dive bases need data Shylog doesn't keep (a
        // rating, trip parts, a link), so both are Shylog's own.
        leaf("tripId", dive.tripId),
        leaf("tripName", dive.tripId && trips.get(dive.tripId)),
        leaf("diveCentreId", dive.diveCentreId),
        leaf(
          "diveCentreName",
          dive.diveCentreId && diveCentres.get(dive.diveCentreId)
        ),
        leaf("diveCentreRegion", centreRegion?.name),
        leaf("diveCentreRegionCountry", centreRegion?.countryCode),
        leaf("siteWaterType", waterTypes.get(dive.siteId)),
        leaf("surge", dive.surge),
        leaf("surface", dive.surface),
        leaf("weather", dive.weather),
        leaf("maxTemperature", kelvin(dive.maxTemperature)),
        leaf("visibilityRating", dive.visibilityRating),
        leaf("gearDetails", dive.gearDetails),
        dive.ignored ? leaf("ignored", "true") : null,
        // Otherwise the interval is worked out again, as it was here.
        dive.override ? leaf("surfaceIntervalOverride", "true") : null,
        // Which deco alarms are a mandatory stop's begin and end, as another
        // computer's deco alarm is written the same way.
        ...events
          .filter((event) => event.type === "mandatory-stop")
          .map((event) =>
            leaf(
              "mandatoryStop",
              [event.start, event.end ?? ""].join(" ").trim()
            )
          ),
      ],
      ` xmlns="${shylogNamespace}"`
    )
    const tank = tankId(dive)
    const fragment = fragments.get(dive.id)
    const extra = fragment
      ? passThrough(fragment, mixId(dive.oxygen ?? airTenths), passedMixId)
      : null
    return element(
      "dive",
      [
        element(
          "informationbeforedive",
          inPlace(schemaOrder.informationbeforedive, [
            // Buddies before the site: Subsurface puts ", " between names by
            // looking only at the next link.
            ...(buddies.get(dive.id) ?? []).map(link),
            ...(professionals.get(dive.id) ?? []).map(link),
            link(dive.siteId),
            leaf("divenumber", dive.number),
            leaf("datetime", dive.startTime),
            element("surfaceintervalbeforedive", [
              dive.surfaceInterval == null
                ? ["<infinity/>"]
                : leaf("passedtime", dive.surfaceInterval),
            ]),
            leaf("platform", dive.entry && entries[dive.entry].uddf),
            ...lines(extra?.informationbeforedive),
          ])
        ),
        shylog.length > 1 || extra?.applicationdata.length
          ? element("applicationdata", [
              shylog.length > 1 ? shylog : null,
              ...lines(extra?.applicationdata),
            ])
          : null,
        writeSamples(dive.id, events, extra?.waypoints),
        // UDDF requires a start pressure here, but without one the dive
        // would lose its gas and cylinder, so tankdata stays (see Testing).
        // The mix first: Subsurface takes the gas from the first link.
        element("tankdata", [
          link(mixId(dive.oxygen ?? airTenths)),
          tank ? link(tank) : null,
          leaf(
            "tankvolume",
            dive.cylinderVolume && millilitresToCubicMetres(dive.cylinderVolume)
          ),
          leaf(
            "tankpressurebegin",
            dive.startPressure == null ? null : barToPascals(dive.startPressure)
          ),
          leaf(
            "tankpressureend",
            dive.endPressure == null ? null : barToPascals(dive.endPressure)
          ),
          ...lines(extra?.tankdata),
        ]),
        ...(extra?.moreTankdata ?? []).map((xml) => [xml]),
        element("informationafterdive", [
          leaf("greatestdepth", dive.maxDepth),
          leaf("averagedepth", dive.averageDepth),
          leaf("diveduration", dive.duration),
          leaf("lowesttemperature", kelvin(dive.minTemperature)),
          leaf("visibility", dive.visibility),
          leaf("current", dive.current && currents[dive.current].uddf),
          leaf("program", diveTypes[dive.diveType].uddf),
          leaf("workload", dive.workload && workloads[dive.workload].uddf),
          leaf(
            "thermalcomfort",
            dive.thermalComfort && thermalComforts[dive.thermalComfort].uddf
          ),
          dive.weight != null || dive.computerModel
            ? element("equipmentused", [
                leaf("leadquantity", dive.weight),
                dive.computerModel
                  ? link(computerId(dive.computerModel))
                  : null,
              ])
            : null,
          dive.notableAnimals
            ? element("observations", [
                element("notes", [leaf("para", dive.notableAnimals)]),
              ])
            : null,
          // One paragraph with its newlines: Subsurface reads only the first.
          dive.notes ? element("notes", [leaf("para", dive.notes)]) : null,
          // Any order is allowed here.
          ...lines(extra?.informationafterdive),
        ]),
      ],
      ` id="${dive.id}"`
    )
  }

  // Events go back as the alarms they were read from: an ascent pair at
  // both ends, anything else at its time. A mandatory stop added later can
  // end between samples, where no alarm goes; <mandatoryStop> keeps it.
  function writeSamples(
    diveId: string,
    events: readonly ProfileEvent[],
    passed?: Map<number, Passed[]>
  ) {
    const samples = samplesOf.all(diveId)
    if (!samples.length) return null
    const alarms = new Map<number, string[]>()
    const alarm = (time: number, type: string) =>
      alarms.set(time, [...(alarms.get(time) ?? []), type])
    for (const event of events) {
      // UDDF's alarm for a stop the computer demands.
      const type = event.type === "mandatory-stop" ? "deco" : event.type
      alarm(event.start, type)
      if (event.end != null) alarm(event.end, type)
    }
    return element(
      "samples",
      samples.map((sample) => {
        const own = [
          ...(alarms.get(sample.time) ?? []).map((type) => leaf("alarm", type)),
          leaf("depth", sample.depth),
          leaf("divetime", sample.time),
          leaf(
            "tankpressure",
            sample.pressure == null ? null : barToPascals(sample.pressure)
          ),
          leaf("temperature", kelvin(sample.temperature)),
        ]
        // Shylog's own are in order already; only passed ones need placing.
        const extra = passed?.get(sample.time)
        return element(
          "waypoint",
          extra ? inPlace(schemaOrder.waypoint, [...own, ...lines(extra)]) : own
        )
      })
    )
  }

  const uddf = element(
    "uddf",
    [
      element("generator", [
        leaf("name", generatorName),
        leaf("type", "logbook"),
      ]),
      element("diver", [owner, ...people]),
      element("divesite", sites),
      // Both must hold at least one child, so a log with no dives yet
      // leaves them out.
      mixes.length ? element("gasdefinitions", mixes) : null,
      groups.length ? element("profiledata", groups) : null,
    ],
    ` xmlns="${uddfNamespace}" version="3.2.1"`
  )
  return {
    xml: `<?xml version="1.0" encoding="utf-8"?>\n${uddf.join("\n")}\n`,
    dives: dives.length,
  }
}
