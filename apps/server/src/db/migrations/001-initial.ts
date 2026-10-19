import { countryCodes } from "@shylog/core"

import type { Migration } from "../migrate.ts"

// Database units throughout (see Units in the spec): metres, seconds, °C,
// bar, millilitres, and oxygen in tenths of a per cent. Choice fields hold
// core's camelCase keys, which core validates; the checks here are the rules
// that span columns, so no write path can break them.
const schema = /* sql */ `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
) STRICT;

CREATE TABLE countries (
  code TEXT PRIMARY KEY CHECK (length(code) = 2)
) STRICT;

-- key is placeKey(name, country) for sites and regions and normaliseName(name)
-- for the rest, written by the server, so alike names collide here.
CREATE TABLE regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL REFERENCES countries (code)
) STRICT;

CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL REFERENCES countries (code),
  region_id TEXT REFERENCES regions (id),
  body_of_water TEXT,
  water_type TEXT NOT NULL CHECK (water_type IN ('salt', 'fresh'))
) STRICT;

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE dive_centres (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  region_id TEXT REFERENCES regions (id)
) STRICT;

CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE
) STRICT;

-- seq is the order dives were written, which breaks ties between equal start
-- times. It is an explicit integer key because VACUUM may renumber a rowid.
CREATE TABLE dives (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  start_time TEXT NOT NULL CHECK (
    start_time GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'
  ),
  site_id TEXT NOT NULL REFERENCES sites (id),
  duration INTEGER NOT NULL CHECK (duration > 0),
  max_depth REAL NOT NULL CHECK (max_depth > 0),
  dive_type TEXT NOT NULL DEFAULT 'recreation',
  training_agency TEXT,
  training_course TEXT,
  trip_id TEXT REFERENCES trips (id),
  dive_centre_id TEXT REFERENCES dive_centres (id),
  entry TEXT,
  current TEXT,
  surge TEXT,
  surface TEXT,
  weather TEXT,
  min_temperature REAL,
  max_temperature REAL,
  visibility REAL CHECK (visibility >= 0),
  visibility_rating TEXT,
  workload TEXT,
  thermal_comfort TEXT,
  average_depth REAL CHECK (average_depth > 0),
  -- Seconds, or null for no previous dive. Derived unless overridden by hand.
  surface_interval INTEGER CHECK (surface_interval >= 0),
  surface_interval_override INTEGER NOT NULL DEFAULT 0
    CHECK (surface_interval_override IN (0, 1)),
  weight REAL CHECK (weight >= 0),
  cylinder_material TEXT,
  cylinder_volume INTEGER CHECK (cylinder_volume > 0),
  nitrox INTEGER NOT NULL DEFAULT 0 CHECK (nitrox IN (0, 1)),
  oxygen INTEGER CHECK (oxygen BETWEEN 211 AND 1000),
  start_pressure REAL CHECK (start_pressure >= 0),
  end_pressure REAL CHECK (end_pressure >= 0),
  notable_animals TEXT,
  gear_details TEXT,
  notes TEXT,
  ignored INTEGER NOT NULL DEFAULT 0 CHECK (ignored IN (0, 1)),
  computer_model TEXT,
  -- Derived: number is null for an ignored or deleted dive, CNS and OTU for
  -- a deleted one or one without samples.
  number INTEGER CHECK (number > 0),
  cns INTEGER,
  otu INTEGER,
  -- Stored when samples are written (D2): a JSON array of 24 depths.
  sparkline TEXT CHECK (sparkline IS NULL OR json_valid(sparkline)),
  ascent_alarm_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  CHECK (visibility IS NULL OR visibility_rating IS NULL),
  CHECK ((nitrox = 1) = (oxygen IS NOT NULL)),
  CHECK (
    dive_type = 'training' OR (training_agency IS NULL AND training_course IS NULL)
  ),
  CHECK (min_temperature <= max_temperature),
  CHECK (average_depth <= max_depth)
) STRICT;
CREATE INDEX dives_start_time ON dives (start_time);

CREATE TABLE dive_buddies (
  dive_id TEXT NOT NULL REFERENCES dives (id),
  person_id TEXT NOT NULL REFERENCES people (id),
  position INTEGER NOT NULL,
  PRIMARY KEY (dive_id, person_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE dive_professionals (
  dive_id TEXT NOT NULL REFERENCES dives (id),
  person_id TEXT NOT NULL REFERENCES people (id),
  position INTEGER NOT NULL,
  PRIMARY KEY (dive_id, person_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE dive_tags (
  dive_id TEXT NOT NULL REFERENCES dives (id),
  tag TEXT NOT NULL,
  PRIMARY KEY (dive_id, tag)
) STRICT, WITHOUT ROWID;

-- field is the core field name (startTime); computer_value holds the
-- computer's reading only where it differs from the hand value.
CREATE TABLE field_meta (
  dive_id TEXT NOT NULL REFERENCES dives (id),
  field TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('hand', 'computer')),
  computer_value ANY,
  dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1)),
  PRIMARY KEY (dive_id, field)
) STRICT, WITHOUT ROWID;

-- One per computer dive an import has seen, live, deleted or a freedive
-- left out (no dive), so a later import skips it.
CREATE TABLE fingerprints (
  fingerprint TEXT PRIMARY KEY,
  dive_id TEXT REFERENCES dives (id),
  reason TEXT NOT NULL
) STRICT;

-- Merged by time on the way in, so one sample per second at most.
CREATE TABLE samples (
  dive_id TEXT NOT NULL REFERENCES dives (id),
  time INTEGER NOT NULL CHECK (time >= 0),
  depth REAL NOT NULL,
  temperature REAL,
  pressure REAL,
  PRIMARY KEY (dive_id, time)
) STRICT, WITHOUT ROWID;

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  dive_id TEXT NOT NULL REFERENCES dives (id),
  type TEXT NOT NULL,
  start_seconds INTEGER NOT NULL CHECK (start_seconds >= 0),
  end_seconds INTEGER CHECK (end_seconds >= start_seconds)
) STRICT;
CREATE INDEX events_dive ON events (dive_id);

CREATE TABLE certifications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
) STRICT;

-- Files at cards/<card id>/<n>.
CREATE TABLE certification_images (
  card_id TEXT NOT NULL REFERENCES certifications (id),
  n INTEGER NOT NULL CHECK (n >= 0),
  content_type TEXT NOT NULL,
  PRIMARY KEY (card_id, n)
) STRICT, WITHOUT ROWID;

-- One row, the log-wide settings.
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  diver_name TEXT NOT NULL DEFAULT '',
  max_po2 REAL NOT NULL DEFAULT 1.4,
  new_dive_defaults TEXT NOT NULL DEFAULT '{"visibilityMode":"metres"}'
    CHECK (json_valid(new_dive_defaults))
) STRICT;
INSERT INTO settings (id) VALUES (1);

-- Ids left by merges. A target may itself be merged away later, so it is not
-- a foreign key and resolves transitively.
CREATE TABLE aliases (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL
) STRICT;

-- The journal. AUTOINCREMENT so a sequence number is never reused, as
-- replays count from one. op_id is the client's, for drafts only.
CREATE TABLE ops (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT UNIQUE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE import_previews (
  id TEXT PRIMARY KEY,
  data_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  preview TEXT NOT NULL CHECK (json_valid(preview))
) STRICT;

CREATE TABLE import_raw (
  dive_id TEXT PRIMARY KEY REFERENCES dives (id),
  fragment TEXT NOT NULL
) STRICT;
`

export const initial: Migration = {
  version: 1,
  name: "initial",
  up(db) {
    db.exec(schema)
    const country = db.prepare("INSERT INTO countries (code) VALUES (?)")
    for (const code of countryCodes) country.run(code)
  },
}
