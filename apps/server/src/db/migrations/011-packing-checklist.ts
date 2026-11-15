import type { Migration } from "../migrate.ts"

// The owner's default list. Fixed ids rather than fresh ones, so a journal
// replay of this migration makes the same rows the restore drill compares.
const defaults: [string, string[]][] = [
  [
    "Hard gear",
    [
      "BCD",
      "Regulator",
      "Cylinder",
      "Dive computer",
      "Compass",
      "Weight belt",
      "Weights",
    ],
  ],
  [
    "Soft gear",
    ["Mask", "Snorkel", "Fins", "Boots", "Wetsuit", "Hood", "Gloves"],
  ],
  ["Accessories", ["SMB", "Dive light (charged)", "Cutting tool", "Defog"]],
  [
    "Personal",
    [
      "Towel",
      "Change of clothes",
      "Warm layer",
      "Water",
      "Snacks",
      "Sunscreen",
      "Pain killers",
    ],
  ],
]

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

// The packing checklist: sections in order, each holding its items in
// order. Saving replaces the lot, so a deleted section's items go with it.
export const packingChecklist: Migration = {
  version: 11,
  name: "packing-checklist",
  up(db) {
    db.exec(`
      CREATE TABLE packing_sections (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120)
      ) STRICT;
      CREATE TABLE packing_items (
        id TEXT PRIMARY KEY,
        section_id TEXT NOT NULL REFERENCES packing_sections (id) ON DELETE CASCADE,
        position INTEGER NOT NULL CHECK (position >= 0),
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        UNIQUE (section_id, position)
      ) STRICT;
    `)
    const section = db.prepare(
      "INSERT INTO packing_sections (id, position, name) VALUES (?, ?, ?)"
    )
    const item = db.prepare(
      "INSERT INTO packing_items (id, section_id, position, name) VALUES (?, ?, ?, ?)"
    )
    defaults.forEach(([name, items], position) => {
      const id = `section-${slug(name)}`
      section.run(id, position, name)
      items.forEach((itemName, n) =>
        item.run(`item-${slug(itemName)}`, id, n, itemName)
      )
    })
  },
}
