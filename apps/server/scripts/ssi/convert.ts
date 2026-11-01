import {
  barToPascals,
  bodiesOfWater,
  celsiusToKelvin,
  countryCodes,
  currents,
  cylinderMaterials,
  diveTypes,
  entries,
  keysOf,
  litresToMillilitres,
  millilitresToCubicMetres,
  minutesToSeconds,
  percentToTenths,
  tags,
  tenthsToFraction,
  type Tag,
} from "@shylog/core"
import { z } from "zod"

import * as codes from "./codes.ts"
import { readCsv } from "./csv.ts"

// Converts the MySSI logbook, as the home server's weekly export job saves
// it, to UDDF for a one-off import. SSI dives were logged by hand, so the
// generator name tells the import to treat them as hand values.

export const generatorName = "Shylog SSI logbook converter"
export const shylogNamespace = "https://github.com/tkabalin/shylog/uddf"

// What the CSV doesn't say, kept with the CSV rather than in this public
// repo. `dives` is keyed by SSI's start time as the CSV writes it
// ("2026-08-16 18:32") and corrects or adds to that dive.
export const extrasSchema = z.strictObject({
  sites: z.record(
    z.string(),
    z.strictObject({
      country: z
        .string()
        .refine((code) => (countryCodes as readonly string[]).includes(code)),
      region: z.string().min(1),
    })
  ),
  leaveOutPeople: z.array(z.string()).default([]),
  dives: z
    .record(
      z.string(),
      z.strictObject({
        startTime: z
          .string()
          .regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/)
          .optional(),
        trainingCourse: z.string().min(1).optional(),
        tags: z.array(z.enum(keysOf(tags))).default([]),
        // °C; null drops SSI's value so the dive computer's fills it.
        minTemperature: z.number().nullable().optional(),
        maxTemperature: z.number().nullable().optional(),
      })
    )
    .default({}),
})
export type Extras = z.input<typeof extrasSchema>

type Row = Record<string, string>
type Xml = string[]

const ns = "odin_user_log_"
const ssiAgency = "SSI"
const airTenths = 210

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

// SSI stores some names HTML-escaped ("I &amp; J").
const unescapeHtml = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|#\d+);/g, (_, entity: string) =>
    entity.startsWith("#")
      ? String.fromCodePoint(Number(entity.slice(1)))
      : { amp: "&", lt: "<", gt: ">", quot: '"' }[entity]!
  )

function element(name: string, children: (Xml | null)[], attrs = ""): Xml {
  const inner = children.filter((child) => child != null).flat()
  if (!inner.length) return [`<${name}${attrs}/>`]
  return [
    `<${name}${attrs}>`,
    ...inner.map((line) => `  ${line}`),
    `</${name}>`,
  ]
}

function leaf(name: string, value: string | number | null | undefined) {
  return value == null ? null : [`<${name}>${escape(String(value))}</${name}>`]
}

const link = (ref: string) => [`<link ref="${ref}"/>`]

// pandas writes a code from a column with gaps as a float ("24.0").
const code = (value: string) => value.replace(/\.0$/, "")

// Local datetimes sort as text.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function splitName(name: string) {
  const [first, ...rest] = name.split(" ")
  return { first: first!, last: rest.join(" ") }
}

export function convertSsi(csv: string, extrasInput: Extras) {
  const extras = extrasSchema.parse(extrasInput)
  const rows = readCsv(csv)
  const problems: string[] = []
  const field = (row: Row, name: string) => (row[ns + name] ?? "").trim()

  // Chronological, so people are numbered in the order they first dived.
  const scuba = rows
    .toSorted((a, b) => byText(field(a, "datetime"), field(b, "datetime")))
    .filter((row) => {
      const log = field(row, "dive_type")
      if (log !== codes.scubaLog && log !== codes.freediveLog)
        problems.push(`${describe(row)}: unknown log type ${log}`)
      return log === codes.scubaLog
    })

  function describe(row: Row) {
    return `SSI dive ${field(row, "nr")} (${field(row, "datetime")}, ${unescapeHtml(field(row, "dive_sites_name"))})`
  }

  function lookup<T>(row: Row, name: string, table: Record<string, T>) {
    const value = code(field(row, name))
    if (!value) return null
    if (!(value in table)) {
      problems.push(`${describe(row)}: unknown ${name} code ${value}`)
      return null
    }
    return table[value]!
  }

  function number(row: Row, name: string) {
    const value = field(row, name)
    if (!value) return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      problems.push(`${describe(row)}: ${name} is not a number: ${value}`)
      return null
    }
    return parsed
  }

  const unusedOverrides = new Set(Object.keys(extras.dives))
  const leaveOut = new Set(extras.leaveOutPeople)
  const sites = new Map<
    string,
    { id: string; environment: string | null; country: string; region: string }
  >()
  const unmappedSites = new Set<string>()
  const people = new Map<string, string>()
  const tanks = new Map<string, Xml>()
  const mixes = new Map<string, Xml>()

  const dives = scuba.map((row) => {
    const ssiStart = field(row, "datetime")
    const extra = extras.dives[ssiStart]
    unusedOverrides.delete(ssiStart)
    const startTime = `${extra?.startTime ?? ssiStart.replace(" ", "T")}:00`

    const siteName = unescapeHtml(field(row, "dive_sites_name"))
    const water = lookup(row, "var_water_body_id", codes.bodiesOfWater)
    const place = extras.sites[siteName]
    if (!place) unmappedSites.add(siteName)
    const site = sites.get(siteName) ?? {
      id: `site-ssi-${field(row, "dive_sites_id")}`,
      environment: null,
      country: place?.country ?? "",
      region: place?.region ?? "",
    }
    // SSI logs the body of water per dive; Shylog keeps it on the site.
    if (water) {
      const environment = bodiesOfWater[water].uddf
      if (site.environment && site.environment !== environment)
        problems.push(`${describe(row)}: the site's body of water differs`)
      site.environment = environment
    }
    sites.set(siteName, site)

    const buddies = field(row, "buddy_names")
      .split(", ")
      .map((name) => unescapeHtml(name).trim())
      .filter((name) => name && !leaveOut.has(name))
      .map((name) => {
        if (!people.has(name)) people.set(name, `person-${people.size + 1}`)
        return people.get(name)!
      })

    const material = lookup(row, "var_tanktype_id", codes.cylinderMaterials)
    const litres = number(row, "tank_vol_l")
    let tank: string | null = null
    if (material || litres) {
      const ml = litres ? litresToMillilitres(litres) : null
      tank = `tank-${material ?? "unknown"}-${ml ?? "unknown"}`
      tanks.set(
        tank,
        element(
          "tank",
          [
            leaf(
              "name",
              `${ml ? `${ml / 1000} L ` : ""}${material ?? ""}`.trim()
            ),
            material
              ? leaf("tankmaterial", cylinderMaterials[material].uddf)
              : null,
            ml ? leaf("tankvolume", millilitresToCubicMetres(ml)) : null,
          ],
          ` id="${tank}"`
        )
      )
    }
    // Air is written as 0.21, which the import reads as air (D9).
    const percent =
      field(row, "ean") === "1" ? number(row, "ean_percent") : null
    const oxygen = percent ? percentToTenths(percent) : airTenths
    const mix = `mix-${oxygen}`
    mixes.set(
      mix,
      element(
        "mix",
        [
          leaf("name", oxygen === airTenths ? "air" : `EANx ${oxygen / 10}`),
          leaf("o2", tenthsToFraction(oxygen)),
        ],
        ` id="${mix}"`
      )
    )

    const diveType = lookup(row, "var_divetype_id", codes.diveTypes)
    const course = extra?.trainingCourse ?? null
    if (course && diveType !== "training")
      problems.push(`${describe(row)}: a course on a dive that isn't training`)
    const tagKeys = new Set<Tag>(extra?.tags)
    for (const special of field(row, "var_specialdive_id").split(",")) {
      if (!special) continue
      if (!(special in codes.specialDives))
        problems.push(`${describe(row)}: unknown special dive code ${special}`)
      else if (codes.specialDives[special])
        tagKeys.add(codes.specialDives[special])
    }

    const minC =
      extra?.minTemperature !== undefined
        ? extra.minTemperature
        : number(row, "watertemp_c")
    const maxC =
      extra?.maxTemperature !== undefined
        ? extra.maxTemperature
        : number(row, "watertemp_max_c")
    if (minC != null && maxC != null && minC > maxC)
      problems.push(`${describe(row)}: water temperature minimum above maximum`)
    const maxDepth = number(row, "depth_m")
    const averageDepth = number(row, "avg_depth_m")
    if (maxDepth == null) problems.push(`${describe(row)}: no max depth`)
    if (averageDepth != null && maxDepth != null && averageDepth > maxDepth)
      problems.push(`${describe(row)}: average depth below max depth`)
    const minutes = number(row, "divetime")
    if (!minutes) problems.push(`${describe(row)}: no duration`)
    const startBar = number(row, "pressure_start_bar")
    const endBar = number(row, "pressure_end_bar")
    const weight = number(row, "weight_kg")
    const surface = lookup(row, "var_surface_id", codes.surfaces)
    const weather = lookup(row, "var_weather_id", codes.weathers)
    const entry = lookup(row, "var_entry_id", codes.entries)
    const current = lookup(row, "var_current_id", codes.currents)
    const comment = unescapeHtml(field(row, "comment"))
    const gear = unescapeHtml(field(row, "gear_details"))

    const shylog = element(
      "shylog",
      [
        leaf("surface", surface),
        leaf("weather", weather),
        leaf("maxTemperature", maxC == null ? null : celsiusToKelvin(maxC)),
        diveType === "training" ? leaf("trainingAgency", ssiAgency) : null,
        diveType === "training" ? leaf("trainingCourse", course) : null,
        leaf("gearDetails", gear || null),
        ...keysOf(tags)
          .filter((key) => tagKeys.has(key))
          .map((key) => leaf("tag", key)),
      ],
      ` xmlns="${shylogNamespace}"`
    )

    const xml = element(
      "dive",
      [
        element("informationbeforedive", [
          // Buddies first: Subsurface writes ", " after any link a buddy
          // follows, so a site link first gives its buddy list a leading comma.
          ...buddies.map(link),
          link(site.id),
          leaf("datetime", startTime),
          leaf("platform", entry && entries[entry].uddf),
        ]),
        shylog.length > 1 ? element("applicationdata", [shylog]) : null,
        // UDDF requires a start pressure here, but without one the dive
        // would lose its gas and cylinder, so Subsurface's habit is kept.
        // The mix first: Subsurface takes the gas from the first link.
        element("tankdata", [
          link(mix),
          tank ? link(tank) : null,
          leaf(
            "tankvolume",
            litres
              ? millilitresToCubicMetres(litresToMillilitres(litres))
              : null
          ),
          leaf(
            "tankpressurebegin",
            startBar == null ? null : barToPascals(startBar)
          ),
          leaf("tankpressureend", endBar == null ? null : barToPascals(endBar)),
        ]),
        element("informationafterdive", [
          leaf("greatestdepth", maxDepth),
          leaf("averagedepth", averageDepth),
          leaf("diveduration", minutes ? minutesToSeconds(minutes) : null),
          leaf(
            "lowesttemperature",
            minC == null ? null : celsiusToKelvin(minC)
          ),
          leaf("visibility", number(row, "vis_m")),
          leaf("current", current && currents[current].uddf),
          leaf("program", diveType && diveTypes[diveType].uddf),
          weight == null
            ? null
            : element("equipmentused", [leaf("leadquantity", weight)]),
          comment ? element("notes", [leaf("para", comment)]) : null,
        ]),
      ],
      ` id="dive-ssi-${field(row, "id")}"`
    )
    return { startTime, xml }
  })

  for (const name of unmappedSites)
    problems.push(`Site "${name}" is missing from the extras file's sites`)
  for (const key of unusedOverrides)
    problems.push(
      `The extras file names a dive at ${key}, which isn't in the CSV`
    )
  if (problems.length) throw new Error(problems.join("\n"))

  dives.sort((a, b) => byText(a.startTime, b.startTime))

  const uddf = element(
    "uddf",
    [
      element("generator", [
        leaf("name", generatorName),
        leaf("type", "converter"),
      ]),
      element("diver", [
        element(
          "owner",
          [
            element("personal", [leaf("firstname", ""), leaf("lastname", "")]),
            tanks.size ? element("equipment", [...tanks.values()]) : null,
          ],
          ' id="owner"'
        ),
        ...[...people].map(([name, id]) => {
          const { first, last } = splitName(name)
          return element(
            "buddy",
            [
              element("personal", [
                leaf("firstname", first),
                leaf("lastname", last),
              ]),
            ],
            ` id="${id}"`
          )
        }),
      ]),
      element(
        "divesite",
        [...sites].map(([name, site]) =>
          element(
            "site",
            [
              leaf("name", name),
              leaf("environment", site.environment),
              element("geography", [
                leaf("location", site.region),
                element("address", [leaf("country", site.country)]),
              ]),
            ],
            ` id="${site.id}"`
          )
        )
      ),
      element("gasdefinitions", [...mixes.values()]),
      // Every dive in its own repetition group, as Shylog's export writes.
      element(
        "profiledata",
        dives.map(({ xml }, i) =>
          element("repetitiongroup", [xml], ` id="group-${i + 1}"`)
        )
      ),
    ],
    ` xmlns="http://www.streit.cc/uddf/3.2/" version="3.2.1"`
  )
  return {
    xml: `<?xml version="1.0" encoding="utf-8"?>\n${uddf.join("\n")}\n`,
    dives: dives.length,
    freedives: rows.length - scuba.length,
  }
}
