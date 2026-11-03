import {
  bodiesOfWater,
  celsiusToKelvin,
  countryCodes,
  currents,
  cylinderMaterials,
  diveTypes,
  entityFields,
  entries,
  keysOf,
  surfaces,
  surges,
  tags,
  thermalComforts,
  visibilityRatings,
  waterTypes,
  weathers,
  workloads,
  type Sample,
} from "@shylog/core"
import type { Element } from "@xmldom/xmldom"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Db } from "../../src/db/open.ts"
import { storeProfile } from "../../src/profile.ts"
import { readUddf, type ProfileEvent } from "../../src/uddf/sample-reader.ts"
import { writeUddf } from "../../src/uddf/writer.ts"
import { send, testApp } from "../app.ts"
import { testDb } from "../db.ts"
import { uddfSchemaErrors } from "../uddf-schema.ts"
import { readOnceAsSubsurface } from "./subsurface-uddf.ts"

// Random logs pushed through the draft upload and the export, then read back
// by the XSD, Shylog's reader and Subsurface's own import. The fixed logs in
// writer.test.ts show the mapping; this looks for the inputs that break it.
// SHYLOG_FUZZ_RUNS raises the run count for a long local soak. The seed is
// fixed, so CI tries the same cases every time and a red build is always the
// change's; SHYLOG_FUZZ_SEED=random explores, or replays a printed seed.
const runs = Number(process.env.SHYLOG_FUZZ_RUNS) || 60
const seed = process.env.SHYLOG_FUZZ_SEED
const options = {
  numRuns: runs,
  ...(seed === "random" ? {} : { seed: Number(seed) || 20261103 }),
}

// XML 1.0's Char production: anything else can't be written, even escaped.
const xmlText = (s: string) =>
  [...s]
    .filter((c) => {
      const p = c.codePointAt(0)!
      return (
        p === 0x9 ||
        p === 0xa ||
        p === 0xd ||
        (p >= 0x20 && p <= 0xd7ff) ||
        (p >= 0xe000 && p <= 0xfffd) ||
        p >= 0x10000
      )
    })
    .join("")

// Text a diver could paste: markup, line endings, emoji, combining marks,
// and characters XML can't carry at all, which core drops on save.
const awkward = fc.constantFrom(
  "&",
  "<",
  ">",
  '"',
  "'",
  "]]>",
  "<![CDATA[",
  "&amp;",
  "\r\n",
  "\r",
  "\n\n",
  "\t",
  "  ",
  "\u0000",
  "\u0007",
  "\uFFFE",
  "\uFEFF",
  "\u00A0",
  "\u2028",
  "\u{1F600}",
  "e\u0301"
)
const words = fc
  .array(
    fc.oneof(
      { weight: 4, arbitrary: fc.string({ unit: "grapheme", maxLength: 10 }) },
      { weight: 3, arbitrary: awkward },
      { weight: 1, arbitrary: fc.string({ unit: "binary", maxLength: 3 }) }
    ),
    { maxLength: 12 }
  )
  .map((parts) => parts.join(""))
// Within core's limits, so every draft is one the app could send.
const name = words.filter(
  (s) => entityFields.person.safeParse({ name: s }).success
)
const text = fc.oneof(
  { weight: 9, arbitrary: words },
  { weight: 1, arbitrary: fc.string({ minLength: 5000, maxLength: 10_000 }) }
)

// Mostly what a form or a computer gives, sometimes the limits or any
// double the schema allows.
const decimal = (min: number, max: number, places: number) =>
  fc.oneof(
    {
      weight: 6,
      arbitrary: fc
        .integer({ min: min * 10 ** places, max: max * 10 ** places })
        .map((n) => n / 10 ** places),
    },
    { weight: 1, arbitrary: fc.constantFrom(min, max) },
    { weight: 1, arbitrary: fc.double({ min, max, noNaN: true }) }
  )
const thousandths = (min: number, max: number) =>
  fc.integer({ min: min * 1000, max: max * 1000 }).map((n) => n / 1000)
const depth = decimal(0, 350, 3).filter((d) => d > 0)
const choice = <T extends Parameters<typeof keysOf>[0]>(options: T) =>
  fc.constantFrom(...keysOf(options))

const pad = (n: number) => String(n).padStart(2, "0")
const startTime = fc
  .record({
    day: fc.oneof(
      fc.date({
        min: new Date("1990-01-01T00:00:00Z"),
        max: new Date("2099-12-31T00:00:00Z"),
        noInvalidDate: true,
      }),
      fc.constantFrom(new Date("2024-02-29T00:00:00Z"))
    ),
    second: fc.oneof(
      fc.integer({ min: 0, max: 86_399 }),
      fc.constantFrom(0, 86_399)
    ),
  })
  .map(
    ({ day, second }) =>
      `${day.toISOString().slice(0, 10)}T${pad(Math.floor(second / 3600))}:${pad(Math.floor(second / 60) % 60)}:${pad(second % 60)}`
  )

interface Entities {
  regions: { id: string; name: string; countryCode: string }[]
  sites: {
    id: string
    name: string
    countryCode: string
    regionId?: string
    bodyOfWater?: string
    waterType?: string
  }[]
  people: { id: string; name: string }[]
  trips: { id: string; name: string }[]
  diveCentres: { id: string; name: string; regionId?: string }[]
}

// A few countries, so sites and regions often share one and are matched.
const country = fc.oneof(
  fc.constantFrom("ZA", "MZ"),
  fc.constantFrom(...countryCodes)
)
const named = (prefix: string, max: number) =>
  fc
    .array(name, { maxLength: max })
    .map((names) => names.map((n, i) => ({ id: `${prefix}-${i}`, name: n })))

const entities: fc.Arbitrary<Entities> = fc
  .record({
    regions: fc.array(fc.record({ name, countryCode: country }), {
      maxLength: 2,
    }),
    sites: fc.array(
      fc.record(
        {
          name,
          countryCode: country,
          region: fc.nat(),
          bodyOfWater: choice(bodiesOfWater),
          waterType: choice(waterTypes),
        },
        { requiredKeys: ["name", "countryCode"] }
      ),
      { minLength: 1, maxLength: 3 }
    ),
    people: named("person", 3),
    trips: named("trip", 1),
    diveCentres: named("centre", 1),
    centreRegion: fc.option(fc.nat()),
  })
  .map(({ regions, sites, diveCentres, centreRegion, ...rest }) => {
    const regionIds = regions.map((_, i) => `region-${i}`)
    return {
      ...rest,
      diveCentres: diveCentres.map((centre) =>
        centreRegion != null && regionIds.length
          ? { ...centre, regionId: regionIds[centreRegion % regionIds.length] }
          : centre
      ),
      regions: regions.map((r, i) => ({ id: regionIds[i], ...r })),
      // A site in a region takes the region's country, as the app requires.
      sites: sites.map(({ region, ...site }, i) => {
        const at = region === undefined ? null : region % (regions.length || 1)
        return {
          id: `site-${i}`,
          ...site,
          ...(at != null && regions[at]
            ? {
                regionId: regionIds[at],
                countryCode: regions[at].countryCode,
              }
            : {}),
        }
      }),
    }
  })

type Fields = Record<string, unknown>

function diveFields(log: Entities): fc.Arbitrary<Fields> {
  const ids = <T extends { id: string }>(list: T[]) =>
    list.length ? fc.constantFrom(...list.map((e) => e.id)) : fc.constant(null)
  return fc
    .record(
      {
        startTime,
        siteId: ids(log.sites),
        duration: fc.oneof(
          fc.integer({ min: 1, max: 24 * 3600 }),
          fc.constantFrom(1, 59, 60, 24 * 3600)
        ),
        maxDepth: depth,
        diveType: choice(diveTypes),
        nitrox: fc.boolean(),
        ignored: fc.boolean(),
        oxygen: fc.oneof(
          fc.integer({ min: 211, max: 1000 }),
          fc.constantFrom(211, 320, 324, 1000)
        ),
        trainingAgency: text,
        trainingCourse: text,
        tags: fc.uniqueArray(choice(tags)),
        tripId: ids(log.trips),
        diveCentreId: ids(log.diveCentres),
        people: fc.shuffledSubarray(log.people.map((p) => p.id)),
        split: fc.nat(),
        entry: choice(entries),
        current: choice(currents),
        surge: choice(surges),
        surface: choice(surfaces),
        weather: choice(weathers),
        minTemperature: decimal(-3, 40, 1),
        maxTemperature: decimal(-3, 40, 1),
        visibility: decimal(0, 150, 1),
        visibilityRating: choice(visibilityRatings),
        workload: choice(workloads),
        thermalComfort: choice(thermalComforts),
        averageDepth: depth,
        surfaceInterval: fc.oneof(
          fc.integer({ min: 0, max: 48 * 3600 }),
          fc.constant("none")
        ),
        weight: decimal(0, 40, 1),
        cylinderMaterial: choice(cylinderMaterials),
        cylinderVolume: fc.oneof(
          fc.integer({ min: 1, max: 20_000 }),
          fc.constantFrom(11_100, 12_000, 15_000)
        ),
        startPressure: decimal(0, 300, 1),
        endPressure: decimal(0, 300, 1),
        notableAnimals: text,
        gearDetails: text,
        notes: text,
      },
      {
        requiredKeys: [
          "startTime",
          "siteId",
          "duration",
          "maxDepth",
          "people",
          "split",
        ],
      }
    )
    .map(({ people, split, ...fields }) => {
      // Core's cross-field rules, met rather than filtered for.
      const f: Fields = { ...fields }
      for (const key of ["tripId", "diveCentreId"])
        if (f[key] === null) delete f[key]
      if (people.length) {
        const at = split % (people.length + 1)
        f.buddies = people.slice(0, at)
        f.diveProfessionals = people.slice(at)
      }
      if (f.visibility !== undefined) delete f.visibilityRating
      const swap = (low: string, high: string) => {
        if (
          f[low] !== undefined &&
          f[high] !== undefined &&
          (f[low] as number) > (f[high] as number)
        )
          [f[low], f[high]] = [f[high], f[low]]
      }
      swap("minTemperature", "maxTemperature")
      swap("endPressure", "startPressure")
      if ((f.averageDepth as number) > (f.maxDepth as number))
        f.averageDepth = f.maxDepth
      if (f.nitrox && f.oxygen === undefined) f.nitrox = false
      return f
    })
}

interface Profile {
  model: string
  samples: Sample[]
  events: ProfileEvent[]
}

// Samples and alarms as the import stores them: one sample per time, ascent
// alarms paired in order (only the last may be left open), surfacings alone.
const profile: fc.Arbitrary<Profile> = fc
  .record({
    // Read from the computer's UDDF, so XML text and trimmed.
    model: fc.oneof(
      fc.constantFrom("Suunto D4i", "Suunto Zoop Novo", "Perdix 2", "perdix-2"),
      name.map((n) => xmlText(n).trim()).filter(Boolean)
    ),
    points: fc.uniqueArray(
      fc.record({
        time: fc.integer({ min: 0, max: 25 * 3600 }),
        depth: decimal(0, 350, 3),
        // The import reads both through kelvin and pascals to the thousandth.
        temperature: fc.option(thousandths(-3, 40)),
        pressure: fc.option(thousandths(0, 300)),
        alarms: fc.constantFrom(
          [],
          [],
          ["surface"],
          ["ascent"],
          ["ascent", "surface"],
          ["surface", "ascent"],
          ["ascent", "ascent"]
        ),
      }),
      { selector: (point) => point.time, maxLength: 30 }
    ),
  })
  .map(({ model, points }) => {
    const sorted = [...points].sort((a, b) => a.time - b.time)
    const events: ProfileEvent[] = []
    let open: number | null = null
    for (const { time, alarms } of sorted) {
      for (const type of alarms) {
        if (type !== "ascent") events.push({ type, start: time, end: null })
        else if (open == null) open = time
        else {
          events.push({ type, start: open, end: time })
          open = null
        }
      }
    }
    if (open != null) events.push({ type: "ascent", start: open, end: null })
    return {
      model,
      samples: sorted.map(({ time, depth, temperature, pressure }) => ({
        time,
        depth,
        temperature,
        pressure,
      })),
      events,
    }
  })

interface Log {
  diverName: string
  entities: Entities
  dives: { fields: Fields; profile: Profile | null; deleted: boolean }[]
}

const log: fc.Arbitrary<Log> = entities.chain((ents) =>
  fc.record({
    // Settings allow no name, unlike entities.
    diverName: fc.oneof(fc.constant(""), name),
    entities: fc.constant(ents),
    dives: fc.array(
      fc.record({
        fields: diveFields(ents),
        profile: fc.option(profile, { freq: 2 }),
        deleted: fc.nat({ max: 4 }).map((n) => n === 0),
      }),
      { minLength: 1, maxLength: 4 }
    ),
  })
)

let opCount = 0
const op = (fields: Record<string, unknown>) => ({
  opId: `op-${++opCount}`,
  opVersion: 1,
  deviceId: "device-fuzz",
  at: new Date().toISOString(),
  ...fields,
})

// The log as the app would upload it: the first draft creates every entity,
// each later draft holds one dive.
// Each run's database is closed when the next is built, as thousands left
// for the garbage collector held gigabytes in a soak.
let previous: Db | null = null

async function build({ diverName, entities: e, dives }: Log) {
  previous?.close()
  const db = (previous = testDb())
  const app = testApp({ db })
  const ok = async (res: Response) =>
    expect(res.status, await res.clone().text()).toBe(200)
  await ok(await send(app, "PUT", "/api/settings", { diverName }))
  const created = (
    [
      ["region", e.regions],
      ["site", e.sites],
      ["diveCentre", e.diveCentres],
      ["person", e.people],
      ["trip", e.trips],
    ] as const
  ).flatMap(([kind, list]) =>
    list.map(({ id, ...fields }) =>
      op({ type: "upsertEntity", kind, id, fields })
    )
  )
  for (const [i, dive] of dives.entries()) {
    const diveOp = op({
      type: "upsertDive",
      diveId: `dive-${i}`,
      fields: dive.fields,
    })
    await ok(
      await send(app, "POST", "/api/ops", {
        ops: i === 0 ? [...created, diveOp] : [diveOp],
      })
    )
  }
  for (const [i, dive] of dives.entries()) {
    const id = `dive-${i}`
    if (dive.profile) {
      db.prepare("UPDATE dives SET computer_model = ? WHERE id = ?").run(
        dive.profile.model,
        id
      )
      storeProfile(
        db,
        id,
        dive.fields.duration as number,
        dive.profile.samples,
        dive.profile.events
      )
    }
    if (dive.deleted) await ok(await send(app, "DELETE", `/api/dives/${id}`))
  }
  return db
}

interface Row {
  id: string
  number: number | null
  startTime: string
  duration: number
  maxDepth: number
  averageDepth: number | null
  oxygen: number | null
  computerModel: string | null
  site: string
  visibility: number | null
  weight: number | null
  minTemperature: number | null
  cylinderVolume: number | null
  startPressure: number | null
  endPressure: number | null
  notes: string | null
}

// What the export should hold, read from the database in the writer's order.
function stored(db: Db) {
  const rows = db
    .prepare<[], Row>(
      `SELECT dives.id, number, start_time AS startTime, duration,
        max_depth AS maxDepth, average_depth AS averageDepth, oxygen,
        computer_model AS computerModel, sites.name AS site, visibility,
        weight, min_temperature AS minTemperature,
        cylinder_volume AS cylinderVolume, start_pressure AS startPressure,
        end_pressure AS endPressure, notes
      FROM dives JOIN sites ON sites.id = site_id
      WHERE deleted_at IS NULL ORDER BY start_time, seq`
    )
    .all()
  const samples = db.prepare<[string], Sample>(
    "SELECT time, depth, temperature, pressure FROM samples WHERE dive_id = ? ORDER BY time"
  )
  const events = db.prepare<[string], ProfileEvent>(
    "SELECT type, start_seconds AS start, end_seconds AS end FROM events WHERE dive_id = ? ORDER BY start_seconds, id"
  )
  const people = db.prepare<[string, string], string>(
    `SELECT name FROM (
      SELECT 0 AS role, position, person_id FROM dive_buddies WHERE dive_id = ?
      UNION ALL
      SELECT 1, position, person_id FROM dive_professionals WHERE dive_id = ?
    ) JOIN people ON people.id = person_id ORDER BY role, position`
  )
  return rows.map((row) => ({
    ...row,
    samples: samples.all(row.id),
    events: events.all(row.id),
    people: people.pluck().all(row.id, row.id),
  }))
}

// About 2 s a case covers a failure's shrinking, which reruns xsltproc.
describe("the UDDF export of a random log", { timeout: runs * 2000 }, () => {
  it("passes the UDDF schema", async () => {
    await fc.assert(
      fc.asyncProperty(log, async (l) => {
        expect(uddfSchemaErrors(writeUddf(await build(l)).xml)).toEqual([])
      }),
      options
    )
  })

  it("is byte-identical on a second run", async () => {
    await fc.assert(
      fc.asyncProperty(log, async (l) => {
        const db = await build(l)
        expect(writeUddf(db).xml).toBe(writeUddf(db).xml)
      }),
      options
    )
  })

  it("is read back by Shylog's reader as stored", async () => {
    await fc.assert(
      fc.asyncProperty(log, async (l) => {
        const db = await build(l)
        // The reader lists an ascent left open last; stored, events are
        // ordered by start (a stable sort keeps the order written for ties).
        const read = readUddf(writeUddf(db).xml).map((dive) => ({
          ...dive,
          events: dive.events.toSorted((a, b) => a.start - b.start),
        }))
        expect(read).toEqual(
          stored(db).map((dive) => ({
            startTime: dive.startTime,
            duration: dive.duration,
            maxDepth: dive.maxDepth,
            averageDepth: dive.averageDepth,
            oxygen: dive.oxygen,
            computerModel: dive.computerModel,
            // Departure: the seeding reader leaves tank pressure for the
            // import's reader (milestone 14).
            samples: dive.samples.map((s) => ({ ...s, pressure: null })),
            events: dive.events,
          }))
        )
      }),
      options
    )
  })

  it("is read by Subsurface with every field it imports", async () => {
    await fc.assert(
      fc.asyncProperty(log, async (l) => {
        const db = await build(l)
        const xml = writeUddf(db).xml
        const theirs = Array.from(
          readOnceAsSubsurface(xml).getElementsByTagName("dive")
        )
        const ours = stored(db)
        expect(theirs).toHaveLength(ours.length)
        const wrong: string[] = []
        ours.forEach((dive, i) => {
          wrong.push(...compare(theirs[i], dive).map((w) => `${dive.id} ${w}`))
        })
        expect(wrong).toEqual([])
      }),
      options
    )
  })
})

// Subsurface writes its own units with a fixed number of decimals, so a
// figure matches when it is within half its last digit.
const near = (written: string | null, value: number, half: number) =>
  written != null && Math.abs(parseFloat(written) - value) <= half + 1e-9
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${pad(seconds % 60)} min`
// uddf.xslt's visibility buckets.
// libxml2's XPath reads a number under 10⁻²⁰ as 0 in some places and not in
// others, so whether Subsurface keeps such a value isn't checked.
const tiny = (n: number | null) => n != null && n !== 0 && Math.abs(n) < 1e-20
const bucket = (metres: number) =>
  metres < 1 ? 1 : metres <= 3 ? 2 : metres <= 5 ? 3 : metres <= 10 ? 4 : 5

function compare(
  dive: Element,
  ours: ReturnType<typeof stored>[number]
): string[] {
  const wrong: string[] = []
  const attr = (el: Element | undefined, name: string) =>
    el?.getAttribute(name) || null
  const first = (name: string) => dive.getElementsByTagName(name)[0]
  const textOf = (name: string) => first(name)?.textContent ?? null
  const same = (what: string, theirs: unknown, expected: unknown) => {
    if (theirs !== expected)
      wrong.push(
        `${what}: Subsurface ${JSON.stringify(theirs)}, Shylog ${JSON.stringify(expected)}`
      )
  }
  const close = (
    what: string,
    theirs: string | null,
    expected: number | null,
    half: number
  ) => {
    if (expected == null) same(what, theirs, null)
    else if (!near(theirs, expected, half))
      same(what, theirs, `${expected} ± ${half}`)
  }

  same("start", `${attr(dive, "date")}T${attr(dive, "time")}`, ours.startTime)
  same("number", attr(dive, "number"), ours.number?.toString() ?? null)
  same("duration", attr(dive, "duration"), clock(ours.duration))
  if (!tiny(ours.visibility))
    same(
      "visibility",
      attr(dive, "visibility"),
      ours.visibility ? String(bucket(ours.visibility)) : null
    )
  same("site", textOf("location"), xmlText(ours.site))
  same(
    "buddies",
    textOf("buddy"),
    ours.people.length
      ? ours.people
          .map((n) => xmlText(n).trim().split(/\s+/).join(" "))
          .join(", ")
      : null
  )
  same("notes", textOf("notes"), xmlText(ours.notes ?? "") || null)
  if (!tiny(ours.weight))
    close(
      "weight",
      attr(first("weightsystem"), "weight"),
      ours.weight || null,
      0.05
    )
  // Departure: Subsurface counts the samples not at 273.15 K and, with none,
  // reads every temperature at 273.15 K as no reading, the samples' too
  // (commonTemplates.xsl's temperatureSamples, uddf.xslt's waypoints).
  const sampled = ours.samples.some(
    (s) => s.temperature != null && celsiusToKelvin(s.temperature) !== 273.15
  )
  const freezing =
    ours.minTemperature != null &&
    celsiusToKelvin(ours.minTemperature) === 273.15
  close(
    "water temperature",
    attr(first("temperature"), "water"),
    freezing && !sampled ? null : ours.minTemperature,
    // Rounded twice: by the writer to the millikelvin, then to 0.1.
    0.0505
  )

  const cylinder = first("cylinder")
  same(
    "cylinder size",
    attr(cylinder, "size") && Math.round(Number(attr(cylinder, "size")) * 1000),
    ours.cylinderVolume
  )
  same("oxygen", attr(cylinder, "o2"), String((ours.oxygen ?? 210) / 1000))
  // Rounded twice: by the writer to the pascal, then to 0.1 bar.
  close("start pressure", attr(cylinder, "start"), ours.startPressure, 0.050005)
  close("end pressure", attr(cylinder, "end"), ours.endPressure, 0.050005)

  const depth = first("depth")
  close("max depth", attr(depth, "max"), ours.maxDepth, 0.005)
  close("average depth", attr(depth, "mean"), ours.averageDepth, 0.005)

  const samples = Array.from(dive.getElementsByTagName("sample"))
  same("sample count", samples.length, ours.samples.length)
  ours.samples.forEach((sample, i) => {
    const theirs = samples[i]
    const at = `sample at ${sample.time} s`
    same(`${at} time`, attr(theirs, "time"), clock(sample.time))
    close(`${at} depth`, attr(theirs, "depth"), sample.depth, 0.005)
    close(
      `${at} temperature`,
      attr(theirs, "temp"),
      sampled ? sample.temperature : null,
      0.05
    )
    close(`${at} pressure`, attr(theirs, "pressure"), sample.pressure, 0.05)
  })
  // Each alarm is an event at its waypoint's time; an ascent pair is stored
  // as one event and written as an alarm at each end.
  same(
    "alarms",
    Array.from(dive.getElementsByTagName("event"))
      .map((e) => `${attr(e, "name")}@${attr(e, "time")}`)
      .sort()
      .join(", "),
    ours.events
      .flatMap((e) =>
        [e.start, ...(e.end == null ? [] : [e.end])].map(
          (time) => `${e.type}@${clock(time)}`
        )
      )
      .sort()
      .join(", ")
  )
  return wrong
}
