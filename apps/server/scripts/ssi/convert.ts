import { createHash } from "node:crypto"

import {
  countryCodes,
  entries,
  keysOf,
  litresToMillilitres,
  minutesToSeconds,
  normaliseName,
  opVersion,
  percentToTenths,
  tags,
  uploadDraftRequest,
  type BodyOfWater,
  type Tag,
  type UploadDraftRequest,
} from "@shylog/core"
import { z } from "zod"

import * as codes from "./codes.ts"
import { readCsv } from "./csv.ts"

// Converts the MySSI logbook, as the home server's weekly export job saves
// it, to one offline draft per dive for a one-off upload. SSI dives were
// logged by hand, which is what a draft's values are.

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
        // SSI has one kind of boat, so a charter boat is set here.
        entry: z.enum(keysOf(entries)).optional(),
        // Already logged in Shylog by hand, so the SSI copy isn't sent.
        skip: z.literal(true).optional(),
      })
    )
    .default({}),
})
export type Extras = z.input<typeof extrasSchema>

type Row = Record<string, string>
type Place = Extras["sites"][string]

const ns = "odin_user_log_"
const ssiAgency = "SSI"
const airTenths = 210

// SSI stores some names HTML-escaped ("I &amp; J").
const named: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}
const unescapeHtml = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return named[entity] ?? match
    const point =
      entity[1] === "x"
        ? parseInt(entity.slice(2), 16)
        : Number(entity.slice(1))
    return point <= 0x10ffff ? String.fromCodePoint(point) : match
  })

// pandas writes a code from a column with gaps as a float ("24.0").
const code = (value: string) => value.replace(/\.0$/, "")

// An id from what names the entity rather than when it first appears, so a
// rerun on a CSV with dives added or people left out never moves an id the
// server already holds onto someone else.
const keyedId = (kind: "person" | "region", key: string) =>
  `${kind}-ssi-${createHash("sha256").update(normaliseName(key)).digest("hex").slice(0, 12)}`

// Local datetimes sort as text.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// `at` is the drafts' timestamp, for the server's two-year age rule, which
// looks at when a draft was made, not when the dive was.
export function convertSsi(
  csv: string,
  extrasInput: Extras,
  at: string
): {
  drafts: UploadDraftRequest[]
  dives: number
  freedives: number
  skipped: number
} {
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

  // Text with SSI's HTML escapes undone; one it doesn't know stops the run
  // rather than reaching the log as "&hellip;".
  function text(row: Row, name: string) {
    const value = unescapeHtml(field(row, name))
    const left = /&(#x[0-9a-f]+|#\d+|[a-z]+);/i.exec(value)
    if (left) problems.push(`${describe(row)}: ${name} has ${left[0]}`)
    return value
  }

  // 0 is read as not logged: no dive has an average depth or visibility of
  // 0, and a dive without weights logs none rather than 0 kg.
  function measured(row: Row, name: string) {
    return number(row, name) || null
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
  // Matched as people are on the server, ignoring case, spacing and accents.
  const leaveOut = new Map(
    extras.leaveOutPeople.map((name) => [normaliseName(name), name])
  )
  const leftOut = new Set<string>()
  const siteIds = new Map<string, string>()
  const regions = new Map<string, string>()
  const sites = new Map<
    string,
    { id: string; bodyOfWater: BodyOfWater | null; place: Place | undefined }
  >()
  const unmappedSites = new Set<string>()
  const people = new Map<string, string>()

  const dives = scuba.flatMap((row) => {
    const ssiId = code(field(row, "id"))
    const ssiStart = field(row, "datetime")
    const extra = extras.dives[ssiStart]
    unusedOverrides.delete(ssiStart)
    // Read before a skip, so a name left out only on skipped dives counts.
    const buddies = field(row, "buddy_names")
      .split(", ")
      .map((name) => unescapeHtml(name).trim())
      .filter((name) => {
        if (!leaveOut.has(normaliseName(name))) return true
        leftOut.add(normaliseName(name))
        return false
      })
      .filter(Boolean)
    if (extra?.skip) return []
    const startTime = `${extra?.startTime ?? ssiStart.replace(" ", "T")}:00`

    const siteName = text(row, "dive_sites_name")
    // One SSI site per name, so ids and names can't cross.
    const ssiSite = code(field(row, "dive_sites_id"))
    const named = siteIds.get(siteName)
    if (named && named !== ssiSite)
      problems.push(`${describe(row)}: two SSI sites are called "${siteName}"`)
    siteIds.set(siteName, ssiSite)
    for (const [other, id] of siteIds)
      if (id === ssiSite && other !== siteName)
        problems.push(
          `${describe(row)}: SSI site ${ssiSite} is called "${other}" and "${siteName}"`
        )
    const water = lookup(row, "var_water_body_id", codes.bodiesOfWater)
    const place = extras.sites[siteName]
    if (!place) unmappedSites.add(siteName)
    const site = sites.get(siteName) ?? {
      id: `site-ssi-${ssiSite}`,
      bodyOfWater: null,
      place,
    }
    // SSI logs the body of water per dive; Shylog keeps it on the site.
    if (water) {
      if (site.bodyOfWater && site.bodyOfWater !== water)
        problems.push(`${describe(row)}: the site's body of water differs`)
      site.bodyOfWater = water
    }
    sites.set(siteName, site)
    const regionKey = place && `${place.country} ${place.region}`
    if (regionKey && !regions.has(regionKey))
      regions.set(regionKey, keyedId("region", regionKey))

    for (const name of buddies)
      if (!people.has(name)) people.set(name, keyedId("person", name))

    const material = lookup(row, "var_tanktype_id", codes.cylinderMaterials)
    const litres = number(row, "tank_vol_l")
    const percent =
      field(row, "ean") === "1" ? number(row, "ean_percent") : null
    // 21 % or less is air, as the dive form saves it.
    const oxygen = percent ? percentToTenths(percent) : null
    const nitrox = oxygen != null && oxygen > airTenths

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
    const averageDepth = measured(row, "avg_depth_m")
    if (maxDepth == null) problems.push(`${describe(row)}: no max depth`)
    if (averageDepth != null && maxDepth != null && averageDepth > maxDepth)
      problems.push(`${describe(row)}: average depth below max depth`)
    const minutes = number(row, "divetime")
    if (!minutes) problems.push(`${describe(row)}: no duration`)
    const comment = text(row, "comment")
    const gear = text(row, "gear_details")

    // Only what SSI holds, so the server records nothing else as typed.
    const fields = Object.fromEntries(
      Object.entries({
        startTime,
        siteId: site.id,
        duration: minutes ? minutesToSeconds(minutes) : null,
        maxDepth,
        averageDepth,
        diveType,
        trainingAgency: diveType === "training" ? ssiAgency : null,
        trainingCourse: diveType === "training" ? course : null,
        tags: keysOf(tags).filter((key) => tagKeys.has(key)),
        buddies: buddies.map((name) => people.get(name)!),
        entry: extra?.entry ?? lookup(row, "var_entry_id", codes.entries),
        current: lookup(row, "var_current_id", codes.currents),
        surface: lookup(row, "var_surface_id", codes.surfaces),
        weather: lookup(row, "var_weather_id", codes.weathers),
        minTemperature: minC,
        maxTemperature: maxC,
        visibility: measured(row, "vis_m"),
        weight: measured(row, "weight_kg"),
        cylinderMaterial: material,
        cylinderVolume: litres ? litresToMillilitres(litres) : null,
        nitrox,
        oxygen: nitrox ? oxygen : null,
        startPressure: number(row, "pressure_start_bar"),
        endPressure: number(row, "pressure_end_bar"),
        gearDetails: gear || null,
        notes: comment || null,
      }).filter(
        ([, value]) =>
          value != null && !(Array.isArray(value) && value.length === 0)
      )
    )
    return [{ ssiId, row, startTime, siteName, buddies, fields }]
  })

  for (const name of unmappedSites)
    problems.push(`Site "${name}" is missing from the extras file's sites`)
  for (const [key, name] of leaveOut)
    if (!leftOut.has(key))
      problems.push(`The extras file leaves out ${name}, who is on no dive`)
  for (const key of unusedOverrides)
    problems.push(
      `The extras file names a dive at ${key}, which isn't in the CSV`
    )
  if (problems.length) throw new Error(problems.join("\n"))

  const base = (opId: string) => ({
    opId: `op-ssi-${opId}`,
    opVersion,
    deviceId: "device-ssi-import",
    at,
  })

  const drafts = dives
    .toSorted((a, b) => byText(a.startTime, b.startTime))
    .map(({ ssiId, row, siteName, buddies, fields }) => {
      // Every draft creates what its dive names, so each stands alone: the
      // server uses an entity it already has as it is.
      const site = sites.get(siteName)!
      const place = site.place!
      const regionId = regions.get(`${place.country} ${place.region}`)!
      const ops: unknown[] = [
        {
          ...base(`${ssiId}-region`),
          type: "upsertEntity",
          kind: "region",
          id: regionId,
          fields: { name: place.region, countryCode: place.country },
        },
        {
          ...base(`${ssiId}-site`),
          type: "upsertEntity",
          kind: "site",
          id: site.id,
          fields: {
            name: siteName,
            countryCode: place.country,
            regionId,
            ...(site.bodyOfWater && { bodyOfWater: site.bodyOfWater }),
          },
        },
        ...buddies.map((name) => ({
          ...base(`${ssiId}-${people.get(name)!}`),
          type: "upsertEntity",
          kind: "person",
          id: people.get(name)!,
          fields: { name },
        })),
        {
          ...base(`${ssiId}-dive`),
          type: "upsertDive",
          diveId: `dive-ssi-${ssiId}`,
          fields,
        },
      ]
      // Checked here, so a bad value stops the run before anything is sent,
      // naming the op it is in ("person name", "dive endPressure").
      const parsed = uploadDraftRequest.safeParse({ ops })
      if (!parsed.success) {
        const where = (path: PropertyKey[]) => {
          const op = ops[Number(path[1])] as { kind?: string } | undefined
          return [op ? (op.kind ?? "dive") : null, ...path.slice(3)]
            .filter((part) => part != null)
            .join(" ")
        }
        throw new Error(
          `${describe(row)}: ${parsed.error.issues.map((issue) => `${where(issue.path)}: ${issue.message}`).join("; ")}`
        )
      }
      return parsed.data
    })

  return {
    drafts,
    dives: drafts.length,
    freedives: rows.length - scuba.length,
    skipped: scuba.length - drafts.length,
  }
}
