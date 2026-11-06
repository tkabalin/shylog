import type { Migration } from "../migrate.ts"

// A preview keeps the uploaded file, which apply reads again for the
// samples, sites and each dive's fragment. No preview was ever stored
// before this, so the table is made again rather than given a default.
export const importPreviewFile: Migration = {
  version: 6,
  name: "import-preview-file",
  up(db) {
    db.exec(`
      DROP TABLE import_previews;
      CREATE TABLE import_previews (
        id TEXT PRIMARY KEY,
        data_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        preview TEXT NOT NULL CHECK (json_valid(preview)),
        uddf TEXT NOT NULL
      ) STRICT;
    `)
  },
}
