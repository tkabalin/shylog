import type { Id, Packing } from "@shylog/core"

import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"

export function readPacking(db: Db): Packing {
  const sections = prepared<[], { id: Id<"packingSection">; name: string }>(
    db,
    "SELECT id, name FROM packing_sections ORDER BY position"
  ).all()
  const items = prepared<
    [],
    { id: Id<"packingItem">; sectionId: string; name: string }
  >(
    db,
    "SELECT id, section_id AS sectionId, name FROM packing_items ORDER BY section_id, position"
  ).all()
  const bySection = new Map<string, Packing["sections"][number]["items"]>()
  for (const { id, sectionId, name } of items) {
    const list = bySection.get(sectionId) ?? []
    list.push({ id, name })
    bySection.set(sectionId, list)
  }
  return {
    sections: sections.map((section) => ({
      ...section,
      items: bySection.get(section.id) ?? [],
    })),
  }
}

// The list as values in order, whatever order its objects' keys are in.
const values = (packing: Packing) =>
  JSON.stringify(
    packing.sections.map((section) => [
      section.id,
      section.name,
      section.items.map((item) => [item.id, item.name]),
    ])
  )

// The whole list replaced by the one sent, which the phone edited as a
// whole; the same list again writes nothing and keeps the data version.
export function putPacking(db: Db, packing: Packing): boolean {
  if (values(readPacking(db)) === values(packing)) return false
  // Its items go with each section.
  prepared(db, "DELETE FROM packing_sections").run()
  packing.sections.forEach((section, position) => {
    prepared(
      db,
      "INSERT INTO packing_sections (id, position, name) VALUES (?, ?, ?)"
    ).run(section.id, position, section.name)
    section.items.forEach((item, n) =>
      prepared(
        db,
        "INSERT INTO packing_items (id, section_id, position, name) VALUES (?, ?, ?, ?)"
      ).run(item.id, section.id, n, item.name)
    )
  })
  return true
}
