import type { Migration } from "../migrate.ts"

const schema = /* sql */ `
-- Deleted entities leave no row, so this is how a re-sent draft that still
-- names one is told it was deleted, and how a repeated delete is a no-op.
CREATE TABLE deleted_entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL
) STRICT;

-- No write path stored card images before this, so the table is rebuilt
-- empty. hash is the start of the bytes' SHA-256 and names the file at
-- cards/<card id>/<hash>.
DROP TABLE certification_images;
CREATE TABLE certification_images (
  card_id TEXT NOT NULL REFERENCES certifications (id),
  n INTEGER NOT NULL CHECK (n >= 0),
  content_type TEXT NOT NULL,
  hash TEXT NOT NULL CHECK (length(hash) = 16),
  PRIMARY KEY (card_id, n)
) STRICT, WITHOUT ROWID;
`

export const tombstonesCardHashes: Migration = {
  version: 2,
  name: "tombstones-card-hashes",
  up(db) {
    db.exec(schema)
  },
}
