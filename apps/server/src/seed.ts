import { newId, placeKey } from "@shylog/core"

import type { Db } from "./db/open.ts"
import { recalculate, sampleTemperatures } from "./derived.ts"
import { write } from "./journal.ts"
import { storeProfile } from "./profile.ts"
import { readUddf } from "./uddf/sample-reader.ts"

// The fixture names no sites, so its Sodwana week gets a Sodwana site and
// every other dive one unnamed site, both in South Africa.
const sodwanaWeek = { from: "2026-07-17", to: "2026-07-22" }

// Dev only: loads a Subsurface export into an empty log as computer values,
// with derived fields filled and one journal entry.
export function seed(db: Db, xml: string, source: string) {
  if (db.prepare("SELECT 1 FROM dives").get()) {
    throw new Error("The log already has dives; seed an empty one")
  }
  const dives = readUddf(xml)

  return write(db, (journal) => {
    const site = db.prepare(
      "INSERT INTO sites (id, name, key, country_code, body_of_water, water_type) VALUES (?, ?, ?, 'ZA', ?, 'salt')"
    )
    const sites = {
      sodwana: newId("site"),
      unnamed: newId("site"),
    }
    site.run(sites.sodwana, "Sodwana", placeKey("Sodwana", "ZA"), "oceanSea")
    site.run(
      sites.unnamed,
      "Unnamed site",
      placeKey("Unnamed site", "ZA"),
      null
    )

    const insert = db.prepare(
      `INSERT INTO dives (id, start_time, site_id, duration, max_depth,
         average_depth, min_temperature, max_temperature, nitrox, oxygen,
         computer_model)
       VALUES (@id, @startTime, @siteId, @duration, @maxDepth, @averageDepth,
         @minTemperature, @maxTemperature, @nitrox, @oxygen, @computerModel)`
    )
    const meta = db.prepare(
      "INSERT INTO field_meta (dive_id, field, source) VALUES (?, ?, 'computer')"
    )
    for (const dive of dives) {
      const id = newId("dive")
      const day = dive.startTime.slice(0, 10)
      // The computer's minimum and maximum are its sample extremes (D10).
      const temperatures = sampleTemperatures(dive.samples)
      const fields = {
        startTime: dive.startTime,
        duration: dive.duration,
        maxDepth: dive.maxDepth,
        averageDepth: dive.averageDepth,
        minTemperature: temperatures.min,
        maxTemperature: temperatures.max,
        nitrox: dive.oxygen == null ? 0 : 1,
        oxygen: dive.oxygen,
      }
      insert.run({
        ...fields,
        id,
        siteId:
          day >= sodwanaWeek.from && day <= sodwanaWeek.to
            ? sites.sodwana
            : sites.unnamed,
        computerModel: dive.computerModel,
      })
      for (const [field, value] of Object.entries(fields)) {
        if (value != null) meta.run(id, field)
      }
      storeProfile(db, id, dive.duration, dive.samples, dive.events)
    }
    recalculate(db)
    journal({ type: "seed", payload: { source, dives: dives.length } })
    return dives.length
  })
}
