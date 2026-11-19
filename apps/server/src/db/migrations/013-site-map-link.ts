import type { Migration } from "../migrate.ts"

// The dive site on Explore's map a site was added from, by the map's id,
// or null for a site typed in by hand.
export const siteMapLink: Migration = {
  version: 13,
  name: "site-map-link",
  up(db) {
    db.exec(`
      ALTER TABLE sites ADD COLUMN map_site TEXT;
    `)
  },
}
