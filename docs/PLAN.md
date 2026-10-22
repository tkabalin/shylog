# Shylog build plan

This plan turns `docs/SPEC.md` into milestones that each fit one working session. It follows the spec's Build order (scaffold, core, server, deploy, read-only app, editing, UDDF export, statistics, offline, import) and splits the larger steps. A milestone is done only when typecheck, lint and its tests pass and its acceptance criteria below are met, with evidence shown (test output, screenshots).

Conventions used throughout:

- **Fixture dive numbers** are Subsurface's `divenumber` in `fixtures/subsurface/d4i-2026-10-12.uddf` (1 to 72), not Shylog's. Dive 63 there is the EANx32 dive to 32.66 m on 22 July 2026. Once imported into an empty log with the 26 freedives left out, it would be Shylog dive 37, so tests must look dives up by fixture number or start time, never by Shylog number.
- **Icons** follow the hi-fi boards' *Essential* tweak, board by board: an icon is built where that board shows it with icons set to Essential (the `xi` elements not marked `xi2`), and not where the board shows it only with All. The per-screen choices were made in review (for example no country or region icons on site detail, no calendar on Recently deleted or the last-import date, no map icons in Choose site, no water-temperature or gear icons on dive detail, but icons on the Notable animals, Gear and General cards, on Settings' About and entity rows, and on entity list and detail meta lines), so `IconKeyHifi`'s Essential column is a vocabulary, not a per-screen rule. The *Off* and *All* variants are not built. The Icon key is a reference document, not a screen.
- **Separators**: where an icon follows, facts are separated by a gap, never a dot. The " · " dot is used only between plain text, as on the Log card's "Sat 10 · Simon's Town".
- **Design screens** are the boards in `docs/design/hifi/`. The spec wins for behaviour, the board for layout, and `docs/design/NOTES.md` lists the places the boards are wrong. Decisions taken for this plan are listed under Decisions and should be folded into the spec.
- **Scoped checks**: each milestone names the test files it adds. Run those files and the static checks for the milestone rather than the whole suite.
- **Performance target** (added 19 October 2026): a dive's detail and the Statistics screen should feel instant, under about 100 ms from tap to content. Compute is not the bottleneck at Shylog's scale, so the work targets network, rendering and storage. It is measured on the owner's phone and recorded in the milestone notes, not asserted in CI, where timings are too noisy to gate on.

## Decisions taken while planning

These resolve the inconsistencies found between the spec, the boards and the fixture. They were folded into `docs/SPEC.md` and `docs/design/NOTES.md` on 17 October 2026; the table stays as the record the milestones refer to.

| # | Topic | Decision |
| --- | --- | --- |
| D1 | Seed dive before Import exists | The Server milestone adds a dev-only `seed` script with a small UDDF sample reader (dives, samples, alarms, gas) used only for seeding. The Import milestone grows that reader into the full Suunto module. |
| D2 | Sparklines and alarm counts without samples | `/api/log` carries, per dive, a downsampled depth profile (24 points) and an ascent-alarm count, both stored on the dive row when samples are written. Samples themselves stay on demand. |
| D3 | Export validation | At runtime the export is re-parsed with xmldom and its dive count checked. Full XSD validation runs in CI with `xmllint` against the vendored UDDF 3.2.1 schema. |
| D4 | Export endpoints | `GET /api/export/uddf` builds, writes `export/dives.uddf` and streams it (updating the last-export time). `GET /api/export/snapshot` streams a `VACUUM INTO` copy. `POST /api/export/run` rewrites the export file without a download, for the "Export now" action on the failed-export alert. |
| D5 | Import review endpoints | `GET /api/import/pending` returns the stored preview. `PATCH /api/import/:id` stores a day's clock-offset override and returns that day's re-proposed pairs. Pairing, skip and freedive-include choices travel in `POST /api/import/:id/apply`, which re-checks against current data, returns dives changed since the preview before committing, and commits in chunks. `DELETE /api/import/:id` discards a preview. Upload shows an indeterminate "Reading your export" state. |
| D6 | Where entities are created | Only from the dive form's pickers (site picker, people and dive-centre inputs, trip picker). Settings lists, renames, merges and deletes. `PUT /api/entities/:kind/:id` still creates when given a new id. |
| D7 | Saving renames and settings | Entity detail and the Settings sections get an explicit Save action that appears when a field changes, like the Certifications edit screen. A collision shows under the field with a "Merge instead" action. |
| D8 | Chart axes beyond depth and temperature | The tank-pressure line, heart-rate and gas-partial-pressure axes are not built. `samples` keeps a nullable pressure column that the import fills if an export ever carries one. |
| D9 | Air in imports | A mix with O₂ of exactly 21.0% (210 tenths) imports as air, Nitrox no, as Subsurface treats it. Any other fraction imports as Nitrox with that percentage. |
| D10 | Computer temperatures | The computer's minimum and maximum water temperatures are the lowest and highest sample temperatures. Both fill empty fields as computer values and both are compared with hand values. `lowesttemperature` is read only if present. |
| D11 | Synthetic fixtures | Cases the real export lacks (clock offset abroad, dive crossing midnight, gauge dive, pressure samples, PO₂ over the limit) use small UDDF files generated from real fixture dives by a checked-in script under `fixtures/synthetic/`. |
| D12 | Zoop Novo | The Import milestones do not start until a Zoop Novo export is in `fixtures/subsurface/`. |
| D13 | Dexie timing | Dexie mirrors `/api/log` from the read-only app onwards. Drafts are written to the Dexie queue from the editing milestone and uploaded straight away. The Offline milestone adds the service worker, retry, sync states, storage persistence, queue export and the update flow. |
| D14 | Adopt or dismiss | A field whose hand value differs from a stored computer value shows the ✓ "Use D4i value" / ✕ "Keep mine" group, for all five compared fields. A field currently holding a computer value shows the "From the D4i" marker, which becomes "Reset to the D4i value" once edited. Computer and calculated values use the normal text colour; the accent treatment tried in the wireframe review was dropped. |
| D15 | Log header | The *Hero count* variant: "72 dives logged", a one-line "58 h underwater · deepest 32.7 m" strip, collapsing to "72 dives · 58 h" on scroll. |
| D16 | "N dives differ" after an import | The Import done screen lists the differing dives, each linking to its detail. No new Log filter. |
| D17 | Icon key | Reference only, no screen. |
| D18 | Tailscale state | A bind mount at `${SHYLOG_DATA_DIR}/tailscale`, so one folder per instance holds everything the backup covers. |
| D19 | Freedives in the summary | Counted separately: paired, added, already imported, freedives left out, freedives included (shown when non-zero). The CTA total includes included freedives. |
| D20 | Person figures | "Dives together", "As buddy" and "Buddy since" are kept, derived on the client from the link tables. |
| D21 | Long lists in the import review | "Already imported" is a plain count row that never expands. Freedives are listed as the board draws them: one row per freedive under a day heading, each with its own Include. |
| D22 | Labels fixed in review | The free-text notes field is labelled "General" (the section stays "Notes"); maximum PO₂ is a plain decimal input with no preset list. A site's region is typed with existing regions in that country offered as you type (this supersedes the review's free-text-only choice). |
| D23 | Ignored dives (added 19 October 2026) | A hand-set `ignored` flag on each dive, false by default, for pool sessions, aborted dives, chamber runs or any other reason. An ignored dive has no number and is left out of the Log's counts, Statistics and entity figures, but still counts for surface intervals, CNS carry-over, the health dive count and the export (see Ignored dives in the spec). |
| D24 | Records and milestones (added 19 October 2026) | The Records and averages card adds coldest and warmest dive (by the dive's effective minimum water temperature, since the maximum picks up near-surface readings), total depth descended against a ladder of landmarks from the Leaning Tower of Pisa to the Kármán line, longest streaks in consecutive days and weeks, and a diving anniversary that ignores the year filter (see Records and milestones in the spec). |
| D25 | Depth and duration filters (added 20 October 2026) | The Log gets Depth and Duration pills beside year, tag and region. Each opens a sheet with a two-handle range slider (0 m to "> 40 m" in 1 m steps; 0 min to "> 90 min" in 5 min steps), the bounds shown above the handles, and Reset and Apply. The top handle at its end means no upper limit, so the deepest and longest dives are never cut off by the scale (see Log in the spec). |
| D26 | Image and backup tooling (added 22 October 2026) | CI builds the Docker image on every run and, once the checks pass on `main`, publishes it to `ghcr.io/tkabalin/shylog` as `latest` and `sha-<commit>`; Compose pulls a tag rather than building. The snapshot, restore and restore-drill logic is a Node CLI in the server image (`apps/server/src/cli.ts`), which the shell scripts run through `docker compose`, so the host needs only Docker and files in the data folder are written by the container's user. `scripts/backup.sh <instance>` takes a snapshot now through the nightly job's code. The drill compares table by table in Node rather than with `sqldiff`. |

Where a board shows something the spec does not and no decision above covers it, the board's wording and layout are used (for example the Settings section order, "Last backup" as the label for the last snapshot, the "Avg depth" headline figure, the "Summary + list" conditions layout, the five-state sync card, the storage sheet copy).

## Milestones at a glance

| # | Spec step | Milestone | Depends on |
| --- | --- | --- | --- |
| 1 | 1 | Scaffold | |
| 2 | 2 | Core: schemas, normalisation, units | 1 |
| 3 | 2 | Core: calculations | 2 |
| 4 | 3 | Server: database, reads, security, seed | 3 |
| 5 | 3 | Server: draft uploads, dive edits, derived fields | 4 |
| 6 | 3 | Server: entities, settings, cards | 5 |
| 7 | 4 | Deploy | 4 (6 for the full smoke test) |
| 8 | 5 | Read-only app: Log and dive detail | 4 |
| 9 | 5 | Profile chart | 8 |
| 10 | 6 | Editing: the dive form and pickers | 6, 8 |
| 11 | 6 | Editing: delete and restore, Settings, entities | 10 |
| 12 | 6 | Certification cards | 11 |
| 13 | 7 | UDDF export | 6 |
| 14 | 8 | Statistics: figures and charts | 9 |
| 15 | 8 | Statistics: patterns | 14 |
| 16 | 9 | Offline: service worker, sync states, storage | 11 |
| 17 | 9 | Offline: update flow, queue export, end-to-end tests | 16 |
| 18 | 10 | Import: the Suunto reader | 5, Zoop Novo fixture (D12) |
| 19 | 10 | Import: preview, clock offsets, pairing | 18 |
| 20 | 10 | Import: apply, fingerprints, pass-through export | 19, 13 |
| 21 | 10 | Import: screens | 19, 20 |

---

## Milestone 1: Scaffold

**Goal**: a pnpm workspace that builds, lints, typechecks and runs an empty themed app shell with the bottom navigation, so every later milestone starts from a green check.

**Implements**: Stack and deployment (table), Build order step 1, UI and mobile design (Visual direction, Mobile rules), Testing (tooling only). Screens: the shell of `LogHifi2` (bottom navigation with Log, Stats, Import, Settings), no content.

**Touches**: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `vitest.config.ts` (workspace projects), `playwright.config.ts`, `.github/workflows/ci.yml`, `apps/web/` (Vite, React, shadcn init with preset `b1sAmWaNW`, Geist, theme layer, touch overrides, routes, bottom nav, sidebar from `md:`), `apps/server/` (Hono hello world on 127.0.0.1 with `SHYLOG_*` env parsing stub), `packages/core/` (empty package with one exported type), `.env.example`.

**Acceptance**

- `pnpm check` (typecheck, lint, unit tests) passes on an empty suite, and `pnpm build` produces `apps/web/dist` and `apps/server/dist`.
- The shell renders at 390 px with the four bottom tabs and at 1024 px with a sidebar; Playwright screenshots of both saved under `apps/web/e2e/__screenshots__/`.
- Dark mode follows `prefers-color-scheme`; a screenshot in each.
- Buttons, inputs, selects and list rows are about 44 px below `md:`; input text is 16 px (checked by `apps/web/e2e/shell.spec.ts` reading computed styles).
- Colours come from the preset's Tailwind-based variables; `grep` for hex colours in `apps/web/src` finds none outside the theme layer.
- CI runs typecheck, lint, Vitest, Playwright (Chromium and WebKit) and installs `libxml2-utils` for later XSD checks.

**Not in this milestone**: vite-plugin-pwa configuration and the service worker (milestone 16), any data, any screen content, Docker.

- [x] Workspace, base tsconfig, ESLint flat config, Prettier
- [x] `apps/web` with Vite, React, shadcn preset, Geist, theme layer, touch-size overrides
- [x] Bottom navigation and `md:` sidebar with four routes
- [x] `apps/server` Hono stub and env parsing
- [x] `packages/core` stub
- [x] Vitest workspace config, Playwright config with Chromium and WebKit
- [x] CI workflow
- [x] Screenshots at 390 px and 1024 px, light and dark

**Notes for the next session** (written 18 October 2026, branch `feat/scaffold`)

Decisions taken while building:

- Preset `b1sAmWaNW` (Geist), TanStack Router with file-based routes (`src/routeTree.gen.ts` is generated and committed), Node 24, pnpm 12.14. TypeScript stays on 6.0 because typescript-eslint supports only up to 6.0.
- The theme layer adds Geist Mono and lifts the dark `--primary` to cyan-400 with cyan-950 text, as the boards do.
- Touch sizes are edited into the shadcn components' variants (`h-11 md:h-8` and so on), and `sidebar.tsx` has its Ctrl/Cmd+B toggle removed (the sidebar never collapses). Re-adding a component with `shadcn add --overwrite` drops these edits.
- `react-refresh/only-export-components` is off, as in shadcn's Vite template. Prettier ignores `docs/` (it would reflow the plan and spec) and the vendored `.claude/skills/`.
- An unset `NODE_ENV` counts as production, so `SHYLOG_DEV_LOGIN` is refused unless `NODE_ENV` is `development` or `test`. The server's `dev` script sets it and loads the root `.env`. `SHYLOG_ORIGIN` must be http(s) and is reduced to scheme and host. Empty env values count as unset, so a Compose `${VAR:-}` falls back to the default.
- Package `test` scripts pass `--root ../..`, and the web `test:e2e` passes `-c ../../playwright.config.ts`, because neither tool finds the root config from a package folder.
- Screenshots in `apps/web/e2e/__screenshots__/` are gitignored evidence, uploaded as a CI artifact.
- `viewport-fit=cover` is set, so the main area and bottom nav pad for the safe-area insets on all sides.
- The root `tsconfig.json` typechecks the root `*.config.ts` files, and ESLint gives Node globals to everything except `apps/web/src`.
- `.claude/skills/implement-milestone` records this workflow; run `/implement-milestone <n>` for the next step.
- The shadcn agent skill is installed in `.claude/skills/shadcn` (`skills-lock.json`). Its context step runs `shadcn info` in the working directory, so run shadcn commands from `apps/web`.

Deferred, or to watch:

- Playwright's webServer is Vite's dev server. The touch-size check uses the development-only `/dev/ui` route, so it has to move when the webServer switches to the seeded Node server (milestone 4 or 8).
- After adding a route file, run `vite` (dev or build) once before `tsc -b`, since the router plugin regenerates the route tree.
- On `/mnt/c`, a cold Vite dependency optimisation takes more than 30 s and the first e2e run times out. Run it again once `node_modules/.vite` is warm. CI on Linux is not affected.
- `test:xsd`, `seed` and `restore-drill` point at scripts that later milestones write.
- `index.html` has an inline script that applies the theme before first paint, using `ThemeProvider`'s `theme` storage key. Keep the two in step when Settings gets the appearance override (milestone 11). The page title is still a fixed "Shylog" until the server serves it from `SHYLOG_APP_NAME`.
- Supply chain: `pnpm-workspace.yaml` refuses releases under three days old and trust downgrades (`semver@6.3.1` excluded, with the reason beside it), `packageManager` pins pnpm by hash, and every GitHub Action is pinned to a commit SHA. A brand-new release fails the install, so lower the range rather than excluding it. Raise `minimumReleaseAge` to seven days once that costs no downgrades.
- CI runs as two jobs, `check` and `e2e`; shard Playwright only once the browser tests take minutes.
- CI reports Vitest coverage for `packages/core` and `apps/server` on the run's summary page (`vitest.config.ts`). Add a threshold for `core` once its calculation tests land (milestones 2 and 3), and add `apps/web` to the coverage `include` when it gets unit-tested code such as the Dexie mirror (milestone 8). Coverage runs only in CI; locally, pass `--coverage` to a scoped run.
- The main JS chunk is about 450 kB (150 kB gzipped) with React, TanStack Router and Base UI. Revisit with the PWA work.

## Milestone 2: Core, schemas and normalisation

**Goal**: the shared package holds every Zod schema, name-normalisation rule and unit conversion the client and server will use, with tests.

**Implements**: Data model (v1 fields, Units, Rules for edits), Operations and offline sync (the `Op` types), Edits to synced data (request schemas), the site and person deduplication rules, tag list, decision D23 (the `ignored` field).

**Touches**: `packages/core/src/schemas/` (dive fields, entity fields per kind, ops, edit requests per endpoint, settings, cards, import preview and apply payloads), `packages/core/src/normalise.ts`, `packages/core/src/units.ts`, `packages/core/src/tags.ts`, `packages/core/src/ids.ts`, `packages/core/src/enums.ts` (dive type, entry, current, surge, surface, weather, workload, thermal comfort, body of water, water type, with their UDDF values), tests beside each.

**Acceptance**

- `packages/core/src/normalise.test.ts`: "Long Beach", "long beach ", "Lông Beách" and "Long  Beach" normalise to one key; "Hòn Dài" and "Hon Dai" match; "đ" folds to "d"; a key within country ZA differs from the same key within VN.
- `packages/core/src/units.test.ts`: 32.4% ↔ 324; 11.1 L ↔ 11100 ml; 22.3 °C ↔ 295.45 K; 1 bar ↔ 100000 Pa; "32,4" parses as 32.4 and "32.4" too; 45 min ↔ 2700 s; a comma in a whole-number field is rejected.
- `packages/core/src/schemas/*.test.ts`: an `upsertDive` op with a missing required field (date, time, site, duration, max depth) is rejected; oxygen as a float is rejected and as 324 accepted; a training agency is accepted on a Training dive and stripped otherwise; visibility accepts metres or a rating but not both; ids must start with a letter and be valid UDDF ids; `opVersion` is a positive integer.
- Enum values map one to one to the UDDF strings in the spec's tables (`informationafterdive/program`, `platform`, `current`, `workload`, `thermalcomfort`).

**Not in this milestone**: calculations (milestone 3), any server or client code.

- [x] Enums with UDDF values
- [x] Normalisation
- [x] Units and decimal-comma parsing
- [x] Dive, entity, settings and card schemas
- [x] Op schemas and edit-request schemas
- [x] Import preview and apply schemas (types only; validated later)
- [x] Tests listed above

**Notes for the next session** (written 19 October 2026, branch `feat/core-schemas`)

Decisions taken while building:

- A dive's date and time is one `startTime` field, `YYYY-MM-DDTHH:mm:ss` with no zone; the form joins its two native inputs and hand dives get `:00` seconds. It is one `field_meta` entry.
- Choice fields store camelCase app keys (`veryMild`, `charterBoat`); each enum in `enums.ts` carries its label and, where UDDF has the field, its UDDF string, pinned by `enums.test.ts` to the UDDF 3.2.1 lists. Body of water (`environment`) and cylinder material (`tankmaterial`) are mapped now; where the site elements sit in the export is still open for milestone 13.
- Name keys ignore case, spacing and the combining accents (U+0300 to U+036F) on Latin letters only, fold đ, ł, ø, ı and ß, and treat curly quotes as straight ones. Marks in other scripts are kept, since they change the word. Sites and regions use `placeKey(name, country)`; people, dive centres and trips use `normaliseName`. Country codes are checked against the 249 ISO 3166-1 alpha-2 codes in `countries.ts`, which also seed `countries`; names come from `Intl.DisplayNames`.
- Ids carry a kind prefix (`dive-`, `site-`, `region-`, `person-`, `centre-`, `trip-`, `card-`, `op-`, `device-`) checked by `idSchema(kind)`. `newId` builds the UUID from `getRandomValues`, which works on plain-HTTP dev pages where `randomUUID` doesn't.
- Schemas are strict: unknown or calculated fields are rejected. Each field set is split into required, defaulted (always set, so an edit can change but not clear it: dive type, nitrox, a site's water type) and optional (cleared with null in an edit). Create schemas delete stripped keys rather than setting them to undefined, so a present key is a value that was sent.
- Training details are saved only on a Training dive and oxygen only with nitrox; a patch that changes the type or turns nitrox off drops any it carries, and the server clears the stored ones. Oxygen is 211 to 1000 tenths (21% or less is air, entered as Nitrox no, as an import reads 0.21) and is required with nitrox (owner's decision, now in the spec), so every nitrox dive has a known gas mix; the same applies to the new-dive defaults.
- A site patch that sets a new body of water re-derives the water type unless it sends one; clearing the body of water leaves it.
- `putEntityRequests[kind]` validates a rename; when the id is new the server must validate with `entityFields[kind]` instead. `mergeEntityRequests[kind]` merges the path id into `into`. Settings PUT replaces `newDiveDefaults` as a whole.
- `uploadDraftRequest` needs exactly one `upsertDive` and unique op ids. `opVersion` is 1.
- A surface interval override is seconds or `"none"` for no previous dive (UDDF `<infinity/>`); null clears it back to the calculated value.
- Free text (notes, animals, gear, training details) that is empty after trimming parses as null, so a form can send the box as it is and an edit clears the field.
- `maxPo2` is limited to 1 to 2 bar in 0.1 bar steps, as dive computers offer it, names to 120 characters, and average depth to no deeper than max depth (limits the spec doesn't give, agreed in review).
- The `ignored` flag (D23) is a defaulted dive field, false unless set by hand.

Deferred, or to watch:

- The server (milestones 5 and 6) must check the rules that depend on stored values: a training field or oxygen sent without the type or nitrox, clearing stored training details or oxygen when a patch changes the type from Training or turns nitrox off, nitrox turned on with no stored oxygen or oxygen cleared on a nitrox dive, temperature order and average against max depth against the stored partner, visibility against a stored rating, a buddy who is a stored professional, a region in the site's country, the op version and the two-year age rule.
- The spec's Units table lists latitude and longitude, but no v1 field, board or schema has site coordinates. Left out by agreement; add them if a later screen needs them.
- The ISO 3166 country list is not in core yet: `countryCode` only checks two capital letters. Milestone 4 seeds the list and milestone 10 needs it on the client, so it probably belongs in core then.
- The import types in `schemas/import.ts` are placeholders until milestone 19 builds previews.
- Free-text fields reject an empty string; the form sends null (or omits the field) for an empty input.
- Add the core coverage threshold once the calculation tests land in milestone 3.
- Carried over from the scaffold: the touch-size check's `/dev/ui` route moves when the Playwright webServer switches to the seeded server (milestone 4 or 8); run Vite once after adding a route before `tsc -b`; `test:xsd`, `seed` and `restore-drill` still point at scripts later milestones write; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes; add `apps/web` to coverage once it has unit-tested code (milestone 8); the main chunk is about 450 kB.

## Milestone 3: Core, calculations

**Goal**: every figure the app shows is computed in `packages/core` exactly as the spec's Subsurface references describe, verified against hand-worked values and the real fixture.

**Implements**: Calculations (Depth and pressure, SAC rate, MOD and max PO₂, CNS and OTU), the surface-interval rule, the time-weighted average depth, the `likely_same` test, the vertical-rate and speed-band rules, duplicate-sample merging.

**Touches**: `packages/core/src/calc/pressure.ts`, `sac.ts`, `gas.ts` (Z factor), `mod.ts`, `cns-otu.ts`, `surface-interval.ts`, `average-depth.ts`, `samples.ts` (merge duplicates, dive end, last underwater sample), `likely-same.ts`, `velocity.ts`; `packages/core/test/fixture.ts` (test-only loader that reads samples from the real UDDF with xmldom as a dev dependency); tests beside each.

**Acceptance**

- `pressure.test.ts`: 32.66 m in salt water at 1013 mbar gives 4313 mbar; 10 m fresh gives 1994 mbar; 0.74 m counts as surface and 0.75 m does not.
- `mod.test.ts`: fixture dive 63 (EANx32) gives max PO₂ 1.38 bar and MOD 33.2 m at 1.4 bar; dive 61 (EANx33, 31.47 m) gives 1.38 bar and MOD 31.9 m; dive 54 (air, 42.28 m) gives 1.10 bar and MOD 56.2 m; a value within 0.01 m of the next 0.1 m step rounds up; the limit is read from settings, 1.4 by default.
- `sac.test.ts`: a hand-worked case (12 L steel, 200 → 60 bar, 45 min, average 19.8 m, salt) agrees with Subsurface's `calculate_sac` to the millilitre; ideal-gas and real-gas results differ by a few per cent; no SAC when start ≤ end, when any input is missing, or for a dive with no average depth; a hand duration beats the sample duration.
- `cns-otu.test.ts`: segment maths against three hand-worked segments (both ends above 500 mbar, one end below, both below); whole-dive values for fixture dives 63, 54, 61 and 36 against Subsurface's displayed figures, which the owner records in the test file from Subsurface with salt water and 1013 mbar (the test is `todo` until those four values are entered); carry-over across the three dives of 20 July 2026 (58, 59, 60) halves every 90 minutes and resets after 12 hours; a dive in a trip skips dives in other trips.
- `surface-interval.test.ts`: fixture dive 2 after dive 1 (same morning), dive 8 after dive 7 (47 days apart, so none), two overlapping dives give 0, and the end of a dive is its start plus the later of duration and its last underwater sample.
- `average-depth.test.ts`: fixture dive 36 computed from samples is within 0.05 m of its exported `averagedepth` (10.396 m), surface segments excluded, result in whole mm.
- `samples.test.ts`: fixture dive 3 (five repeated times) merges to one sample per time; dive 6's end is 440 s (its last sample below 0.75 m) although `diveduration` is 180 s and its samples run to 502 s.
- `velocity.test.ts`: speeds in mm/s truncate, an ascent of exactly 25 mm/s is Stable and a descent of exactly 25 mm/s is Slow; the lookback picks the nearest point at least 15 s and two points earlier; interpolation inserts points every 10 s so a 20 s gap gets one and a 60 s gap five.
- `likely-same.test.ts`: the four conditions, each with a passing and a failing pair, using fixture dive 63 against hand-logged variants.
- `fast-check` is optional; use it only where it shortens a test.

**Not in this milestone**: statistics (milestones 14 and 15), pattern rules, anything touching XML in production code.

- [x] Depth to pressure, surface threshold, water density
- [x] Z factor and SAC
- [x] MOD and max PO₂ with the 0.1 m step rule
- [x] CNS and OTU per dive, carry-over chain
- [x] Surface interval with the 48-hour cap and override
- [x] Average depth from samples
- [x] Sample merging, dive end, interpolation, velocity bands
- [x] `likely_same`
- [x] Subsurface comparison values recorded for four dives

**Notes for the next session** (written 19 October 2026, branch `feat/core-calculations`)

Decisions taken while building:

- Every calculation was checked against Subsurface's own arithmetic: its functions were copied line for line into a small C program and run on the fixture's samples. `packages/core/test/subsurface.ts` holds the results for all 46 scuba dives (own CNS, OTU, carried CNS, time under water, average depth, last sample below 0.75 m), and the tests compare every dive with them. The owner's figures from Subsurface for dives 63, 54, 61 and 36 (CNS 15, 4, 18 and 1 %; OTU 41, 12, 48 and 0) match.
- Fixture dive 6 ends at 440 s, its last sample below 0.75 m, not 502 s; the plan was corrected. Subsurface counts a sample of exactly 0.75 m as underwater for the dive's end but as surface for time under water and average depth, and Shylog mirrors each function (now in the spec).
- Public functions take database units (metres, seconds, bar, ml, tenths of a per cent) and work internally in whole mm and mbar with C's rounding (`lrint`, halves to even) and integer truncation (`intDiv`). Air is 209 tenths in every calculation (`diveOxygen`).
- `maxPo2` returns bar to the mbar, so dive 54 gives 1.105 bar. Subsurface shows its unrounded 1.1046 as 1.10. `toFixed(2)` also gives "1.10", but a half-up rounding would give 1.11, so the display (milestone 8) must format with `toFixed(2)` or from the unrounded value.
- SAC uses the hand duration and average depth when typed, otherwise the samples' figures (Subsurface's `fixup_dc_duration`), and only then the stored values (`sacDurationAndDepth`). An imported dive's SAC therefore uses the samples' average depth, not the computer's `averagedepth`.
- Carry-over and surface interval take every dive that isn't deleted, ignored ones included, in the order written. Of two dives with the same start, the later-written one is the previous dive.
- Chart points follow `populate_plot_entries` in full: the line starts at the surface at 0 s and ends with Subsurface's two closing surface points at 1 and 2 s after the last entry, which carry no temperature. Events after the last sample sit at the surface. The line stops one sample past `chartEnd`, Subsurface's `maxtime`, which the time axis also uses before its 30 min minimum (milestone 9).
- Core has a 100 % coverage threshold on every metric in `vitest.config.ts`. Core's `test` script is now `cd ../.. && vitest run packages/core`, since a `--project` run checks the threshold against no files and Vitest reads a path filter from the working directory. Coverage on a single test file always fails the threshold; run it over `packages/core`.
- Tests read the fixture with `@xmldom/xmldom` (dev dependency) through Vite's `?raw`, declared in `packages/core/test/raw.d.ts`. A lint rule keeps `?raw` and imports from `test/` out of core's own code.

Deferred, or to watch:

- `cnsWithCarryOver` and `surfaceInterval` parse and sort the dives on each call. When the server recalculates every later dive after an edit (milestone 5), one sorted, pre-parsed pass may be worth it; review found it harmless at hundreds of dives.
- `mod` gives a negative depth when the limit is below the gas's PO₂ at the surface (100 % oxygen at a 1.0 bar limit), as Subsurface does. The display should show no MOD in that case.
- iOS haptics: shadcn's Switch here is Base UI's `role="switch"` element, which plays no haptic. For the dive form's switches (milestone 10), editing `components/ui/switch.tsx` to render a native `<input type="checkbox" switch>` would get Safari's system haptic; check on a phone that it survives the restyle.
- The server's and web's `test` scripts still use `--project`; that is fine while neither has a coverage threshold.
- Carried over from milestone 2: the server must check the rules that depend on stored values (see its notes); site coordinates are left out; the ISO 3166 list should move into core when milestones 4 and 10 need it; the import types are placeholders until milestone 19; free-text fields reject an empty string.
- Carried over from the scaffold: the touch-size check's `/dev/ui` route moves when the Playwright webServer switches to the seeded server (milestone 4 or 8); run Vite once after adding a route before `tsc -b`; `test:xsd`, `seed` and `restore-drill` still point at scripts later milestones write; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes; add `apps/web` to coverage once it has unit-tested code (milestone 8); the main chunk is about 450 kB.

## Milestone 4: Server, database and reads

**Goal**: the server opens the SQLite database with the spec's pragmas, migrates it, journals, checks integrity, enforces the security checks, serves the log and samples, and can be seeded from the fixture.

**Implements**: Data model (Database, Rules for edits as schema constraints), Server (Runtime, Database, Journal, Integrity, Version, Health, Security, Serving), Instance configuration (env), Endpoints `GET /api/version`, `GET /api/log`, `GET /api/dives/:id/samples`, `GET /api/health`, decision D1 (seed), D2 (sparkline and alarm count columns).

**Touches**: `apps/server/src/db/` (open, pragmas, migration runner with pre-migration snapshot, `001-initial.sql`, ISO 3166 seed), `apps/server/src/journal.ts`, `apps/server/src/integrity.ts`, `apps/server/src/config.ts` (`SHYLOG_ALLOWED_LOGINS`, `TS_HOSTNAME`, `SHYLOG_ORIGIN`, `SHYLOG_DATA_DIR`, `SHYLOG_APP_NAME`, `SHYLOG_DEV_LOGIN`), `apps/server/src/security.ts`, `apps/server/src/routes/version.ts`, `log.ts`, `samples.ts`, `health.ts`, `apps/server/src/static.ts` (PWA files, manifest from `SHYLOG_APP_NAME`), `apps/server/src/uddf/sample-reader.ts` (D1), `apps/server/src/derived.ts` (one pass that recalculates every dive's derived fields, run by the seed now and after every write from milestone 5), `apps/server/scripts/seed.ts`, `apps/server/test/` with an in-memory database helper and Hono's test client.

**Acceptance**

- `db.test.ts`: a fresh database has every table in the spec's Database list, `journal_mode` is `wal`, `foreign_keys` is on, `synchronous` is `FULL`; a migration run writes a snapshot first and a journal entry after, then `foreign_key_check` is clean; running migrations twice is a no-op.
- `constraints.test.ts`: two sites with keys that normalise alike in one country are rejected, the same key in two countries is allowed; the same for regions; two people with alike names are rejected; a duplicate fingerprint is rejected.
- `security.test.ts`: `/api/*` without `X-Shylog` is 403; a mutating request without a matching `Origin` or with the wrong content type is 403; a `Tailscale-User-Login` not in `SHYLOG_ALLOWED_LOGINS` is 403, a Q-encoded login decodes and matches; a request with no identity header (tagged device) is 403; static files, the manifest and the service worker need none of this; with `NODE_ENV=production` and `SHYLOG_DEV_LOGIN` set the process exits at startup.
- `log.test.ts`: `/api/log` returns the shape `{ schemaVersion, version, serverTime, dives, sites, countries, regions, people, diveCentres, trips, links, fieldMeta, settings, cards }` with an ETag, a matching `If-None-Match` gives 304, deleted dives are included with `deletedAt`, and each dive with samples carries a 24-point `sparkline` and `ascentAlarmCount` (fixture dive 54 has 5).
- `samples.test.ts`: `/api/dives/:id/samples` for a seeded dive returns merged samples (time, depth, temperature carried forward, pressure null) and events (59 ascent events across the seeded scuba dives when all are seeded, each with start and end; surface events present with type `surface`).
- `seed.test.ts`: seeding the fixture writes 46 scuba dives (freedives skipped by the reader's simple rule: no tankdata) with gas air for `o2 = 0.21` (D9), EANx32 for dives 52, 58 and 63, max depth from `greatestdepth`, average depth from `averagedepth`, min and max temperature from samples (D10), dives from 17 to 22 July 2026 on a Sodwana site and the rest on one Unnamed site (both South Africa, since the fixture has no sites), dive numbers, surface intervals, CNS and OTU filled by the derived-field pass, and journals one entry.
- `health.test.ts`: reports WAL size, integrity status, dive count and null last-snapshot and last-export times.
- `integrity_check` runs at startup; a seeded corrupt copy flips writes to paused and `/api/health` reports it.

**Not in this milestone**: any write endpoint (milestone 5), export and snapshot jobs (milestones 7 and 13), Docker.

- [x] Config from env, dev bypass refused in production
- [x] Database open, pragmas, migrations with snapshot, ISO 3166 seed
- [x] Schema with constraints, `field_meta`, `fingerprints`, `samples`, `events`, `ops`, `aliases`, `import_previews`, `import_raw`, `meta`, and the dives' `ignored` column defaulting to false (D23)
- [x] Journal helper and version id per commit
- [x] Security middleware
- [x] `/api/version`, `/api/log` with ETag, `/api/dives/:id/samples`, `/api/health`
- [x] Static serving and manifest from `SHYLOG_APP_NAME`
- [x] Sample reader, derived-field pass and `seed` script
- [x] Tests listed above

**Notes for the next session** (written 19 October 2026, branch `feat/server-reads`, stacked on `feat/core-calculations`)

Decisions taken while building:

- The fixture has no sites, so the seed puts the dives of 17 to 22 July 2026 on a Sodwana site and the rest on one Unnamed site, both South Africa. `derived.ts` holds one whole-log pass (numbers, surface intervals, average depth and temperatures from samples where no `field_meta` row exists, CNS with carry-over, OTU), run by the seed; milestone 5 runs it after every write. Its CNS and OTU match Subsurface's figures for the fixture.
- The sparkline is the deepest sample in each of 24 equal slices of the dive (0 to its end), the depth at a slice's middle where none falls in it, to the centimetre, stored as JSON on the dive with the ascent-alarm count when samples are written.
- Migrations are TypeScript modules (`db/migrations/001-initial.ts`), not `.sql` files, since neither tsx nor tsup imports `.sql`. Each is preceded by a `VACUUM INTO` snapshot at `snapshots/pre-migration-<n>-<time>.db` (skipped for an empty database), runs with foreign keys off as SQLite's rebuilds need, and is rolled back by a failing `foreign_key_check`. A schema newer than the code refuses to start. The milestone 7 retention pruning must leave `pre-migration-*` files alone.
- The schema is `STRICT`, snake_case, with the cross-field rules as checks; dives have an integer `seq` for write order (VACUUM may renumber a rowid). Name keys (`placeKey` or `normaliseName`) are written by the server into a unique `key` column. `field_meta.field` holds core's camelCase field name. Settings are one row; `meta` holds `version`, `schema_version` and later `last_snapshot_at` and `last_export_at`.
- Every write goes through `write(db, change)` in `journal.ts`, which journals in `ops` and stores a new random version in the same transaction.
- `/api/log` uses core's field names; `surfaceInterval` is seconds or `"none"`, `links` is one row per link (`{ diveId, type: buddy | professional | tag, target, position }`), `countries` is the list of codes, `cards` is `{ id, name, images }`. Its ETag is the version read with the data; weak and listed `If-None-Match` values match. `schemaVersion` is the database's own.
- Security: `X-Shylog` (any value) and an allowed login on every `/api` request; for writes, the exact `SHYLOG_ORIGIN`, and when the request has a body, its route's content type: JSON, except `multipart/form-data` for `PUT /api/cards/:id` and the three XML types for `POST /api/import`. A bodiless delete or restore needs only the Origin. The dev login stands in only when the Tailscale header is absent, and must also be in `SHYLOG_ALLOWED_LOGINS`. `/api/health` is no exception (owner's call), so milestone 7's phone smoke test sends the header.
- Integrity runs at startup and daily. A failure skips migration and pauses every write with a 503 until a restart after restore. A file too damaged to open (bad header) stops startup with an error instead, the spec's "Database unreadable" restore case (owner's call). `/api/health`'s dive count is live dives, ignored ones included, deleted ones not.
- The server serves `apps/web/dist`, found two folders up from both `src/` and `dist/`, so the Docker image must keep that layout. The page title and `/manifest.webmanifest` come from `SHYLOG_APP_NAME`; the manifest link is in `apps/web/index.html`, and `apps/web/public/icon.svg` is the full-bleed icon from `docs/design/`. Hashed assets are cached for a year, everything else `no-cache`.
- better-sqlite3 13 ships prebuilt binaries (glibc and musl), so it needs no `allowBuilds` entry. It stays external to the tsup bundle, so the runtime image needs its `node_modules`; `@shylog/core` is bundled in.
- Server tests sit beside the code; helpers and a checked-in web stand-in are in `apps/server/test/`. `pnpm seed [file]` loads the root `.env`, resolves the file from where it was typed, and refuses a log that has dives.

Deferred, or to watch:

- The derived pass reparses and re-sorts every dive per call to `cnsWithCarryOver` and `surfaceInterval` (O(n² log n)). Fine at hundreds of dives; milestone 5 runs it after every write, so pass a pre-sorted list if edits ever feel slow.
- Statements in the routes, `storeProfile` and the derived pass are prepared per call; negligible today.
- Vite's dev server has no proxy, so `/manifest.webmanifest` (and `/api`) 404 under `pnpm dev`. Milestone 8 adds the proxy.
- iOS ignores SVG manifest icons; the apple-touch PNGs are in milestone 16.
- UDDF `surfacepressure` is not read or stored; the import (milestone 18) adds a column if an export carries it.
- The seed's journal entry is `{ source, dives }`, so a replay can't rebuild seeded data. Dev only.
- Coverage over the server alone fails core's 100 % threshold, since server tests import core; CI's whole-repo run is fine.
- Playwright's webServer is still Vite's dev server; switch it to the seeded Node server in milestone 8 (the `/dev/ui` touch-size route moves then).
- Carried over from milestone 3: one sorted pass for carry-over (above); `mod` can go negative for a limit below the surface PO₂, so show no MOD then; check the native switch haptic on a phone (milestone 10); the server's and web's `test` scripts still use `--project`.
- Carried over from milestone 2: the server must check the rules that depend on stored values (see its notes, milestone 5 and 6); site coordinates are left out; the import types are placeholders until milestone 19; free-text fields reject an empty string. The ISO 3166 list is now seeded from core's `countryCodes`.
- Carried over from the scaffold: run Vite once after adding a route before `tsc -b`; `test:xsd` and `restore-drill` still point at scripts later milestones write; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes; add `apps/web` to coverage once it has unit-tested code (milestone 8); the main chunk is about 450 kB.

## Milestone 5: Server, draft uploads, dive edits and derived fields

**Goal**: dives can be created by draft upload and changed, deleted and restored by plain requests, each in one journalled transaction followed by the derived-field recalculation.

**Implements**: Operations and offline sync (Flow steps 3 to 7, Conflict rules), Edits to synced data, Server (Applying writes, Derived fields), Endpoints `POST /api/ops`, `PATCH /api/dives/:id`, `DELETE /api/dives/:id`, `POST /api/dives/:id/restore`.

**Touches**: `apps/server/src/routes/ops.ts`, `dives.ts`, `apps/server/src/apply/` (upsert dive, upsert entity with alias matching, field_meta writes), `apps/server/src/derived.ts` (milestone 4's whole-log pass, run after every write: dive numbers, surface intervals, average depth from samples, max and min temperatures, CNS and OTU chain), `apps/server/test/`.

**Acceptance**

- `ops.test.ts`: a draft with one `upsertDive` and two `upsertEntity` ops creates the dive and entities and journals three entries; re-sending the same draft changes nothing and replies "already applied"; a draft whose site matches an existing site by key records an alias and uses the survivor; a draft pointing at a merged-away id resolves through the alias chain; a draft pointing at a deleted entity is rejected whole; an unsupported `opVersion` is rejected, the previous version accepted; an op older than two years is rejected; a failing op rolls back the whole draft and records no op ids; every filled-in field gets `field_meta` source `hand`.
- `dives.test.ts`: `PATCH` with only changed fields updates them, replies with the new version, journals; a hand edit of a computer-filled field sets its source to `hand` and keeps `computer_value`; dismissing sets `dismissed`; adopting copies the computer value and clears the flag; delete sets `deleted_at` and the dive leaves `/api/log`'s live set; restore clears it; both are safe to repeat.
- `derived.test.ts`: dive numbers follow local start time across all live dives and renumber after an insert in the middle, a delete and a restore; an ignored dive gets no number and the dives after it close up, and un-ignoring it renumbers them (D23); an ignored dive still counts for the next dive's surface interval and CNS carry-over; surface intervals recompute for the next dive, except where overridden; average depth is computed only for dives with samples and no imported or hand value; CNS carry-over recalculates later dives in the 12-hour chain; moving a dive into a trip recalculates its chain.
- The version id changes on every commit and `GET /api/version` reflects it.

**Not in this milestone**: entity, settings and card endpoints (milestone 6), import, export.

- [x] `POST /api/ops` with idempotency, versions, age rule, alias matching
- [x] `PATCH /api/dives/:id` with `field_meta` rules
- [x] Delete and restore
- [x] Derived-field recalculation after every write
- [x] Statements in the routes, `storeProfile` and the derived pass prepared once per connection and reused, since the derived pass now runs after every write (better-sqlite3 re-parses the SQL on every `prepare`)
- [x] Tests listed above

**Notes for the next session** (written 20 October 2026, branch `feat/draft-uploads-dive-edits`, stacked on `test/subsurface-differential`)

Decisions taken while building:

- A draft with new op ids for a dive the server already has (first reply lost, then edited offline) is applied as an edit of the fields it carries; fields it leaves out are kept. For a dive in Recently deleted it is rejected. An `upsertEntity` for an id the server has, or an alias, uses that entity as it is (now in the spec's Conflict rules).
- `field_meta`: `computer_value` and `dismissed` survive later hand edits until adopted, even when the hand value comes to match. Clearing a computer-filled field keeps an empty hand value; clearing one with nothing from the computer deletes its row, so the samples fill average depth and temperatures again (now in the spec's Database list). A retried adoption, a repeated dismissal, and deleting or restoring twice are no-ops.
- `PATCH` merges the request into the stored dive and checks the whole dive with core's `diveFieldsSchema`, which covers every stored-value rule from milestone 2's notes apart from a region in the site's country (the draft's site insert checks that; milestone 6's `PUT` must too). An average depth with no `field_meta` row counts as calculated and is left out, as a calculated surface interval is. The derived pass stores no calculated average deeper than the max depth.
- `write()` only stores a new version when the change journals something, so a write that changes nothing keeps the version clients hold. Journal types: `upsertEntity`, `upsertDive` (the op, with its op id), `alias`, `editDive` (`{ diveId, ...request }`), `deleteDive`, `restoreDive`.
- Rejections are `{ error, path }`: 422 for a rule, 404 for an unknown dive, 409 for a `PATCH` to a dive in Recently deleted, 400 for a schema failure or malformed JSON. Every draft rejection is 422. `POST /api/ops` replies `{ result: "applied" | "alreadyApplied", version, serverTime }`; dive edits reply `{ version }`. Validation uses Hono's built-in `validator` (`apps/server/src/validate.ts`), with no new dependency.
- Every field a draft fills in gets a `hand` row, including the defaulted dive type, nitrox and ignored flag, as the form always sends them.
- `db/prepared.ts` caches statements per connection and resets `pluck()` on each use.

Deferred, or to watch:

- Milestone 6: entity deletes leave no row, so a re-sent draft is told an id was deleted only when the server has seen it before, as an alias or in a journalled `upsertEntity` op (`seenBefore` in `apply/entity.ts`, a scan of `ops` filtered by type). Entities created online with `PUT` aren't in that journal type, so the delete should leave a tombstone (or `PUT` journal the same `{ kind, id }` shape), and the scan can then go.
- Milestone 10 or 16: a re-uploaded draft is applied as a patch, so a field the diver cleared offline is cleared only if it is text (which arrives as null); a removed trip, weight or override stays. Rare (needs a lost reply and an offline edit); the client could send explicit nulls for cleared fields if it matters.
- Milestone 20: a hand dive left at Nitrox no has a `hand` nitrox row, so an import pairing it with an EANx32 computer dive keeps air. Decide then whether gas is compared like the five fields.
- The derived pass reads every dive's samples on every write: about 10 ms per write on the fixture's 46 dives (9,340 samples), linear, so roughly 100 ms at 500 dives. Cache each dive's own CNS, OTU and sample figures if edits ever feel slow.
- Carried over from milestone 4: `cnsWithCarryOver` and `surfaceInterval` still parse and sort per call; Vite's dev server has no proxy until milestone 8; iOS apple-touch PNGs in milestone 16; UDDF `surfacepressure` is not stored; the seed's journal entry can't be replayed; coverage over the server alone fails core's threshold; Playwright's webServer moves to the seeded server in milestone 8.
- Carried over from milestones 2 and 3: `mod` can go negative for a limit below the surface PO₂ (show no MOD); check the native switch haptic on a phone (milestone 10); the server's and web's `test` scripts still use `--project`; site coordinates are left out; the import types are placeholders until milestone 19.
- Carried over from the scaffold: run Vite once after adding a route before `tsc -b`; `test:xsd` and `restore-drill` still point at scripts later milestones write; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes; add `apps/web` to coverage once it has unit-tested code (milestone 8); the main chunk is about 450 kB.

## Milestone 6: Server, entities, settings and cards

**Goal**: sites, regions, people, dive centres and trips can be renamed, merged and deleted, settings read and changed, and certification cards stored with their images.

**Implements**: Rules for edits (merges, deletes, aliases), Conflict rules (Merges, Renames), Endpoints `PUT /api/entities/:kind/:id`, `POST /api/entities/:kind/:id/merge`, `DELETE /api/entities/:kind/:id`, `GET`/`PUT /api/settings`, `GET /api/cards`, `PUT`/`DELETE /api/cards/:id`, `GET /api/cards/:id/images/:n`, decision D6.

**Touches**: `apps/server/src/routes/entities.ts`, `settings.ts`, `cards.ts`, `apps/server/src/apply/merge.ts`, `apps/server/src/cards/` (files under `${SHYLOG_DATA_DIR}/cards/`), `apps/server/src/db/migrations/002-*.ts` (the `deleted_entities` tombstones and each card image's hash), tests.

**Acceptance**

- `entities.test.ts`: `PUT` with a new id creates; a rename that collides with another key is refused with a structured error naming the survivor; merge moves every dive link, rewrites site and dive-centre regions for a region merge, records an alias, deletes the merged-away row, journals, and recalculates CNS for trip merges; deleting a site used by a dive in Recently deleted is refused; deleting a trip unlinks its dives and is allowed; deleting a region with sites is refused; every entity kind is covered.
- `settings.test.ts`: defaults are the diver name empty, max PO₂ 1.4, new-dive defaults empty, visibility mode metres; `PUT` validates with the core schema; a new-dive default uses the same shapes as dive fields (material, volume in ml, oxygen in tenths).
- `cards.test.ts`: `PUT /api/cards/:id` with multipart images stores files under `cards/<id>/<hash>` and a row; re-`PUT` reorders or replaces images; `DELETE` removes row and files; images stream with a long cache header; a non-image upload is rejected.

**Not in this milestone**: the UI for any of this (milestones 11 and 12).

- [x] Entity create, rename, merge, delete per kind with alias records
- [x] Settings read and write
- [x] Cards with image files
- [x] Tests listed above

**Notes for the next session** (written 20 October 2026, branch `feat/entities-settings-cards`, stacked on `feat/draft-uploads-dive-edits`)

Decisions taken while building:

- Deleted entities leave a row in `deleted_entities` (migration 2), which replaced the journal scan in `seenBefore`. A repeated delete is a no-op; `PUT`, merge or a draft naming a deleted or merged-away id is refused (409 for `PUT` and merge, 422 for a draft). A new database now skips the pre-migration snapshot for every pending migration, not only the first.
- `PUT /api/entities/:kind/:id` checks a new id against the full `entityFields` and a known one against `putEntityRequests`, so it reads the body inside the write. A key clash, on create or rename, is a 409 `{ error, path: ["name"], conflict: { id, name } }`, which is what "Merge instead" needs. Merges and deletes reply `{ version }` like every edit; an unknown kind is a 404.
- A region's new country moves its sites, and a site already there with the same name refuses the whole edit (409, path `countryCode`). Region merges stay within one country. A person merge keeps the survivor's role and place on a dive that had both. Deleting a trip also drops its dives' `tripId` `field_meta` rows. Refusals name what is in the way ("still used by 1 site and 1 dive centre").
- Cards: each image row has a 16-hex-character SHA-256 prefix that names its file (`cards/<id>/<hash>`), so files are written, flushed and their folders synced before the commit, and unused ones pruned after. `PUT` pages are new files (type sniffed from the bytes, never the header; up to 10 MB and `cardMaxPages` = 10, a 413 past the body limit) or existing hashes. `/api/log` and `/api/cards` give `images` as the hash list. Images stream; with `?v=<hash>` they are cached for a year, without it `no-cache`, and a stale hash is a 404. New cards go last; there is no endpoint to reorder cards in the list, as no board has one.
- Journal types: `putEntity` (`{ kind, id, fields }`, the body as sent), `mergeEntity`, `deleteEntity`, `putSettings`, `putCard` (`{ id, name, images: [{ hash, contentType }] }`), `deleteCard`. The card bytes are not journalled, so a replay restores the rows and relies on the backed-up `cards/` folder for the files.
- A site edit re-derives the water type on the server, only when the body of water changes to a new value and the request sends no water type, so resending the stored body of water keeps a hand-set water type. Core's `putEntityRequests.site` no longer has the transform, since it couldn't see the stored value.
- Only site and trip edits, merges and deletes run the derived pass (water types and trips feed CNS); other entities, settings and cards skip it, since no dive figure depends on them. A card's leftover files are pruned after the commit, and a failed prune is only logged, so the saved change still replies 200.

Deferred, or to watch:

- Milestone 12: fetch images as `/api/cards/:id/images/:n?v=<hash>` and key the Dexie cache by hash; a 404 on a stale hash means the log copy is behind.
- Milestone 7: the restore drill should compare `cards/` too, since the journal can't rebuild card files.
- Milestone 10 or 16: a re-uploaded draft is applied as a patch, so a field the diver cleared offline is cleared only if it is text (which arrives as null); a removed trip, weight or override stays. Rare (needs a lost reply and an offline edit); the client could send explicit nulls for cleared fields if it matters.
- Milestone 20: a hand dive left at Nitrox no has a `hand` nitrox row, so an import pairing it with an EANx32 computer dive keeps air. Decide then whether gas is compared like the five fields.
- The derived pass reads every dive's samples on every write: about 10 ms per write on the fixture's 46 dives (9,340 samples), linear, so roughly 100 ms at 500 dives. Cache each dive's own CNS, OTU and sample figures if edits ever feel slow.
- Carried over from milestone 4: `cnsWithCarryOver` and `surfaceInterval` still parse and sort per call; Vite's dev server has no proxy until milestone 8; iOS apple-touch PNGs in milestone 16; UDDF `surfacepressure` is not stored; the seed's journal entry can't be replayed; coverage over the server alone fails core's threshold; Playwright's webServer moves to the seeded server in milestone 8.
- Carried over from milestones 2 and 3: `mod` can go negative for a limit below the surface PO₂ (show no MOD); check the native switch haptic on a phone (milestone 10); the server's and web's `test` scripts still use `--project`; site coordinates are left out; the import types are placeholders until milestone 19.
- Carried over from the scaffold: run Vite once after adding a route before `tsc -b`; `test:xsd` and `restore-drill` still point at scripts later milestones write; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes; add `apps/web` to coverage once it has unit-tested code (milestone 8); the main chunk is about 450 kB.

## Milestone 7: Deploy

**Goal**: both instances run on the home server behind Tailscale Serve with nightly snapshots and a tested restore, so phone testing and backups start now.

**Implements**: Stack and deployment (Deployment, Data, Access), Instance configuration, Server (Network, Serving), Restores, Backups and durability (Built into the server items 1 to 4, Checklist), Testing (Migrations, Restore drill), decisions D18, D26.

**Touches**: `Dockerfile` (multi-stage: pnpm install, build web and server with tsup, runtime image on Node 24), `compose.yml` (app with `network_mode: service:tailscale`, Tailscale sidecar with `TS_SERVE_CONFIG`, bind mounts under `${SHYLOG_DATA_DIR}`, no `container_name`, ports or named volumes), `tailscale/serve.json`, `.env.example`, `.github/workflows/ci.yml` (build the image, publish it from `main`), `apps/server/src/jobs/nightly.ts` (snapshot with `VACUUM INTO`, compress, prune to daily 90 days, weekly two years, monthly forever), `apps/server/src/cli.ts` (snapshot now, restore with journal replay after the snapshot's sequence number bypassing the age rule, restore drill), `scripts/backup.sh <instance>`, `scripts/restore.sh <instance> <snapshot>`, `scripts/restore-drill.sh <instance>`, `README.md` (run, restore guide).

**Acceptance**

- `docker compose --env-file instances/<name>.env up` starts the app and sidecar for each of two instances with different `COMPOSE_PROJECT_NAME`, `TS_HOSTNAME` and `SHYLOG_DATA_DIR`; `docker compose config` shows no published ports, no `container_name`, no named volume.
- From the owner's phone, `https://shylog.<tailnet>.ts.net/api/health` sent with the `X-Shylog` header (an iOS Shortcut, since a browser can't add it) returns JSON and the manifest's name is the instance's `SHYLOG_APP_NAME`; from the second diver's account on the shared node, the identity check passes for their login and fails for an unknown one (smoke test recorded in the README with the commands used).
- `nightly.test.ts`: the job writes `snapshots/shylog-<date>.db.gz` from a temp file renamed when complete, never a symlink; retention pruning keeps the right set for a synthetic three-year run of dates; a failed snapshot is logged and `/api/health` shows the previous time.
- `scripts/restore-drill.sh` restores last night's snapshot to a scratch path, replays the journal from the live database after the snapshot's sequence number, and reports no difference from the live database (compared table by table); run once against the real instance and the output pasted into the milestone notes.
- `migrations.test.ts`: every migration runs against a copy of the real database (a snapshot the owner provides, gitignored) followed by `foreign_key_check`.
- Backup checklist: the off-site job covers the parent folder of both instances (confirmed and noted in the README), and a first end-to-end restore from the off-site copy is done.

**Not in this milestone**: the UDDF export in the nightly job (milestone 13), Litestream, Cloudflare.

- [ ] Dockerfile and Compose with the sidecar, env example
- [ ] Nightly snapshot job with retention
- [ ] Backup, restore, replay and restore-drill scripts
- [ ] README restore guide and backup checklist items
- [ ] Both instances up, identity smoke test recorded
- [ ] Restore drill run once

## Milestone 8: Read-only app, Log and dive detail

**Goal**: the phone shows the seeded log as cards grouped by month and a dive's full detail without the chart, read from a Dexie mirror of `/api/log`.

**Implements**: Screens (Log, Dive detail minus the Profile chart), Mobile rules (header pill placeholder, date and number formats), Client data (`/api/log` mirror in Dexie), Architecture (read side), decisions D2, D13, D15, D23, D25. Screens: `LogHifi2` (Hero count header, cards, month groups, search, filters, empty state), `DiveDetailHifi` (title block, headline figures, Figures, Dive, Cylinder and gas, Conditions in Summary + list layout, People, Notes; the Profile card shows the no-profile note for now).

**Touches**: `apps/web/src/data/db.ts` (Dexie tables mirroring the log, schema version), `apps/web/src/data/sync.ts` (fetch `/api/log` with ETag, write in one Dexie transaction), `apps/web/src/api/` (Hono RPC client with the `X-Shylog` header), `apps/web/src/routes/log/`, `apps/web/src/routes/dive/`, `apps/web/src/format/` (dates "Sat 10", "Sat 25 Jul 2026", durations, depths, tabular numerals), `apps/web/src/components/` (DiveCard, Sparkline, MonthGroup, FilterPills, RangeFilterSheet on shadcn's Slider and Sheet, SyncPill stub), tests with `fake-indexeddb`.

**Acceptance**

- `sync.test.ts`: a log payload lands in Dexie in one transaction; a 304 leaves it untouched; a newer `schemaVersion` stops syncing and sets a flag the UI shows.
- `format.test.ts`: card date is weekday and day only, month header is "July 2026" with the month's count; depth one decimal, duration whole minutes; a long place is shortened before the date.
- `log.spec.ts` (Playwright, server seeded from the fixture with `SHYLOG_DEV_LOGIN`): the Log shows "46 dives logged" and the hours and deepest strip, 46 cards in month groups with the right counts (e.g. July 2026 has 15), each with a sparkline; search "Sodwana" after the owner names a seeded site; the year filter narrows the header figures; scrolling collapses the header to "46 dives · N h"; with one seeded dive marked ignored, the header and its month count drop by one and its card and detail show the eye-off icon, read as "Ignored" by screen readers, in place of the number (D23).
- `filters.test.ts` (D25): a dive is kept when its effective max depth and duration fall within the range, bounds included; a top handle at "> 40 m" or "> 90 min" keeps everything deeper or longer; a dive with no duration is dropped only by a duration range that starts above 0; depth compares in whole mm and duration in seconds, never floats.
- `range-filter.spec.ts` (D25): the Depth pill opens the sheet, dragging the handles updates the labels above them, and Apply narrows the cards and header figures; the pill then reads the range ("18–30 m") in the year pill's active style; Reset is disabled at the full range and restores it; the slider works by keyboard and reads its values to screen readers; the handles are about 44 px to touch.
- `dive.spec.ts`: fixture dive 63's detail shows max depth 32.7 m, duration 42 min, avg depth 21.0 m, water temperature range, SAC blank (no pressures), EANx32, max PO₂ 1.38 bar, MOD at 1.4 bar 33.2 m, CNS and OTU; a dive with no samples shows the figures and the no-profile note; the header title appears on scroll.
- Screenshots at 390 px of the Log and the detail, side by side with `LogHifi2` and `DiveDetailHifi`, in both themes.
- Every figure is computed by `packages/core` on the client, never duplicated in the web app.
- Performance: the detail renders from the Dexie mirror with no request of its own, so its figures appear on the first frame. Opening a card uses the View Transitions API (TanStack Router's `viewTransition`) to morph the card's date, site, depth and time into the detail's title block; it falls back to a plain navigation where unsupported and is skipped under `prefers-reduced-motion`. Tap-to-content time on the owner's phone is recorded in the notes.
- `compress.test.ts` (server): `/api/log` and `/api/dives/:id/samples` are gzipped when the request accepts it, with `Vary: Accept-Encoding`, and the ETag and 304 still work; card images and snapshots are not compressed again (Hono's `compress` middleware, which skips non-text types and bodies under 1 KB).
- `scroll.spec.ts`: going back from a dive's detail returns the Log to the same card, with the sticky month header and the collapsed header as they were (TanStack Router's `scrollRestoration`, checked because the collapsing header changes the page height).
- Routes are code-split (TanStack Router's `autoCodeSplitting`), so a cold launch loads only the shell and the Log; the main chunk's size before and after is recorded in the notes. The service worker still precaches every chunk (milestone 16), so offline is unaffected.
- Month groups use `content-visibility: auto` with a `contain-intrinsic-size`, so the browser skips laying out groups off screen; unlike virtualisation, this keeps find in page and the screen-reader order whole.
- The size of `/api/log` for the seeded log, gzipped and not, is recorded in the notes, with an estimate for 500 dives. Every edit re-downloads the whole log, which is fine at this size; a delta sync would be a design change, worth raising only if the 500-dive figure is large.

**Not in this milestone**: the profile chart (milestone 9), editing, sync states beyond a stub pill, service worker, list virtualisation (only if scrolling a long log still feels slow on the phone with `content-visibility`, then with TanStack Virtual, keeping the sticky month headers).

- [ ] Dexie schema and log mirror
- [ ] API client with the `X-Shylog` header
- [ ] Log screen with Hero count header, cards, groups, search and filters, empty state
- [ ] Depth and duration range filters (D25)
- [ ] Dive detail without chart
- [ ] Formatting helpers
- [ ] View transition from card to detail, with the reduced-motion and unsupported fallbacks
- [ ] Response compression in Hono
- [ ] Scroll restoration on the Log, route code splitting, `content-visibility` on month groups
- [ ] `/api/log` size recorded
- [ ] Tests and screenshots listed above

## Milestone 9: Profile chart

**Goal**: the dive detail draws the computer's time series with Subsurface's points, axes, ticks, speed colours, labelled peaks, events and the MOD line, as a lazy-loaded chunk with a table alternative.

**Implements**: Profile chart (all subsections), Screens (Dive detail: alarms list, differs banner slot), Statistics (second paragraph: lazy chart chunk), decision D8. Screens: `DiveDetailHifi` Profile card with the Lane temperature option and Ascent rate colour, Alarms list.

**Touches**: `apps/web/src/chart/` (lazy chunk: `points.ts`, `axes.ts`, `ticks.ts`, `labels.ts`, `ProfileChart.tsx` on Recharts, `TemperatureLane.tsx`, `EventBands.tsx`, `ModLine.tsx`, `Crosshair.tsx`, `ProfileTable.tsx`), `apps/web/src/data/samples.ts` (fetch and cache samples in Dexie), tests.

**Acceptance**

- `points.test.ts`: fixture dive 63's 20 s log gains one interpolated point per gap and a point at each event time; dive 6's time axis runs to 502 s, not 180 s; the 30 min and 30 m minimums apply to dives 7 and 40.
- `axes.test.ts`: dive 63 gives a depth axis of 36 m (35.66 rounded up to the 4 m tick step for about 10 labels); the spec's 38 m example gives 45 m; dive 54 gives 50 m; the MOD line appears for dives 63 (33.2 m) and 61 (31.9 m) and not for dive 54 (air, 56.2 m); the time axis keeps exact bounds with ticks inside.
- `ticks.test.ts`: tick steps of 5, 10, 12, 15, 20, 30, 60 minutes; depth steps of 1, 2, 4, 5, 10 × 10ⁿ; a 52 min dive with room for 12 labels gets 5 min ticks; the time axis shows m:ss under 10 minutes visible.
- `labels.test.ts`: the peak-labelling walk on dive 63 labels its deepest point and the secondary peaks the rule finds; temperature labels obey the 0.4 °C and label-interval rules.
- `velocity` colours: each segment of dive 54 is in the expected band (a few asserted by hand); the crosshair rate on a point at the same time as its predecessor reads 0 and moves in 0.06 m/min steps.
- The sparkline on Change pairing and the card sparklines use the same profile data and depth scale as the detail chart, as a single accent line (review decision on `ChangePairingHifi`).
- `chart.spec.ts`: on dive 54 the chart shows five ascent bands with a label, the alarms list shows five entries with peak rates, tapping one moves the crosshair; the crosshair readout shows time, depth, temperature, rate; the table alternative lists every point and is reachable by screen reader; the chunk is a separate file in `dist` and is not loaded on the Log.
- Screenshots of dive 63 (with MOD line) and dive 54 (alarms) at 390 px against `DiveDetailHifi`, both themes; the colours are the Tailwind shades from the spec's table, adjusted in dark mode.
- `prefetch.spec.ts`: `pointerdown` on a Log card starts the dive's samples request and the chart chunk before the tap is released (the card's link uses TanStack Router's `preload="intent"` and the dive route's loader fills the Dexie cache); a dive whose samples are cached makes no request; the Profile card holds its final height while loading, so nothing below it moves, and the chart fades in, without the fade under `prefers-reduced-motion`.

**Not in this milestone**: tank pressure, heart rate, ppO₂ (D8), zoom, differs banner behaviour (milestone 10), prefetching samples as cards scroll into view (a fast scroll through a long log would fetch dozens of profiles the diver never opens; add it only if prefetch on intent measurably falls short).

- [ ] Sample fetch and Dexie cache
- [ ] Chart points, interpolation, event points
- [ ] Axis ranges and tick rules
- [ ] Speed colouring and lookback
- [ ] Labelled peaks and temperature labels
- [ ] Temperature lane, event bands with labels, MOD line, crosshair
- [ ] Alarms list under the chart
- [ ] Table alternative
- [ ] Prefetch of samples and the chart chunk on intent, fixed-height Profile card with fade-in
- [ ] Tests and screenshots listed above

## Milestone 10: Editing, the dive form and pickers

**Goal**: a dive can be added or edited on the phone with every v1 field, new dives are saved as drafts in Dexie and uploaded at once, and edits to synced dives go through `PATCH`.

**Implements**: v1 fields (both tables, new-dive defaults), Screens (Add or edit, Site picker), Mobile rules (native pickers, inputmode rules, comma decimals), Conflict rules (hand beats computer, in the form), For a matched dive (adopt and dismiss), Operations and offline sync (Flow steps 1 and 3 to 6 without retry), decisions D6, D13, D14, D23. Screens: `EditDiveHifi` (plus the Training fields, native date and time inputs and the Ignore this dive switch from NOTES), `SitePickerHifi` (with a country list), the people and dive-centre token inputs, a trip picker and the option sheets for Type, Entry, Current, Surge, Workload, Thermal comfort (no board; shadcn Select or Drawer in the board's row style).

**Touches**: `apps/web/src/routes/dive/edit/` (form sections, calculated block, Copy from last dive), `apps/web/src/components/pickers/` (SitePicker with create view, CountrySelect from the ISO list, PeopleInput, DiveCentreInput, TripPicker, OptionSheet), `apps/web/src/data/drafts.ts` (draft and queued ops in one Dexie transaction, rewrite on edit, remove on delete), `apps/web/src/data/upload.ts` (one draft per request, oldest first, drop on accept), `apps/web/src/data/edits.ts` (PATCH with only changed fields, keep values and offer retry on failure), tests.

**Acceptance**

- `drafts.test.ts` (fake-indexeddb): saving a new dive writes the dive, its `upsertDive` op and an `upsertEntity` op for a new site in one transaction; editing the draft rewrites the ops with new op ids; deleting removes them; a rejected draft keeps its reason; accepted ops are dropped; the queue has its own schema version.
- `form.test.ts`: the free-text field is labelled "General" under the "Notes" heading (D22); computer and calculated values render in the normal text colour, with only the marker and reset affordance of D14; required fields are date, time, site, duration, max depth; a comma decimal parses; training agency and course are shown only for Training and saved only then; visibility is metres or a rating; Nitrox off saves no oxygen; the calculated block shows SAC, MOD and max PO₂ live (dive 63's values once its pressures are typed) and highlights max PO₂ over the setting; new-dive defaults fill in and count as hand values; date is prefilled with today and shown as text until tapped; Copy from last dive fills the listed fields and leaves number, date and time, depths, duration, pressures, temperatures, animals and notes; the Ignore this dive switch is off on a new dive, whatever the defaults or the copied dive, and turning it on for a synced dive sends `ignored` in the `PATCH` (D23).
- `adopt.test.ts`: a field with a differing computer value shows the ✓/✕ group; ✓ adopts and marks it from the computer; ✕ dismisses and hides the group; a computer-filled field shows the marker and gains a reset once edited (D14); the detail's banner count matches the number of undismissed differences.
- `sitepicker.test.ts`: "long beach " flags the existing Long Beach in South Africa with "Use it" and not the one in Vietnam; the country is picked from the ISO list; water type defaults by body of water and can be overridden; regions are offered from existing ones in that country as you type, and "sodwana " resolves to the existing Sodwana region on save (D22).
- `edit.spec.ts` (Playwright): add a dive with a new site and buddy, see it uploaded and numbered; edit a seeded dive's notes and see the version change; a save with the server stopped keeps the form values and shows "Try again".
- `form-autosave.test.ts`: the form's unsaved values are written to Dexie as you type (debounced), one per dive being edited or one for a new dive, and restored when the form reopens, since iOS often kills a backgrounded home-screen app mid-entry; save and discard clear it. It is not a draft: it never uploads, gets no ops and has no number.
- Screenshots of the form (new and existing), the site picker (browse, search, create, duplicate) at 390 px against the boards.

**Not in this milestone**: deleting from the form (milestone 11), offline behaviour beyond a failed save (milestone 16), the profile banner's import side.

- [ ] Draft store and upload path
- [ ] Edit path with retry
- [ ] Form sections with native inputs, inputmode rules, comma decimals
- [ ] Calculated block
- [ ] Adopt, dismiss, marker and reset
- [ ] Site picker with country list, region reuse, water type
- [ ] People, dive-centre and trip pickers, option sheets
- [ ] Copy from last dive, new-dive defaults, Training fields, Ignore this dive switch
- [ ] Autosave of the unsaved form, restored on reopen
- [ ] Tests and screenshots listed above

## Milestone 11: Editing, delete and restore, Settings, entities

**Goal**: dives can be deleted and restored, Settings shows its sections with working values, and sites, regions, people, dive centres and trips can be browsed, renamed, merged and deleted.

**Implements**: Rules for edits, Screens (Settings, Sites people and trips, Recently deleted), Mobile rules (Settings shows last sync), Backups (item 3 and 6 as UI, download rows wired in milestone 13), decisions D6, D7, D20. Screens: `SettingsHifi` (all sections; Download rows disabled until milestone 13; Sync card static "All synced" until milestone 16), `EntitiesHifi` (plus a Regions tab), `EntityDetailHifi` (with Save, D7), `RecentlyDeletedHifi` (with the re-import note), `DiveDetailHifi` delete sheet and deleted state.

**Touches**: `apps/web/src/routes/settings/` (sections, You, Diving with the form's controls, Your log, Sites people and trips, This phone with appearance, About), `apps/web/src/routes/entities/` (list with tabs and search, duplicate suggestions, detail with figures, Save, merge sheet, delete), `apps/web/src/routes/deleted/`, `apps/web/src/data/entities.ts`, `apps/web/src/theme.ts` (system, light, dark), tests.

**Acceptance**

- `delete.spec.ts`: deleting a synced dive shows the sheet, moves it to Recently deleted grouped by "Deleted today", the detail shows "Not in your log, stats or export" with Restore, restoring shows the toast with a link and the dive gets its number back; deleting a draft removes it for good with the draft wording.
- `entities.test.ts`: duplicate suggestions flag "2 Mile Reef" for "Two Mile Reef" and "Sam N" for "Sam Naidoo" (rule: number words, initials and normalised prefixes); person figures are dives together, as buddy and buddy since (D20); site figures are dives, deepest, last dive; every entity figure leaves out ignored dives (D23); trip dates come from its dives; delete is disabled with the explanation when used, counting deleted dives.
- `entities.spec.ts`: rename a site with Save; a colliding rename shows the error with "Merge instead"; merge moves the dives and the merged name disappears; the Regions tab lists regions with their sites count.
- `settings.spec.ts`: diver name and max PO₂ save with Save; new-dive defaults use the form's controls and fill a new dive; appearance override applies at once; About shows version and `TS_HOSTNAME`; the Your log dive count includes ignored dives.
- Screenshots of Settings, each entities tab, an entity detail with the merge sheet, and Recently deleted at 390 px against the boards.

**Not in this milestone**: cards (milestone 12), downloads and the export alert (milestone 13), sync states (milestone 16).

- [ ] Delete sheet, deleted state, Recently deleted, restore toast
- [ ] Settings sections with Save
- [ ] Entities list with tabs, search, duplicate suggestions
- [ ] Entity detail with figures, Save, merge, delete
- [ ] Appearance override
- [ ] Tests and screenshots listed above

## Milestone 12: Certification cards

**Goal**: certification cards can be added, viewed full screen, edited, reordered and deleted, and their images are cached on the phone.

**Implements**: Screens (Certifications), Client data (card images cached), Server endpoints from milestone 6. Screens: `CertsHifi` (list, empty, viewer, add, edit).

**Touches**: `apps/web/src/routes/certs/` (list, viewer with pinch zoom and the Wake Lock API where available, add with one-card-or-separate choice, edit with reorder), `apps/web/src/data/cards.ts` (fetch images with the `X-Shylog` header into Dexie blobs, object URLs for display), tests.

**Acceptance**

- `cards.test.ts`: images fetched once are served from Dexie afterwards; a card deleted on the server is removed locally on the next log sync.
- `certs.spec.ts`: add two images as one card with two pages, swipe between them, reorder, rename, delete; add two images as separate cards; the viewer keeps the screen on where the API exists and says so in the hint.
- Screenshots of list, viewer and add at 390 px against `CertsHifi`.

**Not in this milestone**: offline disabling of add, edit and delete (milestone 16).

- [ ] Card list and empty state
- [ ] Viewer with pinch zoom, dots, Wake Lock
- [ ] Add and edit with the one-or-separate choice and reorder
- [ ] Image cache in Dexie
- [ ] Tests and screenshots listed above

## Milestone 13: UDDF export

**Goal**: the whole log is written as valid UDDF nightly and on demand, opens in Subsurface, and the Settings download and alert rows work.

**Implements**: UDDF export (Data model), Units (export column), v1 fields (export column of both tables), Server (UDDF export), Backups (items 1 and 6), Testing (Schema validation), Screens (Settings Download and alerts), decisions D3, D4.

**Touches**: `apps/server/src/uddf/writer.ts` (owner from settings, divecomputer, sites with geography and the body-of-water element, divebases, buddies, trips, gasdefinitions grouped by fraction, tanks grouped by material and volume, dives in schema order, `<applicationdata><shylog>` under Shylog's namespace, `<surfaceintervalbeforedive>` with `<infinity/>`), `apps/server/src/jobs/nightly.ts` (export after the snapshot, temp file, fsync, re-parse, rename), `apps/server/src/routes/export.ts` (`/api/export/uddf`, `/api/export/snapshot`, `/api/export/run`), `fixtures/uddf/uddf_v321.xsd` (vendored), `scripts/validate-uddf.sh` (strips `<shylog>` then runs `xmllint --schema`), `apps/web/src/routes/settings/` (Download rows, export alert with Export now), tests.

**Acceptance**

- `writer.test.ts`: a log with hand dives on 32.4% and 32% nitrox produces two mixes; two dives with Aluminium 11100 ml share one tank; every id is the Shylog id and the export is byte-identical on two runs with no change; dive 63 maps to `informationbeforedive/datetime` without an offset, `greatestdepth` 32.66, temperatures in kelvin, duration in seconds; the per-dive `<shylog>` block carries surge, surface, weather, rating, max temperature, gear, tags, dive centre and trip id; a dive with no earlier dive writes `<infinity/>`; an ignored dive has no `divenumber` and its `<shylog>` block says it is ignored (D23); a hand value that differs from the computer's goes in the standard element; tags, people and professionals export as the spec says.
- `pnpm test:xsd` validates the generated export of the seeded log and a hand-only log; the only allowed failure is the removed `<shylog>` element (the script strips it first).
- `nightly.test.ts` (extended): the export is written after the snapshot through a temp file and re-parse; a failed export leaves the previous file, logs, and `/api/health` reports it; the next night retries.
- `export.test.ts`: `GET /api/export/uddf` rewrites the file and streams it; `GET /api/export/snapshot` streams a `VACUUM INTO` copy; `POST /api/export/run` rewrites without a body and clears the failure.
- The owner opens the export in Subsurface and confirms every dive, site, buddy and mix appears (noted in the milestone notes).
- Settings: the Download rows work, "Last UDDF export" updates, a failed export shows the alert with Export now.

**Not in this milestone**: pass-through of imported standard elements (milestone 20), the queued-ops file (milestone 17).

- [ ] Writer with every field mapping and grouping
- [ ] `<shylog>` application data
- [ ] Nightly export with temp file, fsync, re-parse, rename
- [ ] Export endpoints (D4)
- [ ] Vendored XSD and `test:xsd` script in CI
- [ ] Settings Download rows and export alert
- [ ] Subsurface opens the export
- [ ] Tests listed above

## Milestone 14: Statistics, figures and charts

**Goal**: the Statistics screen shows every figure and chart in the spec's table for the chosen year, lazily loaded, cached until the log changes, with the early-days states.

**Implements**: Statistics (table, Records and milestones, Early days, Averages, SAC rate trend), the lazy chunk rule, decision D24. Screens: `StatsHifi` (all cards except Patterns), `StatsEmptyHifi` (2 dives and no dives).

**Touches**: `apps/web/src/stats/` (lazy chunk: `figures.ts`, `charts/` on shadcn charts, `StatsScreen.tsx`, table alternatives), `apps/web/src/stats/cache.ts` (keyed by log version and year), tests.

**Acceptance**

- `figures.test.ts`: on the seeded fixture (46 scuba dives), totals, deepest (dive 54, 42.3 m), longest (dive 50, 72 min), plain-mean average depth and duration, dives per month for 2026 and per year, depth bands (0 to 10, 10 to 18, 18 to 30, over 30), time of day (before 11:00, 11:00 to 14:00, 14:00 to 18:00, after 18:00), water range from min and max fields; average SAC is duration-weighted and drops 0.1 L/min or less; nitrox share and average nitrox oxygen (four of the 46 dives, average 32.3%); marking a dive ignored removes it from every figure and chart (D23).
- `records.test.ts` (D24), all time on the seeded fixture unless stated: coldest dive 72 (12 °C), warmest dive 7 (30 °C, not dive 6, whose maximum is 34 °C on a 3.9 m dive); a tie goes to the earlier dive; total depth descended 759.1 m, worded "You've descended Lion's Head" with "92% of the way to the Burj Khalifa"; synthetic totals for below the first rung (a share of the Leaning Tower of Pisa), exactly on a rung, "twice" and "3 times", and past the last rung; the landmark list is strictly ascending; longest streaks of 6 days (17 to 22 July 2026) and 4 weeks (4 to 25 April 2026), two dives on one day counting once, and a running streak marked as such; anniversary "7 years diving, since 10 February 2019" with the clock at 19 October 2026, the "today" wording on 10 February, months under a year, unchanged by the year filter; an ignored first dive moves the anniversary to the next dive.
- `trend.test.ts`: the rolling average of the last five dives, only dives with a SAC and not ignored, in date order.
- `stats.spec.ts`: the year chip switches every figure; below five dives the screen shows totals, records and the "More after 5 dives" progress; with no dives the empty state and "Log a dive"; each chart has a table alternative; the chunk is separate in `dist`, not loaded on the Log, and precached for offline later; `pointerdown` on the Stats tab starts loading the chunk (`preload="intent"`), so a tap doesn't wait on it.
- Tap-to-content time for Statistics on the owner's phone, first visit and cached, is recorded in the notes against the performance target.
- Screenshots of Statistics (2026 and all time), the 2-dive and 0-dive states at 390 px against the boards.

**Not in this milestone**: patterns (milestone 15).

- [ ] Figures with the Subsurface averaging rules
- [ ] Records and milestones: coldest and warmest, depth descended against the landmark ladder, day and week streaks, anniversary (D24)
- [ ] Charts: dives per month or year, SAC trend, depth bands, conditions bars, weather and surface, time of day, gas, entry, sites, buddies, regions, tags
- [ ] Early-days and empty states
- [ ] Cache keyed by version and year
- [ ] Tests and screenshots listed above

## Milestone 15: Statistics, patterns

**Goal**: the Patterns section shows the top three findings that clear the bar from the full catalogue, with an All patterns list and a drill-down.

**Implements**: Patterns (Computing, Rule types, Catalogue, The bar, Choosing and showing).

**Touches**: `apps/web/src/stats/patterns/` (`rules/` one file per rule type, `catalogue.ts`, `score.ts`, `wording.ts`, `PatternsCard.tsx`, `AllPatterns.tsx`, `PatternDetail.tsx`), tests with synthetic logs.

**Acceptance**

- `rules.test.ts`: a Difference rule needs five dives per group and finds the best adjacent-level split; a Threshold rule scans whole-number cut-offs and words "4 of 5 dives" when not all match; Change compares with the previous year or the two halves of the log; Trend uses a linear fit; Habit needs 60% over ten dives; Season needs a region and month; Records always qualify; minimum effect sizes per measure as listed; ignored dives never enter a group or a record (D23).
- `score.test.ts`: score is effect over minimum times √(smallest group); ties break by rule id; the top three has at most one per measure and one per field and never a record.
- `wording.test.ts`: describes rather than explains ("is higher in", never "because of"); numbers rounded as elsewhere.
- `patterns.spec.ts`: a seeded log that supports two patterns shows exactly those two; All patterns groups by measure; tapping shows the groups and opens those dives in the Log; with none qualifying the section is hidden.

**Not in this milestone**: new rules beyond the catalogue.

- [ ] Rule types
- [ ] Catalogue of measures and fields
- [ ] Bar, scoring, selection
- [ ] Wording, All patterns, drill-down to the Log
- [ ] Tests listed above

## Milestone 16: Offline, service worker, sync states, storage

**Goal**: the app opens with no signal, drafts wait and retry, every sync state is visible, and the phone's storage is protected where it can be.

**Implements**: Operations and offline sync (Flow steps 2 and 7, retry), Client data (service worker), Mobile rules (sync pill, provisional numbers, disabled controls offline), Offline safety and accessibility, Screens (Settings sync card states). Screens: `LogHifi2` sync pill and draft cards, `DiveDetailHifi` offline note and unsynced banner, `SettingsHifi` sync card and storage sheet, `CertsHifi` offline note, `RecentlyDeletedHifi` offline, `SitePickerHifi` offline note.

**Touches**: `apps/web/vite.config.ts` (vite-plugin-pwa precaching the shell and lazy chunks, manifest served by the server), `apps/web/src/data/sync.ts` (states offline, unreachable, syncing, synced; retry on reconnect and app focus), `apps/web/src/components/SyncPill.tsx`, `UnsyncedBanner.tsx`, `apps/web/src/data/storage.ts` (`navigator.storage.persist()`), `apps/web/src/routes/settings/storage-sheet.tsx`, guards that disable Edit, Delete, Restore, rename, merge, card actions and Import offline, tests.

**Acceptance**

- `sync-states.test.ts`: `navigator.onLine` false gives offline; a failed fetch while online gives server unreachable; an upload in flight gives syncing; an empty queue gives synced and hides the pill; the banner shows the count and the age of the oldest draft.
- `offline.spec.ts` (Playwright with `context.setOffline`): the app loads from the cache with the Log and a dive detail with cached samples; a new dive saved offline shows the outline, cloud-off icon, screen-reader text and a provisional number; back online it uploads and gets its number; a synced dive's Edit and Delete are disabled with the note; a rejected draft shows its reason on the card; the stats chunk works offline.
- `storage.test.ts`: persist is requested on first launch; the Settings row shows Protected or the help sheet; the sheet's copy matches the board.
- Screenshots of the pill states, the draft card and the storage sheet at 390 px.

**Not in this milestone**: the update flow and queue export (milestone 17).

- [ ] Service worker precache and manifest
- [ ] iOS install details: `apple-touch-icon` PNGs, `apple-mobile-web-app-title`, and a status bar style checked on a phone in both themes (`black-translucent` puts white text over the light theme's white header)
- [ ] Sync states, retry, pill, banner
- [ ] Draft indicators and provisional numbers
- [ ] Offline guards on synced-data controls
- [ ] Storage persistence and sheet (`navigator.storage.persist()` also protects the Dexie log mirror and sample cache that make the detail instant, not only the drafts)
- [ ] Tests and screenshots listed above

## Milestone 17: Offline, update flow, queue export, end-to-end sync tests

**Goal**: a new app version never strands a draft, the queue can be saved to a file, and the sync rules are covered end to end.

**Implements**: Client data (update flow, `schemaVersion` gate), Offline safety (queue export), Testing (Sync).

**Touches**: `apps/web/src/update.ts` (offer reload once the queue has synced, or at once if only rejected drafts remain), `apps/web/src/data/export-queue.ts` (download the queued ops as JSON), `apps/web/src/routes/settings/` (Save waiting dives to a file), `apps/web/e2e/sync.spec.ts`, `apps/server/test/sync-e2e.test.ts`.

**Acceptance**

- `update.test.ts`: with a pending draft the reload offer waits; with only rejected drafts it shows at once; a newer `schemaVersion` from the server stops syncing, keeps the queue and offers to update.
- `export-queue.test.ts`: the file contains every queued op, valid against the core schema.
- `sync-e2e.test.ts`: re-sent and duplicated uploads, a draft pointing at an entity merged on the server, and two devices creating the same site offline all end with the same final data as a single clean upload.
- `sync.spec.ts`: two browser contexts log dives offline, reconnect in turn, and both see the same log and numbers.

**Not in this milestone**: nothing further; this closes the Offline step.

- [ ] Update flow
- [ ] Queue export file
- [ ] Sync end-to-end tests
- [ ] Two-device Playwright test

## Milestone 18: Import, the Suunto reader

**Goal**: the server turns a Subsurface UDDF export from the D4i or Zoop Novo into Shylog dives, samples, events, gases and fingerprints, applying every rule in the spec's D4i section.

**Implements**: Subsurface import (Freedives, What the D4i export contains, The Zoop Novo), Instance configuration (Dive computer module), decisions D9, D10, D11, D12. Blocked until a Zoop Novo export is in `fixtures/subsurface/`.

**Touches**: `apps/server/src/uddf/reader.ts` (grows the milestone 4 sample reader), `apps/server/src/import/suunto.ts` (module chosen by `<divecomputer><model>`, D4i and Zoop Novo rules, generic fallback), `apps/server/src/import/freedive.ts`, `fingerprint.ts`, `fixtures/synthetic/generate.ts` and its outputs (D11), `fixtures/subsurface/zoop-novo-*.uddf`, tests.

**Acceptance**

- `reader.test.ts` on the D4i fixture: 72 dives; 26 freedives (fixture 9 to 34 on 28 December 2025, 8 to 26 s, gaps of at most 2 s, no tankdata, no switchmix); 59 ascent pairs stored as 59 events with start and end (dive 3's first pair spans 290 to 311 s), 159 surface events stored and typed; the time-0 switchmix is the dive's gas, never an event; `o2 = 0.21` is air (D9) and 0.32 is Nitrox 32.0%; dive 3's duplicate times merge; dive 6 keeps samples to 502 s with duration 180 s; max depth is `greatestdepth` (dive 63: 32.66 m, deeper than any sample); `averagedepth` is stored as a computer value; temperatures are kelvin converted, carried forward, and min and max come from the samples (D10); `leadquantity` 0, the empty site link, `<notes><para/></notes>`, the dummy divebase and the empty `<divetrip/>` are ignored; datetimes have no offset; a gauge-style dive (no gas, 20 s sampling) is a normal dive, not a freedive.
- `fingerprint.test.ts`: the fingerprint is start time on the computer's clock, duration and max depth; equal for the same computer dive in two exports.
- `zoop.test.ts`: the Zoop Novo fixture passes the same assertions where its data allows, and each difference is a model-specific rule with a test.
- `generate.test.ts`: the synthetic fixtures are regenerated identically and each contains the case it is for.

**Not in this milestone**: pairing, preview, apply, UI.

- [ ] Reader covering every element and placeholder in the spec's list
- [ ] Suunto module with model selection and generic fallback
- [ ] Freedive rule
- [ ] Fingerprints
- [ ] Zoop Novo fixture and rules
- [ ] Synthetic fixture generator
- [ ] Tests listed above

## Milestone 19: Import, preview, clock offsets and pairing

**Goal**: uploading an export produces a stored preview with per-day clock offsets, proposed pairs that pass Subsurface's same-dive test, unpaired and unmatched lists, and freedives, adjustable by day.

**Implements**: Subsurface import (Workflow, Matching and review), Endpoints `POST /api/import`, decision D5 (`GET /api/import/pending`, `PATCH /api/import/:id`, `DELETE /api/import/:id`).

**Touches**: `apps/server/src/import/offset.ts` (per-day estimate rounded to 15 minutes from hand-logged times; the day is the one the dive starts in local site time), `pairing.ts` (closest start on the same day, `likely_same` from core), `preview.ts` (store with the data version, expiry after seven days, override per day), `apps/server/src/routes/import.ts`, tests.

**Acceptance**

- `offset.test.ts`: the synthetic "abroad" fixture (D4i clock 5 hours behind site time) estimates +5:00 for those days and 0:00 at home; a day with no hand dives gets the nearest estimated day's offset; estimates round to 15 minutes; a night dive starting 23:40 belongs to that date.
- `pairing.test.ts`: dive 63 pairs with a hand dive logged at 08:10 for 42 min to 32.7 m and not with one at 08:10 for 20 min; three hand dives on 20 July 2026 pair with fixture 58, 59 and 60 by closest start; a hand dive with no computer dive within the test is listed with the distance to the nearest start; already-fingerprinted dives are skipped; freedives are never proposed.
- `preview.test.ts`: the preview stores the data version and expires after seven days; `PATCH` with a day offset re-proposes that day only and keeps the override; `DELETE` discards; `GET /api/import/pending` returns the one awaiting review.
- `import-route.test.ts`: `POST /api/import` needs the UDDF content type and a connection, writes nothing to `dives`, and returns the preview in the schema from core.

**Not in this milestone**: apply (milestone 20), UI (milestone 21).

- [ ] Clock-offset estimation per day
- [ ] Pairing with `likely_same`
- [ ] Preview storage, expiry, overrides
- [ ] Routes: upload, pending, patch, delete
- [ ] Tests listed above

## Milestone 20: Import, apply, fingerprints and pass-through export

**Goal**: confirming a preview attaches profiles to paired dives, adds new dives, fingerprints everything seen, stores raw fragments, computes CNS and OTU, and the export passes imported standard elements through.

**Implements**: Subsurface import (For a matched dive, Summary), Server (Imports in chunks), UDDF export (Standard data is passed through), Testing (Pass-through, Sync: imports against hand-logged dives), Endpoint `POST /api/import/:id/apply`, decisions D5, D16 data, D19.

**Touches**: `apps/server/src/import/apply.ts` (re-check against current data, return changed dives, chunks of 50 in one transaction each with a journal entry carrying the payload, idempotent by import id), `field_meta` writes for filled and differing fields, `import_raw`, fingerprints with reasons, `apps/server/src/uddf/passthrough.ts` (standard elements in schema order with remapped links; hand values in standard elements), tests.

**Acceptance**

- `apply.test.ts`: a paired dive keeps every hand value (an ignored dive stays ignored), gets samples and events, fills empty fields as computer values (average depth, min and max temperature), records `computer_value` for each of start time, max depth, average depth, duration and temperatures that differ, by any amount; an added dive carries the computer's values with source computer; a skipped dive gets no fingerprint; a freedive left out gets one with reason `freedive`; an included freedive becomes a dive; a second apply with the same import id changes nothing; a 120-dive synthetic export commits in three chunks with three journal entries, and a failure in chunk two leaves chunk one applied and reports it; a hand dive edited after the preview is returned as changed before anything commits; the summary counts match D19.
- `reimport.test.ts`: importing the same export twice skips every dive as already imported; deleting a dive and importing again still skips it.
- `passthrough.test.ts`: import the D4i fixture, export, and compare each dive's standard elements before and after, allowing only remapped ids, hand values and Shylog's own additions to differ; the result validates with `test:xsd`; `<he>`, alarms and extra sample channels in a synthetic fixture survive in place.
- `sync-import.test.ts`: a hand-logged dive uploaded from a draft, then matched by an import, ends with the same data whether the draft arrived before or after the preview was made.

**Not in this milestone**: UI (milestone 21).

- [ ] Apply with re-check, chunks, idempotency
- [ ] `field_meta`, fingerprints, `import_raw`
- [ ] CNS and OTU stored from imported samples
- [ ] Pass-through in the export
- [ ] Tests listed above

## Milestone 21: Import, screens

**Goal**: the Import flow on the phone: upload, review with the clock sheet, paired list, change pairing, the changed-since-preview sheet, and the summary with the differing dives.

**Implements**: Screens (Import), Subsurface import (Matching and review, Summary), the dive detail's differs banner on imported data, decisions D5, D16, D19. Screens: `ImportHifi` (Ready, Waiting review, Uploading as indeterminate, Offline), `ImportReviewHifi` (Not paired, New dives, Also in this file, Freedives, clock sheet, changed sheet), `PairedHifi`, `ChangePairingHifi` (including other days with the warning), `ImportDoneHifi` (with the list of differing dives, D16).

**Touches**: `apps/web/src/routes/import/` (screens above), `apps/web/src/data/import.ts` (upload, pending, patch, apply, discard), tests.

**Acceptance**

- `review.test.ts`: the computer is named from the preview's model ("your D4i", "your Zoop Novo", "dive computer"); "Already imported" is a count row with no expansion and freedives are one row each under day headings with their own Include (D21); the CTA total is paired + added + included freedives; unticking a new dive counts it as skipped; the clock sheet steps by 15 minutes, shows the pair line, and offers "Use +5:00" or "Reset"; a hand pairing across days or failing the test shows the warning.
- `import.spec.ts` (Playwright): upload the D4i fixture into a log with three hand-logged dives for 20 July 2026, see three pairs, 43 new dives and 26 freedives left out; shift a day's clock and see the pairs re-propose; change one pairing to Don't import; include one freedive; apply; the summary shows the counts and lists the dives that differ; opening one shows the banner and the ✓/✕ groups; the Import screen then shows the last import; uploading the same file again shows everything as already imported.
- Screenshots of the five import screens and the clock sheet at 390 px against the boards.

**Not in this milestone**: nothing further; this closes the Import step and v1.

- [ ] Import screen states
- [ ] Review with sections, clock sheet, changed sheet
- [ ] Paired and Change pairing
- [ ] Done with differing dives
- [ ] Tests and screenshots listed above

---

## pnpm scripts

The test stack is fixed in `CLAUDE.md`. These scripts were confirmed on 17 October 2026 and milestone 1 sets them up as written.

Root `package.json`:

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel run dev",
    "build": "pnpm -r run build",
    "typecheck": "tsc -p . && pnpm -r run typecheck",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:xsd": "scripts/validate-uddf.sh",
    "check": "pnpm typecheck && pnpm lint && pnpm test",
    "seed": "pnpm --filter @shylog/server run seed",
    "restore-drill": "scripts/restore-drill.sh"
  }
}
```

`vitest.config.ts` at the root defines three projects: `core` (node), `server` (node, in-memory better-sqlite3 helper), `web` (jsdom with `fake-indexeddb/auto` in `setupFiles`). `vitest run packages/core` scopes a run to core, and a file path scopes it further. Core's script runs from the root with a path filter rather than `--project`: a `--project` run matches coverage paths inside the project, so it checks core's 100 % coverage threshold against no files, and Vitest reads a path filter from the working directory. The root `tsconfig.json` covers the root `*.config.ts` files, which no package typechecks.

`packages/core`:

```json
{ "scripts": { "typecheck": "tsc --noEmit", "test": "cd ../.. && vitest run packages/core" } }
```

`apps/server`:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx watch --env-file-if-exists=../../.env src/index.ts",
    "build": "tsup",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --root ../.. --project server",
    "seed": "tsx scripts/seed.ts"
  }
}
```

`apps/web`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run --root ../.. --project web",
    "test:e2e": "playwright test -c ../../playwright.config.ts"
  }
}
```

Vitest and Playwright only find their config in the working directory, so the package scripts point back at the root configs. The server's `dev` loads the root `.env` and sets `NODE_ENV`, since an unset `NODE_ENV` counts as production and refuses `SHYLOG_DEV_LOGIN`. `apps/server/tsup.config.ts` holds the entry, `esm` format and the Node target, read from `engines.node` in its `package.json`, so a Node LTS bump is one edit. `check` runs the whole Vitest suite and is for CI only. Locally, including at sign-off, run `typecheck` and `lint` in full and only the test files the milestone names, with `vitest run <paths>` (`packages/core` for all of core). `restore-drill` runs in the instance's app container through Docker Compose (D26), so the host needs only Docker, and it never runs in CI.

`playwright.config.ts` runs Chromium and WebKit at a 390 × 844 viewport with a `webServer` that starts the server on a temp `SHYLOG_DATA_DIR` with `SHYLOG_DEV_LOGIN` set and seeds the fixture. `scripts/validate-uddf.sh` strips `<shylog>` elements with a short Node script and runs `xmllint --noout --schema fixtures/uddf/uddf_v321.xsd` over the files given; CI installs `libxml2-utils` (it is not installed in the local WSL today).

## Still open

Everything else that was under-specified has been decided and written into the spec. Two items remain, and one is now closed:

1. **UDDF elements for site data**: the exact elements for region, country and body of water are settled against the vendored XSD in milestone 13 and written into the spec then. The `environment` values were checked against the UDDF 3.2.1 documentation in milestone 2 and are in the spec.
2. **Subsurface comparison figures**: recorded on 19 October 2026 and checked in `cns-otu.test.ts` (milestone 3); no longer open.
3. **Sync pill colours**: the wireframe review thread on the Log's sync pill is still open. Milestone 16 builds the pill as drawn until a choice is made.
