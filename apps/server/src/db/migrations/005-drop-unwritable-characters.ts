import { dropUnwritable, normaliseName, placeKey } from "@shylog/core"

import type { Migration } from "../migrate.ts"

// Names and text now drop the characters XML can't hold when saved (see UDDF
// export), so stored ones are cleaned too. Journal entries from before this
// replay with the code that wrote them, as after any migration.
export const dropUnwritableCharacters: Migration = {
  version: 5,
  name: "drop-unwritable-characters",
  up(db) {
    const clean = (value: string) => dropUnwritable(value).trim()
    const entities = [
      ["regions", true],
      ["sites", true],
      ["people", false],
      ["dive_centres", false],
      ["trips", false],
    ] as const
    for (const [table, place] of entities) {
      const rows = db
        .prepare<[], { id: string; name: string; country: string | null }>(
          `SELECT id, name, ${place ? "country_code" : "NULL"} AS country FROM ${table}`
        )
        .all()
      const taken = db.prepare(
        `SELECT 1 FROM ${table} WHERE key = ? AND id != ?`
      )
      const update = db.prepare(
        `UPDATE ${table} SET name = ?, key = ? WHERE id = ?`
      )
      for (const row of rows) {
        const name = clean(row.name)
        // A name of nothing else, or one that would now match another
        // entity, is kept: renaming or merging it is the diver's call.
        if (name === row.name || !name) continue
        const key = place ? placeKey(name, row.country!) : normaliseName(name)
        if (!taken.get(key, row.id)) update.run(name, key, row.id)
      }
    }

    const cards = db
      .prepare<[], { id: string; name: string }>(
        "SELECT id, name FROM certifications"
      )
      .all()
    const card = db.prepare("UPDATE certifications SET name = ? WHERE id = ?")
    for (const row of cards) {
      const name = clean(row.name)
      if (name !== row.name && name) card.run(name, row.id)
    }

    const diver = db.prepare("SELECT diver_name FROM settings").pluck().get()
    if (typeof diver === "string" && clean(diver) !== diver)
      db.prepare("UPDATE settings SET diver_name = ?").run(clean(diver))

    // An emptied text field is no value, with no source, as when saved.
    const texts = {
      training_agency: "trainingAgency",
      training_course: "trainingCourse",
      notable_animals: "notableAnimals",
      gear_details: "gearDetails",
      notes: "notes",
    }
    const forget = db.prepare(
      "DELETE FROM field_meta WHERE dive_id = ? AND field = ?"
    )
    for (const [column, field] of Object.entries(texts)) {
      const rows = db
        .prepare<[], { id: string; text: string }>(
          `SELECT id, ${column} AS text FROM dives WHERE ${column} IS NOT NULL`
        )
        .all()
      const update = db.prepare(`UPDATE dives SET ${column} = ? WHERE id = ?`)
      for (const row of rows) {
        const text = clean(row.text)
        if (text === row.text) continue
        update.run(text || null, row.id)
        if (!text) forget.run(row.id, field)
      }
    }
  },
}
