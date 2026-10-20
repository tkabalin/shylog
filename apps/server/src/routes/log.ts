import { settingsSchema } from "@shylog/core"

import { schemaVersion } from "../db/migrate.ts"
import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { factory } from "../factory.ts"
import { currentVersion } from "../journal.ts"

// Columns under the names core's schemas use. Choice fields stay as core's
// keys; the client maps them to labels.
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
  surface_interval_override AS surfaceIntervalOverride, weight,
  cylinder_material AS cylinderMaterial, cylinder_volume AS cylinderVolume,
  nitrox, oxygen, start_pressure AS startPressure,
  end_pressure AS endPressure, notable_animals AS notableAnimals,
  gear_details AS gearDetails, notes, ignored,
  computer_model AS computerModel, cns, otu, sparkline,
  ascent_alarm_count AS ascentAlarmCount, deleted_at AS deletedAt`

interface DiveRow {
  id: string
  number: number | null
  startTime: string
  siteId: string
  duration: number
  maxDepth: number
  diveType: string
  trainingAgency: string | null
  trainingCourse: string | null
  tripId: string | null
  diveCentreId: string | null
  entry: string | null
  current: string | null
  surge: string | null
  surface: string | null
  weather: string | null
  minTemperature: number | null
  maxTemperature: number | null
  visibility: number | null
  visibilityRating: string | null
  workload: string | null
  thermalComfort: string | null
  averageDepth: number | null
  surfaceInterval: number | null
  surfaceIntervalOverride: number
  weight: number | null
  cylinderMaterial: string | null
  cylinderVolume: number | null
  nitrox: number
  oxygen: number | null
  startPressure: number | null
  endPressure: number | null
  notableAnimals: string | null
  gearDetails: string | null
  notes: string | null
  ignored: number
  computerModel: string | null
  cns: number | null
  otu: number | null
  sparkline: string | null
  ascentAlarmCount: number
  deletedAt: string | null
}

const dive = (row: DiveRow) => ({
  ...row,
  // "none" is no previous dive, as core's schemas write it.
  surfaceInterval: row.surfaceInterval ?? ("none" as const),
  surfaceIntervalOverride: row.surfaceIntervalOverride === 1,
  nitrox: row.nitrox === 1,
  ignored: row.ignored === 1,
  sparkline: row.sparkline ? (JSON.parse(row.sparkline) as number[]) : null,
})

const all = <T>(db: Db, sql: string) => prepared<[], T>(db, sql).all()

// The whole log but samples, read in one transaction so it matches the
// version it is tagged with.
function readLog(db: Db) {
  return db.transaction(() => {
    const settings = prepared(
      db,
      "SELECT diver_name AS diverName, max_po2 AS maxPo2, new_dive_defaults AS newDiveDefaults FROM settings"
    ).get() as { diverName: string; maxPo2: number; newDiveDefaults: string }
    return {
      // The database's own, which lags the code's if a failed check
      // stopped the migration.
      schemaVersion: schemaVersion(db),
      version: currentVersion(db)!,
      serverTime: new Date().toISOString(),
      // Deleted dives too, with deletedAt, for Recently deleted.
      dives: all<DiveRow>(
        db,
        `SELECT ${diveColumns} FROM dives ORDER BY start_time, seq`
      ).map(dive),
      sites: all<{
        id: string
        name: string
        countryCode: string
        regionId: string | null
        bodyOfWater: string | null
        waterType: string
      }>(
        db,
        "SELECT id, name, country_code AS countryCode, region_id AS regionId, body_of_water AS bodyOfWater, water_type AS waterType FROM sites ORDER BY name"
      ),
      countries: prepared(db, "SELECT code FROM countries ORDER BY code")
        .pluck()
        .all() as string[],
      regions: all<{ id: string; name: string; countryCode: string }>(
        db,
        "SELECT id, name, country_code AS countryCode FROM regions ORDER BY name"
      ),
      people: all<{ id: string; name: string }>(
        db,
        "SELECT id, name FROM people ORDER BY name"
      ),
      diveCentres: all<{ id: string; name: string; regionId: string | null }>(
        db,
        "SELECT id, name, region_id AS regionId FROM dive_centres ORDER BY name"
      ),
      trips: all<{ id: string; name: string }>(
        db,
        "SELECT id, name FROM trips ORDER BY name"
      ),
      // One row per link, so the client can mirror them as one table.
      links: all<{
        diveId: string
        type: "buddy" | "professional" | "tag"
        target: string
        position: number
      }>(
        db,
        `SELECT dive_id AS diveId, 'buddy' AS type, person_id AS target, position FROM dive_buddies
         UNION ALL
         SELECT dive_id, 'professional', person_id, position FROM dive_professionals
         UNION ALL
         SELECT dive_id, 'tag', tag, 0 FROM dive_tags
         ORDER BY diveId, type, position, target`
      ),
      fieldMeta: all<{
        diveId: string
        field: string
        source: "hand" | "computer"
        computerValue: string | number | null
        dismissed: number
      }>(
        db,
        "SELECT dive_id AS diveId, field, source, computer_value AS computerValue, dismissed FROM field_meta ORDER BY dive_id, field"
      ).map((row) => ({ ...row, dismissed: row.dismissed === 1 })),
      settings: settingsSchema.parse({
        ...settings,
        newDiveDefaults: JSON.parse(settings.newDiveDefaults),
      }),
      cards: all<{ id: string; name: string; images: number }>(
        db,
        `SELECT id, name, (SELECT count(*) FROM certification_images WHERE card_id = id) AS images
         FROM certifications ORDER BY position`
      ),
    }
  })()
}

export type Log = ReturnType<typeof readLog>

export const log = factory.createApp().get("/log", (c) => {
  const { db } = c.var.deps
  // The log is personal and changes with every write.
  c.header("Cache-Control", "private, no-cache")
  const sent = c.req
    .header("If-None-Match")
    ?.split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
  const current = `"${currentVersion(db)}"`
  if (sent?.includes(current)) {
    c.header("ETag", current)
    return c.body(null, 304)
  }
  // Tagged with the version read alongside the data, not a moment before.
  const body = readLog(db)
  c.header("ETag", `"${body.version}"`)
  return c.json(body)
})
