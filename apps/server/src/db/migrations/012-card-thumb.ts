import type { Migration } from "../migrate.ts"

// A card's crop of its first page for the thumbnails, as JSON with the hash
// of the page it was made on, or null for the page's centre.
export const cardThumb: Migration = {
  version: 12,
  name: "card-thumb",
  up(db) {
    db.exec(`
      ALTER TABLE certifications ADD COLUMN thumb TEXT CHECK (thumb IS NULL OR json_valid(thumb));
    `)
  },
}
