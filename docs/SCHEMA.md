# Database schema

The SQLite schema as built by the migrations in `apps/server/src/db/migrations/`. Columns are in database units (see Units in [SPEC.md](SPEC.md)): metres, seconds, °C, bar, millilitres, and oxygen in tenths of a per cent. Times are local wall-clock strings with no zone.

## Logbook

Foreign keys to a dive point at `dives.id`, not its `seq` primary key.

```mermaid
erDiagram
  countries ||--o{ regions : "contains"
  countries ||--o{ sites : "contains"
  regions |o--o{ sites : "groups"
  regions |o--o{ dive_centres : "groups"
  sites ||--o{ dives : "hosts"
  trips |o--o{ dives : "groups"
  dive_centres |o--o{ dives : "runs"
  dives ||--o{ dive_buddies : "has"
  people ||--o{ dive_buddies : "buddies on"
  dives ||--o{ dive_professionals : "has"
  people ||--o{ dive_professionals : "guides on"
  dives ||--o{ dive_tags : "has"
  dives ||--o{ field_meta : "records sources in"
  dives |o--o{ fingerprints : "matched by"
  dives ||--o{ samples : "has"
  dives ||--o{ events : "has"
  dives ||--o| import_raw : "imported from"
  certifications ||--o{ certification_images : "has"

  countries {
    TEXT code PK "ISO 3166 alpha-2, seeded"
  }
  regions {
    TEXT id PK
    TEXT name
    TEXT key UK "placeKey(name, country)"
    TEXT country_code FK
  }
  sites {
    TEXT id PK
    TEXT name
    TEXT key UK "placeKey(name, country)"
    TEXT country_code FK
    TEXT region_id FK "nullable"
    TEXT body_of_water
    TEXT water_type "salt or fresh"
  }
  people {
    TEXT id PK
    TEXT name
    TEXT key UK "normaliseName(name)"
  }
  dive_centres {
    TEXT id PK
    TEXT name
    TEXT key UK "normaliseName(name)"
    TEXT region_id FK "nullable"
  }
  trips {
    TEXT id PK
    TEXT name
    TEXT key UK "normaliseName(name)"
  }
  dives {
    INTEGER seq PK "write order, breaks start time ties"
    TEXT id UK "dive-uuid"
    TEXT start_time "YYYY-MM-DDThh:mm:ss, indexed"
    TEXT site_id FK
    INTEGER duration "s"
    REAL max_depth "m"
    TEXT dive_type "default recreation"
    TEXT training_agency "training dives only"
    TEXT training_course "training dives only"
    TEXT trip_id FK "nullable"
    TEXT dive_centre_id FK "nullable"
    TEXT entry
    TEXT current
    TEXT surge
    TEXT surface
    TEXT weather
    REAL min_temperature "°C"
    REAL max_temperature "°C"
    REAL visibility "m, or a rating, not both"
    TEXT visibility_rating
    TEXT workload
    TEXT thermal_comfort
    REAL average_depth "m"
    INTEGER surface_interval "s, null for no previous dive"
    INTEGER surface_interval_override "0 or 1"
    REAL weight "kg"
    TEXT cylinder_material
    INTEGER cylinder_volume "ml"
    INTEGER nitrox "0 or 1, set iff oxygen is"
    INTEGER oxygen "211 to 1000, tenths of a per cent"
    REAL start_pressure "bar"
    REAL end_pressure "bar"
    TEXT notable_animals
    TEXT gear_details
    TEXT notes
    INTEGER ignored "0 or 1"
    TEXT computer_model
    INTEGER number "derived, null if ignored or deleted"
    INTEGER cns "derived, %"
    INTEGER otu "derived"
    TEXT sparkline "JSON array of 24 depths"
    INTEGER ascent_alarm_count
    TEXT deleted_at "soft delete"
    INTEGER sample_duration "s under water, from samples"
    REAL sample_average_depth "m, from samples"
    INTEGER safety_stop_start "s into the dive, from samples"
    INTEGER safety_stop_end "s, at least the start"
    INTEGER safety_stop_held "s in the band, at least 60"
    INTEGER safety_stop_depth "mm, mean in the band, 0 to 10000"
  }
  dive_buddies {
    TEXT dive_id PK, FK
    TEXT person_id PK, FK
    INTEGER position
  }
  dive_professionals {
    TEXT dive_id PK, FK
    TEXT person_id PK, FK
    INTEGER position
  }
  dive_tags {
    TEXT dive_id PK, FK
    TEXT tag PK
  }
  field_meta {
    TEXT dive_id PK, FK
    TEXT field PK "core field name, e.g. startTime"
    TEXT source "hand or computer"
    ANY computer_value "only where it differs from the hand value"
    INTEGER dismissed "0 or 1"
  }
  fingerprints {
    TEXT fingerprint PK
    TEXT dive_id FK "null for a dive left out"
    TEXT reason
  }
  samples {
    TEXT dive_id PK, FK
    INTEGER time PK "s, at most one per second"
    REAL depth "m"
    REAL temperature "°C"
    REAL pressure "bar"
  }
  events {
    INTEGER id PK
    TEXT dive_id FK "indexed"
    TEXT type
    INTEGER start_seconds
    INTEGER end_seconds "nullable"
  }
  import_raw {
    TEXT dive_id PK, FK
    TEXT fragment "original UDDF"
  }
  certifications {
    TEXT id PK
    TEXT name
    INTEGER position
  }
  certification_images {
    TEXT card_id PK, FK
    INTEGER n PK
    TEXT content_type
    TEXT hash "16 hex chars, file at cards/card-id/hash"
  }
```

## Bookkeeping

These tables have no foreign keys. `aliases.target_id` is deliberately not one, as a target can itself be merged away later and resolves transitively.

```mermaid
erDiagram
  meta {
    TEXT key PK "data and schema version"
    TEXT value
  }
  settings {
    INTEGER id PK "always 1"
    TEXT diver_name
    REAL max_po2 "bar, default 1.4"
    TEXT new_dive_defaults "JSON"
  }
  aliases {
    TEXT id PK "merged-away id"
    TEXT kind
    TEXT target_id
  }
  deleted_entities {
    TEXT id PK
    TEXT kind
  }
  ops {
    INTEGER seq PK "AUTOINCREMENT, never reused"
    TEXT op_id UK "client op id, drafts only"
    TEXT type
    TEXT payload "JSON"
    TEXT applied_at
  }
  import_previews {
    TEXT id PK
    TEXT data_version
    TEXT created_at
    TEXT expires_at "seven days on"
    TEXT preview "JSON"
  }
```
