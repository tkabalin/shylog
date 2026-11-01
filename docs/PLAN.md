# Shylog build plan

This plan turns `docs/SPEC.md` into milestones that each fit one working session. It follows the spec's Build order (scaffold, core, server, deploy, read-only app, editing, UDDF export, import, offline, statistics) and splits the larger steps. Import and offline were moved ahead of statistics on 1 November 2026, so the app is usable for real logging before the statistics are built. A milestone is done only when typecheck, lint and its tests pass and its acceptance criteria below are met, with evidence shown (test output, screenshots).

Conventions used throughout:

- **Fixture dive numbers** are Subsurface's `divenumber` in `fixtures/subsurface/d4i-2026-10-12.uddf` (1 to 72), not Shylog's. Dive 63 there is the EANx32 dive to 32.66 m on 22 July 2026. Once imported into an empty log with the 26 freedives left out, it would be Shylog dive 37, so tests must look dives up by fixture number or start time, never by Shylog number. Zoop Novo fixture numbers are its own `divenumber` in `fixtures/subsurface/zoop-novo-2026-11-01.uddf` (1 to 61).
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
| D7 | Saving renames and settings | Entity detail gets an explicit Save action that appears when a field changes, like the Certifications edit screen. A collision shows under the field with a "Merge instead" action. You's sections save as you go instead (changed 30 October 2026): a tap at once, typing as its field is left, and a failed save puts the saved value back, as a Save bar after every tap was an extra step. |
| D8 | Chart axes beyond depth and temperature | The tank-pressure line, heart-rate and gas-partial-pressure axes are not built. `samples` keeps a nullable pressure column that the import fills if an export ever carries one. |
| D9 | Air in imports | A mix with O₂ of exactly 21.0% (210 tenths) imports as air, Nitrox no, as Subsurface treats it. Any other fraction imports as Nitrox with that percentage. |
| D10 | Computer temperatures | The computer's minimum and maximum water temperatures are the lowest and highest sample temperatures. Both fill empty fields as computer values and both are compared with hand values. `lowesttemperature` is read only if present. |
| D11 | Synthetic fixtures | Cases the real export lacks (clock offset abroad, dive crossing midnight, gauge dive, pressure samples, PO₂ over the limit) use small UDDF files generated from real fixture dives by a checked-in script under `fixtures/synthetic/`. |
| D12 | Zoop Novo | The Import milestones waited for a Zoop Novo export in `fixtures/subsurface/`. It arrived on 1 November 2026 (`zoop-novo-2026-11-01.uddf`) and every D4i rule holds for it, so Import is unblocked. |
| D13 | Dexie timing | Dexie mirrors `/api/log` from the read-only app onwards. Drafts are written to the Dexie queue from the editing milestone and uploaded straight away. The Offline milestone adds the service worker, retry, sync states, storage persistence, queue export and the update flow. |
| D14 | Adopt or dismiss | A field whose hand value differs from a stored computer value shows the ✓ "Use D4i value" / ✕ "Keep mine" group, for all five compared fields. A field currently holding a computer or calculated value is marked by a cyan bar down its row's left edge, keyed by a note under the card ("From your dive computer or worked out by Shylog"); once edited, the bar goes and a "Reset to the D4i value" button sits beside the label. Per-row icons were tried first and read as busy. Computer and calculated values use the normal text colour; the accent treatment tried in the wireframe review was dropped. |
| D15 | Log header | The *Hero count* variant: "72 dives logged", a one-line "58 h underwater · deepest 32.7 m" strip, collapsing to "72 dives · 58 h" on scroll. The compact line was dropped on 24 October 2026: only the search and filter bar stays. |
| D16 | "N dives differ" after an import | The Import done screen lists the differing dives, each linking to its detail. No new Log filter. |
| D17 | Icon key | Reference only, no screen. |
| D18 | Tailscale state | A bind mount at `${SHYLOG_DATA_DIR}/tailscale`, so one folder per instance holds everything the backup covers. |
| D19 | Freedives in the summary | Counted separately: paired, added, already imported, left out (freedives and dives under a minute, D33), included (shown when non-zero). The CTA total includes the included ones. |
| D20 | Person figures | "Dives together", "As buddy" and "Buddy since" are kept, derived on the client from the link tables. |
| D21 | Long lists in the import review | "Already imported" is a plain count row that never expands. Freedives are listed as the board draws them: one row per freedive under a day heading, each with its own Include. Dives under a minute (D33) join the same list, their row saying so. |
| D22 | Labels fixed in review | The free-text notes field is labelled "General" (the section stays "Notes"); maximum PO₂ is a plain decimal input with no preset list. A site's region is typed with existing regions in that country offered as you type (this supersedes the review's free-text-only choice). |
| D23 | Ignored dives (added 19 October 2026) | A hand-set `ignored` flag on each dive, false by default, for pool sessions, aborted dives, chamber runs or any other reason. An ignored dive has no number and is left out of the Log's counts, Statistics and entity figures, but still counts for surface intervals, CNS carry-over, the health dive count and the export (see Ignored dives in the spec). |
| D24 | Records and milestones (added 19 October 2026) | The Records and averages card adds coldest and warmest dive (by the dive's effective minimum water temperature, since the maximum picks up near-surface readings), total depth descended against a ladder of landmarks from the Leaning Tower of Pisa to the Kármán line, longest streaks in consecutive days and weeks, and a diving anniversary that ignores the year filter (see Records and milestones in the spec). |
| D25 | Depth and duration filters (added 20 October 2026) | The Log gets Depth and Duration pills beside year, tag and region. Each opens a sheet with a two-handle range slider (0 m to "> 40 m" in 1 m steps; 0 min to "> 90 min" in 5 min steps), the bounds shown above the handles, and Reset and Apply. The top handle at its end means no upper limit, so the deepest and longest dives are never cut off by the scale (see Log in the spec). |
| D26 | Image and backup tooling (added 22 October 2026) | CI builds the Docker image on every run and, once the checks pass on `main`, publishes it to `ghcr.io/tkabalin/shylog` as `latest` and `sha-<commit>`; Compose pulls a tag rather than building. The snapshot, restore and restore-drill logic is a Node CLI in the server image (`apps/server/src/cli.ts`), which the shell scripts run through `docker compose`, so the host needs only Docker and files in the data folder are written by the container's user. `scripts/backup.sh <instance>` takes a snapshot now through the nightly job's code. The drill compares table by table in Node rather than with `sqldiff`. There are no releases: `latest` is the one moving tag everyone runs, and `scripts/update.sh <instance>` updates an instance with a snapshot first and a rollback to the old image if the new one doesn't turn healthy, so a scheduler on the host can run it for continuous deployment. |
| D27 | Log and detail details (added 22 October 2026) | SAC's sample figures (time under water and mean depth) are stored on the dive when its samples are written and sent in `/api/log`, so the detail's SAC needs no samples. The Log's count and strip scroll away with the list like an iOS large title, leaving the search and filter bar stuck under the status bar; nothing animates height. Range filters round the dive to whole metres and minutes before comparing. A card's place is the site's region, or its country when the site has none, and the detail shows "region, country" or the country. The search narrows the cards but not the header figures, which follow the filter pills only. Opening a dive from the Log doesn't animate; the card-to-detail morph was dropped. |
| D28 | Profiles on the phone and full screen (added 26 October 2026) | Samples are no longer only on demand (D2 still keeps them out of `/api/log`): after each sync the phone downloads the profiles it lacks through `GET /api/samples?ids=`, 25 dives a request, so charts open at once and work offline. The chart's code loads once the Log is idle and the Profile card no longer suspends, so a cached dive draws within a few frames, with no skeleton. An expand button opens the chart full screen as its own screen, drawn a quarter turn round when the phone reports portrait. Landscape layouts for the rest of the app are deferred to a later milestone. |
| D29 | Dive form pickers (added 27 October 2026) | Every picker is a bottom sheet: choice fields as option lists, the site picker at full height with its country and body-of-water lists pushed inside it, and buddies, dive professionals, the dive centre and the trip as rows opening a full-height sheet with the most recently used first, instead of the board's suggestions inside the card, which the keyboard hides. Computer values that differ show on their own line under each field. The surface interval opens a sheet with hours and minutes wheels, Calculated and No previous dive. A new dive's start time is empty and its picker starts at 09:00 (see Add or edit in the spec). |
| D30 | The You tab (added 29 October 2026) | The fourth tab, drawn as Settings, is called You, with a scuba mask icon (the owner's choice), as dive apps keep certification cards under the diver's profile. The page follows `SettingsHifi` with the sync card at the top, the diver name card (and certifications, milestone 12) under it without a heading, and alerts above everything. About's version is the short commit the image was built from (a Docker build argument CI fills), `dev` in development, and its server name is `TS_HOSTNAME`, sent in `/api/health`. An entity's detail lists its three latest dives and its All action lists the rest in place, with no Log filter. The restore toast is shadcn's Sonner. Recently deleted groups by today, yesterday, then month. |
| D31 | Certification cards (added 30 October 2026) | The cards live under You at `/you/certifications`, and a card's viewer is pushed as `/you/certifications/$cardId`, dark and full screen. The list's add button opens the photo picker straight away, and New card and Edit card are full-height sheets over the list or the viewer, holding the picked images until Save. A page is reordered by a long press that lifts its thumbnail, then a drag, so a plain swipe still scrolls the strip. Pinch to zoom, panning, page swipes and the reorder use Motion. After each sync the phone downloads in the background every card image it lacks into Dexie, so a card opens with no signal even if it was never opened on that phone; images no card names any more are dropped. Deleting a card asks first in a sheet, as deleting a dive does. |
| D32 | Certification cards on You (added 31 October 2026) | You shows the first three cards in the owner's order as tiles under the diver name, each opening its viewer, with an All certifications row to the list, rather than the board's single Certifications row. A card's age or level isn't recorded, so the order is the owner's: a new card goes first, and a long press on a row in the list (a drag with a mouse) lifts it to move it, saved through `PUT /api/cards/order`. |
| D33 | Dives under a minute (added 1 November 2026) | A computer dive that isn't a freedive but has a `diveduration` under 60 s is left out like a freedive: fingerprinted with reason `short`, listed with the freedives with its own Include, and counted with them as left out. The Zoop Novo export has two such blips (dives 42 and 54); without this they would be added by default on every import, as a skipped dive gets no fingerprint. The D4i's shortest scuba dive is 100 s. |

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
| 11 | 6 | Editing: delete and restore, You, entities | 10 |
| 12 | 6 | Certification cards | 11 |
| 13 | 7 | UDDF export | 6 |
| 14 | 8 | Import: the Suunto reader | 5 |
| 15 | 8 | Import: preview, clock offsets, pairing | 14 |
| 16 | 8 | Import: apply, fingerprints, pass-through export | 15, 13 |
| 17 | 8 | Import: screens | 15, 16 |
| 18 | 9 | Offline: service worker, sync states, storage | 11, 17 (the Import screen's offline state) |
| 19 | 9 | Offline: update flow, queue export, end-to-end tests | 18 |
| 20 | 10 | Statistics: figures and charts | 9, 18 (the stats chunk offline) |
| 21 | 10 | Statistics: patterns | 20 |

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

**Not in this milestone**: vite-plugin-pwa configuration and the service worker (milestone 18), any data, any screen content, Docker.

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
- Touch sizes are edited into the shadcn components' variants (`h-11 desk:h-8` and so on, `desk:` being 48rem wide with a fine pointer), and `sidebar.tsx` has its Ctrl/Cmd+B toggle removed (the sidebar never collapses). Re-adding a component with `shadcn add --overwrite` drops these edits.
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
- The import types in `schemas/import.ts` are placeholders until milestone 15 builds previews.
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

**Not in this milestone**: statistics (milestones 20 and 21), pattern rules, anything touching XML in production code.

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
- Carried over from milestone 2: the server must check the rules that depend on stored values (see its notes); site coordinates are left out; the ISO 3166 list should move into core when milestones 4 and 10 need it; the import types are placeholders until milestone 15; free-text fields reject an empty string.
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
- iOS ignores SVG manifest icons; the apple-touch PNGs are in milestone 18.
- UDDF `surfacepressure` is not read or stored; the import (milestone 14) adds a column if an export carries it.
- The seed's journal entry is `{ source, dives }`, so a replay can't rebuild seeded data. Dev only.
- Coverage over the server alone fails core's 100 % threshold, since server tests import core; CI's whole-repo run is fine.
- Playwright's webServer is still Vite's dev server; switch it to the seeded Node server in milestone 8 (the `/dev/ui` touch-size route moves then).
- Carried over from milestone 3: one sorted pass for carry-over (above); `mod` can go negative for a limit below the surface PO₂, so show no MOD then; check the native switch haptic on a phone (milestone 10); the server's and web's `test` scripts still use `--project`.
- Carried over from milestone 2: the server must check the rules that depend on stored values (see its notes, milestone 5 and 6); site coordinates are left out; the import types are placeholders until milestone 15; free-text fields reject an empty string. The ISO 3166 list is now seeded from core's `countryCodes`.
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
- Milestone 10 or 18: a re-uploaded draft is applied as a patch, so a field the diver cleared offline is cleared only if it is text (which arrives as null); a removed trip, weight or override stays. Rare (needs a lost reply and an offline edit); the client could send explicit nulls for cleared fields if it matters.
- Milestone 16: a hand dive left at Nitrox no has a `hand` nitrox row, so an import pairing it with an EANx32 computer dive keeps air. Decide then whether gas is compared like the five fields.
- The derived pass reads every dive's samples on every write: about 10 ms per write on the fixture's 46 dives (9,340 samples), linear, so roughly 100 ms at 500 dives. Cache each dive's own CNS, OTU and sample figures if edits ever feel slow.
- Carried over from milestone 4: `cnsWithCarryOver` and `surfaceInterval` still parse and sort per call; Vite's dev server has no proxy until milestone 8; iOS apple-touch PNGs in milestone 18; UDDF `surfacepressure` is not stored; the seed's journal entry can't be replayed; coverage over the server alone fails core's threshold; Playwright's webServer moves to the seeded server in milestone 8.
- Carried over from milestones 2 and 3: `mod` can go negative for a limit below the surface PO₂ (show no MOD); check the native switch haptic on a phone (milestone 10); the server's and web's `test` scripts still use `--project`; site coordinates are left out; the import types are placeholders until milestone 15.
- Carried over from the scaffold: run Vite once after adding a route before `tsc -b`; `test:xsd` and `restore-drill` still point at scripts later milestones write; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes; add `apps/web` to coverage once it has unit-tested code (milestone 8); the main chunk is about 450 kB.

## Milestone 6: Server, entities, settings and cards

**Goal**: sites, regions, people, dive centres and trips can be renamed, merged and deleted, settings read and changed, and certification cards stored with their images.

**Implements**: Rules for edits (merges, deletes, aliases), Conflict rules (Merges, Renames), Endpoints `PUT /api/entities/:kind/:id`, `POST /api/entities/:kind/:id/merge`, `DELETE /api/entities/:kind/:id`, `GET`/`PUT /api/settings`, `GET /api/cards`, `PUT`/`DELETE /api/cards/:id`, `GET /api/cards/:id/images/:n`, decision D6.

**Touches**: `apps/server/src/routes/entities.ts`, `settings.ts`, `cards.ts`, `apps/server/src/apply/merge.ts`, `apps/server/src/cards/` (files under `${SHYLOG_DATA_DIR}/cards/`), `apps/server/src/db/migrations/002-*.ts` (the `deleted_entities` tombstones and each card image's hash), tests.

**Acceptance**

- `entities.test.ts`: `PUT` with a new id creates; a rename that collides with another key is refused with a structured error naming the survivor; merge moves every dive link, rewrites site and dive-centre regions for a region merge, records an alias, deletes the merged-away row, journals, and recalculates CNS for trip merges; deleting a site used by a dive in Recently deleted is refused; deleting a trip unlinks its dives and is allowed; deleting a region with sites is refused; every entity kind is covered.
- `settings.test.ts`: defaults are the diver name empty, max PO₂ 1.4, new-dive defaults empty; `PUT` validates with the core schema; a new-dive default uses the same shapes as dive fields (material, volume in ml, oxygen in tenths).
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
- Milestone 10 or 18: a re-uploaded draft is applied as a patch, so a field the diver cleared offline is cleared only if it is text (which arrives as null); a removed trip, weight or override stays. Rare (needs a lost reply and an offline edit); the client could send explicit nulls for cleared fields if it matters.
- Milestone 16: a hand dive left at Nitrox no has a `hand` nitrox row, so an import pairing it with an EANx32 computer dive keeps air. Decide then whether gas is compared like the five fields.
- The derived pass reads every dive's samples on every write: about 10 ms per write on the fixture's 46 dives (9,340 samples), linear, so roughly 100 ms at 500 dives. Cache each dive's own CNS, OTU and sample figures if edits ever feel slow.
- Carried over from milestone 4: `cnsWithCarryOver` and `surfaceInterval` still parse and sort per call; Vite's dev server has no proxy until milestone 8; iOS apple-touch PNGs in milestone 18; UDDF `surfacepressure` is not stored; the seed's journal entry can't be replayed; coverage over the server alone fails core's threshold; Playwright's webServer moves to the seeded server in milestone 8.
- Carried over from milestones 2 and 3: `mod` can go negative for a limit below the surface PO₂ (show no MOD); check the native switch haptic on a phone (milestone 10); the server's and web's `test` scripts still use `--project`; site coordinates are left out; the import types are placeholders until milestone 15.
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

- [x] Dockerfile and Compose with the sidecar, env example
- [x] Nightly snapshot job with retention
- [x] Backup, restore, replay and restore-drill scripts
- [x] README restore guide and backup checklist items
- [x] Both instances up, identity smoke test recorded
- [x] Restore drill run once

**Notes for the next session** (written 22 October 2026, branch `feat/deploy-backups`)

Still to do on the home server (the owner deploys from the README, D26): bring both instances up, run the identity smoke test and fill in "Last run" in the README, run `scripts/restore-drill.sh` on the real instance and paste its output here, confirm the off-site job covers `/srv/shylog/` and do a first off-site restore, and copy a nightly snapshot to `fixtures/real/shylog.db.gz` so `migrations.test.ts` runs against real data. If the GHCR package is private, make it public or `docker login ghcr.io` on the server. Docker isn't set up in WSL, so the image was first built by CI.

Restore drill, run on the home server on 26 October 2026 against both instances, on `main` at `f674896`, after their first scheduled snapshot:

```
=== thomas
Restored shylog-2026-10-26.db.gz to a scratch folder.
Replayed 0 journal entries.
No differences from the live database.
=== john
Restored shylog-2026-10-26.db.gz to a scratch folder.
Replayed 0 journal entries.
No differences from the live database.
```

Nothing had been written since the snapshots, so no journal entries were replayed. Run it again once some writes land after a snapshot, to exercise the replay.

The acceptance asks for the smoke test and the off-site coverage to be noted in the README. The dated records are kept here instead, because they describe the owner's server, and the README stays generic for anyone running Shylog. The README has the smoke test's how-to.

Smoke test, 25 and 26 October 2026, two instances:

- The owner's phone: both apps installed from Safari and loaded.
- With only the second diver's login allowed on their instance, a request from the owner's login got `403 {"error":"Login not allowed"}`. Adding it back restored `200`.
- The second diver's phone, on the shared node: the app installed to the home screen and loaded. This proves that Serve sends a shared user's login and that the tailnet grant for the shared node works.

Off-site backup, 26 October 2026: the server's nightly system backup copies `/srv/shylog/` to the NAS, and restic sends that copy to Backblaze B2. Both instances' snapshots were confirmed in B2. Restic's retention provides the versioning. Immutability comes from a backup key that can't delete files, plus a 30-day window in which hidden files can still be recovered: real object lock doesn't work with restic's pruning. First end-to-end restore: a snapshot was restored from B2 with restic, and its checksum matched the NAS copy. It was restored with `cli.js restore` into a scratch data folder, and a server started on it turned healthy and passed `health` and `drill`.

Decisions taken while building:

- The backup tools are one CLI, `apps/server/dist/cli.js` (`snapshot`, `journal --since <time>`, `restore <snapshot> [--replay-to <seq>|all]`, `drill`), which the scripts run in the app container through a shared `scripts/instance.sh`. That file unsets every variable the env file sets, since Compose lets the shell's variables win over `--env-file`.
- `write()` gives each transaction one time, strictly later than the last, for all its journal entries and for any time it stores (`deleted_at`). A replay groups entries by that time, so a draft replays whole and `--replay-to` inside one stops before it. Replayed rows keep their seq, op id and time, each transaction gets a new version, and entries written before a later migration are refused (they need the server version that wrote them). `seed` entries can't be replayed, which only affects development databases.
- A restore unpacks the snapshot and runs `integrity_check` on it before moving anything; a refused snapshot exits 3 and `restore.sh` starts the app again. The old files go to `restore-aside/<time>/`, and card images the restored database names but can't find are listed, since the journal can't rebuild them.
- The drill opens the live database read-only, takes a `VACUUM INTO` copy, and compares every table in a fixed order, streamed, ignoring meta's `version`, `last_snapshot_at` and `last_export_at`, then checks every card image file against its hash.
- Snapshots stream through gzip under unique temp names (a `backup.sh` run during the nightly one can't collide), and temp files a crashed run left are pruned after a day. A database that failed its integrity check is never snapshotted, by the nightly job or the CLI.
- Compose requires `COMPOSE_PROJECT_NAME`, sets `TS_AUTH_ONCE`, mounts the data folder at the same path, and runs the app read-only as uid 1000 with `init`. `PORT` is set to 3000 in Compose, matching `tailscale/serve.json`, which can't interpolate it; each instance has its own network namespace, but the CLAUDE.md rule against hard-coded ports may want rewording.
- `scripts/update.sh` pulls, snapshots only when the image changed, and runs `up --wait` on the image's `HEALTHCHECK` (`cli.js health`, which asks `/api/health` as the first allowed login). On failure it tags the old image back and starts it; the server's refusal of a newer schema makes that fail safely after a migration, leaving the app stopped (exit 1, rolled back is 3). Pull-based on purpose: a self-hosted runner on a public repo, or pushing from Actions, would give CI a way onto the server. The scheduler (and not retrying an image that rolled back) belongs to the host.
- Compose takes `SHYLOG_IMAGE` for forks and sets memory and pids limits (`SHYLOG_MEMORY_LIMIT`, 1 GB by default) on both containers.
- CI's `image` job checks the Compose file, builds the image and smoke-tests it (health, page and asset, manifest name, time zone, `snapshot` and `drill`). `publish` rebuilds from the cache only `main` writes, rather than pushing the tested image. Runs on `main` aren't cancelled, but a newer push replaces a pending one, so a burst of merges may skip a `sha-` tag.

Deferred, or to watch:

- Node 24.22.1 (a security release, 20 October) and Tailscale 1.104.2 were too new for the three-day rule; bump the base image digest, `.nvmrc` and the sidecar after 23 October.
- A sidecar that Docker restarts on its own leaves the app in a dead network namespace until `up -d` (noted in the README). The server could exit when it has no non-loopback interface, so its restart policy rejoins.
- `VACUUM INTO` blocks the server briefly at midnight; move it to a worker if it ever shows.
- Milestone 13: the nightly job also writes the UDDF export (`nightly()` in `jobs/nightly.ts`); the drill already ignores `last_export_at`.
- Milestone 12: fetch images as `/api/cards/:id/images/:n?v=<hash>` and key the Dexie cache by hash; a 404 on a stale hash means the log copy is behind.
- Milestone 10 or 18: a re-uploaded draft is applied as a patch, so a field the diver cleared offline is cleared only if it is text (which arrives as null); a removed trip, weight or override stays. Rare (needs a lost reply and an offline edit); the client could send explicit nulls for cleared fields if it matters.
- Milestone 16: a hand dive left at Nitrox no has a `hand` nitrox row, so an import pairing it with an EANx32 computer dive keeps air. Decide then whether gas is compared like the five fields.
- The derived pass reads every dive's samples on every write: about 10 ms per write on the fixture's 46 dives (9,340 samples), linear, so roughly 100 ms at 500 dives. Cache each dive's own CNS, OTU and sample figures if edits ever feel slow.
- Carried over from milestone 4: `cnsWithCarryOver` and `surfaceInterval` still parse and sort per call; Vite's dev server has no proxy until milestone 8; iOS apple-touch PNGs in milestone 18; UDDF `surfacepressure` is not stored; coverage over the server alone fails core's threshold; Playwright's webServer moves to the seeded server in milestone 8.
- Carried over from milestones 2 and 3: `mod` can go negative for a limit below the surface PO₂ (show no MOD); check the native switch haptic on a phone (milestone 10); the server's and web's `test` scripts still use `--project`; site coordinates are left out; the import types are placeholders until milestone 15.
- Carried over from the scaffold: run Vite once after adding a route before `tsc -b`; `test:xsd` still points at a script milestone 13 writes; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes; add `apps/web` to coverage once it has unit-tested code (milestone 8); the main chunk is about 450 kB.

## Milestone 8: Read-only app, Log and dive detail

**Goal**: the phone shows the seeded log as cards grouped by month and a dive's full detail without the chart, read from a Dexie mirror of `/api/log`.

**Implements**: Screens (Log, Dive detail minus the Profile chart), Mobile rules (header pill placeholder, date and number formats), Client data (`/api/log` mirror in Dexie), Architecture (read side), decisions D2, D13, D15, D23, D25, D27. Screens: `LogHifi2` (Hero count header, cards, month groups, search, filters, empty state), `DiveDetailHifi` (title block, headline figures, Figures, Dive, Cylinder and gas, Conditions in Summary + list layout, People, Notes; the Profile card shows the no-profile note for now).

**Touches**: `apps/web/src/data/db.ts` (Dexie tables mirroring the log, schema version), `apps/web/src/data/sync.ts` (fetch `/api/log` with ETag, write in one Dexie transaction), `apps/web/src/api/` (Hono RPC client with the `X-Shylog` header), `apps/web/src/routes/log/`, `apps/web/src/routes/dive/`, `apps/web/src/format/` (dates "Sat 10", "Sat 25 Jul 2026", durations, depths, tabular numerals), `apps/web/src/components/` (DiveCard, Sparkline, MonthGroup, FilterPills, RangeFilterSheet on shadcn's Slider and Sheet, SyncPill stub), tests with `fake-indexeddb`.

**Acceptance**

- `sync.test.ts`: a log payload lands in Dexie in one transaction; a 304 leaves it untouched; a newer `schemaVersion` stops syncing and sets a flag the UI shows.
- `format.test.ts`: card date is weekday and day only, month header is "July 2026" with the month's count; depth one decimal, duration whole minutes; a long place is shortened before the date.
- `log.spec.ts` (Playwright, server seeded from the fixture with `SHYLOG_DEV_LOGIN`): the Log shows "46 dives logged" and the hours and deepest strip, 46 cards in month groups with the right counts (e.g. July 2026 has 15), each with a sparkline; search "Sodwana" after the owner names a seeded site; the year filter narrows the header figures; scrolling takes the count and strip away and shows "46 dives · N h" in the bar; with one seeded dive marked ignored, the header and its month count drop by one and its card and detail show the eye-off icon, read as "Ignored" by screen readers, in place of the number (D23).
- `filters.test.ts` (D25): a dive is kept when its effective max depth and duration fall within the range, bounds included; a top handle at "> 40 m" or "> 90 min" keeps everything deeper or longer; a dive with no duration is dropped only by a duration range that starts above 0; the dive's depth and duration are rounded to whole metres and minutes in integer maths before comparing, so a 30.4 m dive is inside 18–30 m and a 29:40 dive inside 30–90 min.
- `range-filter.spec.ts` (D25): the Depth pill opens the sheet, dragging the handles updates the labels above them, and Apply narrows the cards and header figures; the pill then reads the range ("18–30 m") in the year pill's active style; Reset is disabled at the full range and restores it; the slider works by keyboard and reads its values to screen readers; the handles are about 44 px to touch.
- `dive.spec.ts`: fixture dive 63's detail shows max depth 32.7 m, duration 42 min, avg depth 21.0 m, water temperature range, SAC blank (no pressures), EANx32, max PO₂ 1.38 bar, MOD at 1.4 bar 33.2 m, CNS and OTU; a dive with no samples shows the figures and the no-profile note; the header title appears on scroll.
- Screenshots at 390 px of the Log and the detail, side by side with `LogHifi2` and `DiveDetailHifi`, in both themes.
- Every figure is computed by `packages/core` on the client, never duplicated in the web app.
- Performance: the detail renders from the Dexie mirror with no request of its own, so its figures appear on the first frame. Opening a card is a plain navigation with no transition, as `.claude/rules/motion.md` says for screens opened this often (D27). Tap-to-content time on the owner's phone is recorded in the notes.
- `compress.test.ts` (server): `/api/log` and `/api/dives/:id/samples` are gzipped when the request accepts it, with `Vary: Accept-Encoding`, and the ETag and 304 still work; card images and snapshots are not compressed again (Hono's `compress` middleware, which skips non-text types and bodies under 1 KB).
- `scroll.spec.ts`: going back from a dive's detail returns the Log to the same card, with the sticky month header and the collapsed header as they were (TanStack Router's `scrollRestoration`, checked because the collapsing header changes the page height).
- Routes are code-split (TanStack Router's `autoCodeSplitting`), so a cold launch loads only the shell and the Log; the main chunk's size before and after is recorded in the notes. The service worker still precaches every chunk (milestone 18), so offline is unaffected.
- Month groups use `content-visibility: auto` with a `contain-intrinsic-size`, so the browser skips laying out groups off screen; unlike virtualisation, this keeps find in page and the screen-reader order whole.
- The size of `/api/log` for the seeded log, gzipped and not, is recorded in the notes, with an estimate for 500 dives. Every edit re-downloads the whole log, which is fine at this size; a delta sync would be a design change, worth raising only if the 500-dive figure is large.

**Not in this milestone**: the profile chart (milestone 9), editing, sync states beyond a stub pill, service worker, list virtualisation (only if scrolling a long log still feels slow on the phone with `content-visibility`, then with TanStack Virtual, keeping the sticky month headers).

- [x] Dexie schema and log mirror
- [x] API client with the `X-Shylog` header
- [x] Log screen with Hero count header, cards, groups, search and filters, empty state
- [x] Depth and duration range filters (D25)
- [x] Dive detail without chart
- [x] Formatting helpers
- [x] Response compression in Hono
- [x] Scroll restoration on the Log, route code splitting, `content-visibility` on month groups
- [x] `/api/log` size recorded
- [x] Tests and screenshots listed above

**Notes for the next session** (written 22 October 2026, branch `feat/log-dive-detail`, stacked on `feat/deploy-backups`)

Still to do on the owner's phone: record tap-to-content time for opening a dive (the detail makes no request and renders from memory, and `defaultPreload: "intent"` starts the route chunk on touchstart). Also check the drawer overlay's blur cost during momentum scroll (the bars and headings are opaque now), edge-swipe back in the installed app (tabs replace history, so it should never step through them), the month line handing over between months, the keyboard with the sticky search focused, swipe-to-dismiss against dragging the slider, whether the top safe-area inset is non-zero in standalone mode, and whether cards flash their pressed tint when a scroll starts on them.

Measured:

- First load of the Log, before this branch: 453 kB of JS (149 kB gzipped) in one chunk. Now 584 kB before idle, then 640 kB (216 kB gzipped) once the range sheet's chunk preloads; the shell alone is 567 kB (190 kB gzipped). Most of the growth is Dexie and the Log's code. `"sideEffects": false` on core took 97 kB off, and lazy-loading the range sheet 57 kB.
- `/api/log` for the seeded 46 dives: 93 kB, 10.4 kB gzipped, about 2 kB a dive, so roughly 1 MB and 115 kB gzipped at 500 dives. No delta sync needed.

Decisions taken while building:

- D27 records the decisions taken in review: SAC's sample figures stored on the dive, the large-title header, the place falling back to the country, search leaving the header figures alone, range filters rounding the dive to whole metres and minutes, and no card-to-detail transition (`.claude/rules/motion.md` was reworded for the header).
- The Log stays at `/` in `routes/index.tsx`, not `routes/log/`. Its logic lives in `src/log/` (filters, groups, header figures), the detail's in `src/dive/`, the mirror in `src/data/` and formatting in `src/format/`. Custom icons go in `src/components/icons/`.
- The mirror is read into memory (`data/log.ts`, `useSyncExternalStore`) before the first render, and syncs fetch `/api/log` with the mirror's version as an ETag on open, on focus and every five minutes, rather than checking `/api/version` first. A failed first sync shows "Can't reach Shylog" with Try again. A blocked app (a newer schema) still asks with the blocking version's tag, so a rolled-back server unblocks it, and a sync never writes over a newer log another tab wrote.
- Filters live in the URL, so going back from a dive keeps them; the router's `scrollRestoration` restores `#main`. The back link and the Log tab on a dive go back in history when they can; otherwise they, the tabs, and links into a tab replace the current entry, so swiping back never steps through tabs (SPEC "Navigation history"). Forward after going back from a dive is left as is. Month groups use `content-visibility: auto` with their exact height (cards are a fixed 84 px). Bars, sticky headings and the tab bar are opaque; the line under the stuck search bar moves to the stuck month heading, and stays with the headings while two months hand over.
- The range filter is shadcn's Drawer (Base UI's swipeable drawer) rather than Sheet. It is lazy-loaded once the Log is idle, mounts closed for a frame so its first opening slides in, fades in place under reduced motion, and shows one joined label when the handles are close.
- `#main` no longer pads the top safe area; each page owns it, so its sticky bar covers the status bar. Later screens must do the same.
- Hono's compress gzips API responses over 1 KB (a small middleware sets Content-Length on API JSON so the threshold works) and the log's ETag is always weak. Vite's dev server proxies `/api` and `/manifest.webmanifest` to the Hono server (`SHYLOG_API_ORIGIN`).
- Browser tests run on two seeded stacks: read-only tests on one, `@writes` tests one at a time on the other, undoing their change in a `restore` fixture. `console.spec.ts` fails on any console warning or error, uncaught exception or failed request. Ports move with `E2E_WEB_PORT` and `E2E_API_PORT`.
- A draft or edit naming an entity the server never had is now told it "isn't on the server"; "was deleted" is kept for real deletions.

Deferred, or to watch:

- Milestone 9: the Profile card shows the sparkline as a stand-in until the chart replaces it. The card sparklines' depth scale is the chart's minimum (deepest + 3 m, at least 30 m) without tick rounding; switch them to the chart's axis then.
- Milestone 11: the detail treats a deleted dive as not found; Recently deleted will need to open one.
- Milestone 18: until the service worker precaches, a cold launch's first tap on a card may wait on the network for the detail chunk.
- The no-profile copy follows the spec's synced-dive wording; the board's text is the draft variant ("once this dive has synced"), for milestone 18.
- The Content-Length middleware copies each API JSON body once; fine at this size.
- `readCards` still selects `hash` without a schema check, so a database left at schema 1 by a failed integrity check can't serve `/api/log` (from milestone 6; the new sample columns already handle it).
- Carried over from milestone 7: bump Node 24.22.1, the base image digest and Tailscale 1.104.2 after 23 October; a sidecar Docker restarts on its own leaves the app in a dead namespace; `VACUUM INTO` blocks briefly at midnight; the nightly job writes the UDDF export in milestone 13; card images by hash in milestone 12; a re-uploaded draft is applied as a patch (milestone 10 or 18); a hand dive at Nitrox no keeps air on import (milestone 16); the derived pass reads every dive's samples on every write.
- Carried over from earlier: `cnsWithCarryOver` and `surfaceInterval` parse and sort per call; iOS apple-touch PNGs in milestone 18; UDDF `surfacepressure` is not stored; coverage over the server alone fails core's threshold; check the native switch haptic on a phone (milestone 10); the server's and web's `test` scripts still use `--project`; site coordinates are left out; the import types are placeholders until milestone 15; run Vite once after adding a route before `tsc -b`; `test:xsd` points at a script milestone 13 writes; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes.

## Milestone 9: Profile chart

**Goal**: the dive detail draws the computer's time series with Subsurface's points, axes, ticks, speed colours, labelled peaks, events and the MOD line, as a lazy-loaded chunk with a table alternative.

**Implements**: Profile chart (all subsections), Screens (Dive detail: alarms list, differs banner slot), Statistics (second paragraph: lazy chart chunk), decision D8. Screens: `DiveDetailHifi` Profile card with the Lane temperature option and Ascent rate colour, Alarms list.

**Touches**: `packages/core/src/calc/` (`axes.ts`, `ticks.ts`, `labels.ts` beside the existing `chartPoints` and `verticalSpeeds`, with Subsurface's tick and peak code added to the differential test in `packages/core/test/reference/`), `apps/web/src/chart/` (lazy chunk: `ProfileChart.tsx` on Recharts, `TemperatureLane.tsx`, `EventBands.tsx`, `ModLine.tsx`, `Crosshair.tsx`, `ProfileTable.tsx`), `apps/web/src/data/samples.ts` (fetch and cache samples in Dexie), tests.

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

- [x] Sample fetch and Dexie cache
- [x] Chart points, interpolation, event points
- [x] Axis ranges and tick rules
- [x] Speed colouring and lookback
- [x] Labelled peaks and temperature labels
- [x] Temperature lane, event bands with labels, MOD line, crosshair
- [x] Alarms list under the chart
- [x] Table alternative
- [x] Prefetch of samples and the chart chunk on intent, fixed-height Profile card with fade-in
- [x] Tests and screenshots listed above

**Notes for the next session** (written 26 October 2026, branch `feat/profile-chart`, on `main`)

Still to do on the owner's phone: time from tapping a card to the chart, and whether a cached dive flashes the skeleton before the chart. Also check, on iOS:

- that `touch-action: pan-y` on the chart lets a vertical flick scroll the page, while a tap or a sideways drag (even one that drifts) moves the crosshair;
- whether a long press selects or calls out anything, and whether a grey tap flash shows on the chart or the alarm rows;
- that the 10 px labels and their halos read outdoors, in both themes;
- whether scrubbing a long, dense dive drops frames, or the 150 ms fade-in hitches.

The tap-to-content time and the Milestone 8 phone checks below are still open.

Measured: the chart chunk (Recharts and the chart) is 352 kB, 103 kB gzipped, and loads only on a dive's detail; the Log's main chunk is 216 kB, 68 kB gzipped. The dev page's fixtures are left out of production builds.

Decisions taken while building:

- The axis, tick and label rules are in core (`calc/ticks.ts`, `axes.ts`, `labels.ts`), ported from `updateTicks`/`sensibleInterval`, `DiveProfileItem::replot` and `DiveTemperatureItem::replot`, and checked against C++ copies in the differential test, with edge generators for the 2 m and 0.4 °C boundaries. Two departures: no temperature label from a point cut against an entry with no temperature (Subsurface reads it as 0 K), and Subsurface's end-of-dive temperature label is never drawn, as in Subsurface, whose test compares a time with 200,000 mK. On the left, the peak walk takes the deepest point before the one that crossed the 2 m mark, as Subsurface's range does.
- Label sizes are constants (`chart/layout.ts`: 12 px high, 18 and 28 px wide), so at 390 px dive 63's axis is 40 m in 10 m steps; the acceptance's 36 m is for about 10 labels and is tested that way.
- After the owner's look on the phone, the detail chart's axes are Subsurface's zoomed plot (no 30 m or 30 min floor; time at least 30 s), so a 10 m or 3 min dive fills the chart; the acceptance's 30 m and 30 min cases are tested with the default. The Log's sparklines keep the 30 m floor (`chartDepthAxis` with `zoomed: false`). The depth labels sit in a 30 px gutter left of the plot, event markers are icons alone, centred on their drawn band, with a 3 px gap above the plot, each temperature is labelled only the first time, and m:ss tick labels round their seconds. The loading skeleton sketches every section at its final size.
- The crosshair rests on the deepest point, and a tap or sideways drag moves it while a vertical swipe scrolls (SPEC, Profile chart). Every event keeps its icon, so alarms under 14 px apart overlap.
- The chart is Recharts 3.10.1 through shadcn's chart component, not the 3.8.0 shadcn pins (its reselect 5.1.1 fails the trust policy), so `chart.tsx` was written from the CLI's `view` output. Recharts' accessibility layer is off; the sr-only table is the alternative. The crosshair is drawn in its own SVG layers (`chart/crosshair.tsx`) over the charts' scales, so scrubbing doesn't redraw Recharts.
- Colours use the base tokens (`--speed-*`, `--warn`, `--primary`): `@theme inline` emits no `--color-*` variables, so `var(--color-…)` in SVG resolved to nothing. The readout marks a Moderate or faster rate with a dot in the band's colour and keeps the text readable, since lime and yellow fail contrast on white.
- Samples are cached in Dexie (`profiles`, schema version 2) under a digest of the sparkline, alarm count and SAC's sample figures; a sync drops the copies of dives the log no longer has. One promise per dive, marked with its outcome for React's `use()`, keeps the 50 most recent in memory. A failed load stays failed until Try again or a fresh visit, as a re-render would otherwise loop; a chart that fails to draw says so without Try again. `chart/load.tsx` holds the lazy chunk, because the router's code splitting can't share a reassigned module variable with the route file.
- The Profile card is `components/profile-card.tsx`, also used by the dev-only `/dev/profile` page (Demo, Worst, Cold, One and Loading states), which feeds worst-case profiles through `primeProfile`.

Deferred, or to watch:

- The digest can't see a re-import that changes nothing it covers; a samples revision from the server would be exact (milestone 16).
- The Change pairing sparkline (milestone 17) should use `chartDepthAxis` like the Log's.
- React logs a caught profile failure to the console in development; `console.spec.ts` never hits one.
- `apps/web/.tanstack/tmp` is the router plugin's scratch folder and is untracked; ignore it in git if it keeps appearing.
- Carried over from milestone 8: on the phone, tap-to-content time, the drawer overlay's blur cost during momentum scroll, edge-swipe back in the installed app, the month line handing over, the keyboard with the sticky search focused, swipe-to-dismiss against dragging the slider, the top safe-area inset in standalone mode, and cards flashing their pressed tint when a scroll starts on them. Milestone 11: the detail treats a deleted dive as not found. Milestone 18: a cold launch's first tap may wait on the network for the detail and chart chunks until the service worker precaches; the no-profile copy is the synced-dive wording. The Content-Length middleware copies each API JSON body once; `readCards` selects `hash` without a schema check.
- Carried over from milestone 7: bump Node 24.22.1, the base image digest and Tailscale 1.104.2 after 23 October; a sidecar Docker restarts on its own leaves the app in a dead namespace; `VACUUM INTO` blocks briefly at midnight; the nightly job writes the UDDF export in milestone 13; card images by hash in milestone 12; a re-uploaded draft is applied as a patch (milestone 10 or 18); a hand dive at Nitrox no keeps air on import (milestone 16); the derived pass reads every dive's samples on every write.
- Carried over from earlier: `cnsWithCarryOver` and `surfaceInterval` parse and sort per call; iOS apple-touch PNGs in milestone 18; UDDF `surfacepressure` is not stored; coverage over the server alone fails core's threshold; check the native switch haptic on a phone (milestone 10); the server's and web's `test` scripts still use `--project`; site coordinates are left out; the import types are placeholders until milestone 15; run Vite once after adding a route before `tsc -b`; `test:xsd` points at a script milestone 13 writes; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes.

## Milestone 10: Editing, the dive form and pickers

**Goal**: a dive can be added or edited on the phone with every v1 field, new dives are saved as drafts in Dexie and uploaded at once, and edits to synced dives go through `PATCH`.

**Implements**: v1 fields (both tables, new-dive defaults), Screens (Add or edit, Site picker), Mobile rules (native pickers, inputmode rules, comma decimals), Conflict rules (hand beats computer, in the form), For a matched dive (adopt and dismiss), Operations and offline sync (Flow steps 1 and 3 to 6 without retry), decisions D6, D13, D14, D23. Screens: `EditDiveHifi` (plus the Training fields, native date and time inputs and the Ignore this dive switch from NOTES), `SitePickerHifi` (with a country list), the people and dive-centre token inputs, a trip picker and the option sheets for Type, Entry, Current, Surge, Workload, Thermal comfort (no board; shadcn Select or Drawer in the board's row style).

**Touches**: `apps/web/src/routes/dive/edit/` (form sections, calculated block, Copy from last dive), `apps/web/src/components/pickers/` (SitePicker with create view, CountrySelect from the ISO list, PeopleInput, DiveCentreInput, TripPicker, OptionSheet), `apps/web/src/data/drafts.ts` (draft and queued ops in one Dexie transaction, rewrite on edit, remove on delete), `apps/web/src/data/upload.ts` (one draft per request, oldest first, drop on accept), `apps/web/src/data/edits.ts` (PATCH with only changed fields, keep values and offer retry on failure), tests.

**Acceptance**

- `drafts.test.ts` (fake-indexeddb): saving a new dive writes the dive, its `upsertDive` op and an `upsertEntity` op for a new site in one transaction; editing the draft rewrites the ops with new op ids; deleting removes them; a rejected draft keeps its reason; accepted ops are dropped; the queue has its own schema version.
- `form.test.ts`: the free-text field is labelled "General" under the "Notes" heading (D22); computer and calculated values render in the normal text colour, with only the marker and reset affordance of D14; required fields are date, time, site, duration, max depth; a comma decimal parses; training agency and course are shown only for Training and saved only then; visibility is metres or a rating; Nitrox off saves no oxygen; the calculated block shows SAC, MOD and max PO₂ live (dive 63's values once its pressures are typed) and highlights max PO₂ over the setting; new-dive defaults fill in and count as hand values; date is prefilled with today and shown as text until tapped; start time is empty and tapping it fills in 09:00; Copy from last dive fills the listed fields and leaves number, date and time, depths, duration, pressures, temperatures, animals and notes; the Ignore this dive switch is off on a new dive, whatever the defaults or the copied dive, and turning it on for a synced dive sends `ignored` in the `PATCH` (D23).
- `adopt.test.ts`: a field with a differing computer value shows the ✓/✕ group; ✓ adopts and marks it from the computer; ✕ dismisses and hides the group; a computer-filled field shows the marker and gains a reset once edited (D14); the detail's banner count matches the number of undismissed differences.
- `sitepicker.test.ts`: "long beach " flags the existing Long Beach in South Africa with "Use it" and not the one in Vietnam; the country is picked from the ISO list; water type defaults by body of water and can be overridden; regions are offered from existing ones in that country as you type, and "sodwana " resolves to the existing Sodwana region on save (D22).
- `edit.spec.ts` (Playwright): add a dive with a new site and buddy, see it uploaded and numbered; edit a seeded dive's notes and see the version change; a save with the server stopped keeps the form values and shows "Try again".
- `form-autosave.test.ts`: the form's unsaved values are written to Dexie as you type (debounced), one per dive being edited or one for a new dive, and restored when the form reopens, since iOS often kills a backgrounded home-screen app mid-entry; save and discard clear it. It is not a draft: it never uploads, gets no ops and has no number.
- Screenshots of the form (new and existing), the site picker (browse, search, create, duplicate) at 390 px against the boards.

**Not in this milestone**: deleting from the form (milestone 11), offline behaviour beyond a failed save (milestone 18), the profile banner's import side.

- [x] Draft store and upload path
- [x] Edit path with retry
- [x] Form sections with native inputs, inputmode rules, comma decimals
- [x] Calculated block
- [x] Adopt, dismiss, marker and reset
- [x] Site picker with country list, region reuse, water type
- [x] People, dive-centre and trip pickers, option sheets
- [x] Copy from last dive, new-dive defaults, Training fields, Ignore this dive switch
- [x] Autosave of the unsaved form, restored on reopen
- [x] Tests and screenshots listed above

**Notes for the next session** (written 27 October 2026, branch `feat/dive-form`)

Still to do on the owner's phone:

- the native `<input type="checkbox" switch>` (Nitrox, Ignore this dive): that Safari draws its own switch, with the haptic, at the board's size and in cyan-400 in dark mode, and that its colour fading on the way off matches a switch in the Settings app;
- the invisible date and time inputs over their text: that a tap anywhere on the row opens the iOS picker, the time picker starts at 09:00, and VoiceOver reads and opens them;
- the names sheet: that the keyboard rises with it (its field takes focus as it mounts, inside the row's tap, since iOS ignores a later `initialFocus` and a hidden stand-in didn't work either), that the chip area scrolls with the keyboard up, and that every sheet's last rows scroll above the keyboard (`--keyboard`, from `visualViewport`);
- whether the keyboard pushes the form's sticky bar off screen when a low field is focused;
- swipe-to-dismiss from a scrolled list;
- the segmented controls' and tags' haptic tick (`lib/haptic.tsx`): iOS has no Vibration API and stopped ticking for a switch clicked from script, so a transparent label over each option hands the real tap to a hidden native switch, an undocumented Safari behaviour that a later iOS may drop; check it ticks on the phone and that scrolling from an option still scrolls;
- the segmented controls' 300 ms slide, and the month line under the Log's bar straight after a swipe back from a dive.

Decisions taken while building:

- Every picker is a bottom sheet (D29). The site picker is a full-height sheet whose New site form pushes its Country (recent, then A to Z, accent-folded search) and Body of water lists inside it, never a sheet on a sheet; a new site's country starts as the last dive's. While a new site is being filled in, swipe, Escape and a tap outside don't close it. Region suggestions sit under the field, with "New region in …" as a caption.
- Buddies, dive professionals and the dive centre are rows ("Sam Naidoo + 2") opening a full-height sheet like Calendar's Add Invitees: chips, the field on its own line, people used most recently first (by their latest dive in that role), matches and Add. Nobody is offered for both roles, names are saved as typed with `autocapitalize="words"`, and Return picks only an exact match, otherwise adds the typed name.
- Computer differences (D14) sit on a line under each field, the two temperatures sharing one, and compare at display precision, so a hand 32.7 against the computer's 32.66 is not a difference. Typing over an adopted or kept value makes it typed again.
- The form shows numbers to one decimal; untouched fields are never sent, and the calculated block uses the stored values for them. Pressures parse as decimals (bar), on the number pad. The surface interval is picked in a sheet on hours and minutes wheels (owner's choice in review, over a timer-style field and the two boxes); opening it or choosing Calculated never overrides the worked-out figure, and a touch on a wheel picks by hand at once.
- Cancel asks (Discard changes / Keep editing) when anything was typed. The form covers the tab bar and, from md: up, keeps a centred phone-like width.
- Drafts live in their own Dexie database, `shylog-queue` (version 1: drafts, ops, meta with the device id, forms for autosave). An accepted draft is dropped only once the fetched log holds its dive; a sync that reaches the server uploads any drafts still waiting; nothing uploads to a server on a newer schema. A draft carries an upsertEntity for any entity it uses that only another draft created. The new-dive autosave keeps the dive's id, so a form reopened after the draft was saved rewrites that draft.
- An edit captures the saved values when the form opens (and keeps them with the autosave), so a sync while it's open, or a restored form, never sends the server's newer values back as hand edits.
- The profile chart and the Log's sparkline are drawn to the computer's max depth when a hand value replaced it, the depth gutter widens for 3-digit labels, and the time axis's "min" moved to the first label.
- Figures past what any dive can reach are refused by core's schema (Limits under v1 fields in the spec), chosen with the owner: 350 m, 24 h, a 48 h interval override, 300 bar with the end no higher than the start, 20 L, 40 kg, −3 to 40 °C and 150 m of visibility. The form shows the schema's message under the field.
- From the owner's review of the PR: every full-height sheet stays full height, since each opens the keyboard; sheets dim what is behind them with no blur; every sheet title is shadcn's default (centred, 16 px medium); the segmented thumb slides in 300 ms on the drawer curve, as 200 ms ease-out read as a snap; the dive bar takes its line at the first pixel of scroll again.
- iOS's tap highlight is off app-wide (`index.css`), so every tappable row and small button has its own pressed state; buttons and list options can't be text-selected.
- No component-testing library: the form tests render with `react-dom` and React's `act` (`dive/form/testing.tsx`). The plan's `form.test.ts` is `form.test.tsx`; `adopt.test.tsx` and `sitepicker.test.tsx` likewise. The board renderer used for comparisons is in the session's scratchpad, not the repo.

Deferred, or to watch:

- The e2e `@writes` test that adds a dive leaves its new site and buddy on the writes stack (deleted dives still count as uses, so they can't be deleted).
- `prefetch.spec.ts`'s "draws a kept dive's chart" timed out once under the full parallel run (46 profiles in 5 s) and passed alone.
- Pressures stay on the number pad (NOTES), so a fractional imported pressure can't be retyped exactly.
- Milestone 18: the outline, cloud-off icon and provisional number on draft cards, retry on reconnect, and the offline notes; drafts show in the Log meanwhile, unmarked. Milestone 11: deleting from the form.
- Carried over from milestone 9: on the phone, tap-to-content time, a cached dive flashing a skeleton, `touch-action: pan-y` on the chart, long press on the chart and alarm rows, the 10 px labels outdoors, scrubbing a dense dive. Other event types' rows (milestone 14). The profile digest can't see a re-import that changes nothing it covers (milestone 16). The Change pairing sparkline should use `chartDepthAxis` (milestone 17). React logs a caught profile failure in development.
- Carried over from milestone 8: on the phone, edge-swipe back in the installed app, the month line handing over, the keyboard with the sticky search focused, swipe-to-dismiss against the slider, the top safe-area inset in standalone mode, cards flashing their pressed tint when a scroll starts on them. Milestone 11: the detail treats a deleted dive as not found. Milestone 18: a cold launch's first tap may wait on the network for the detail and chart chunks; the no-profile copy is the synced-dive wording. The Content-Length middleware copies each API JSON body once; `readCards` selects `hash` without a schema check.
- Carried over from milestone 7: bump Node 24.22.1, the base image digest and Tailscale 1.104.2 after 23 October; a sidecar Docker restarts on its own leaves the app in a dead namespace; `VACUUM INTO` blocks briefly at midnight; the nightly job writes the UDDF export in milestone 13; card images by hash in milestone 12; a hand dive at Nitrox no keeps air on import (milestone 16); the derived pass reads every dive's samples on every write.
- Carried over from earlier: `cnsWithCarryOver` and `surfaceInterval` parse and sort per call; iOS apple-touch PNGs in milestone 18; UDDF `surfacepressure` is not stored; coverage over the server alone fails core's threshold; the server's and web's `test` scripts still use `--project`; site coordinates are left out; the import types are placeholders until milestone 15; run Vite once after adding a route before `tsc -b`; `test:xsd` points at a script milestone 13 writes; keep `index.html`'s theme script in step with `ThemeProvider` (milestone 11); raise `minimumReleaseAge` to seven days once that costs no downgrades; shard Playwright only when it takes minutes.

## Milestone 11: Editing, delete and restore, You, entities

**Goal**: dives can be deleted and restored, the You tab shows its sections with working values, and sites, regions, people, dive centres and trips can be browsed, renamed, merged and deleted.

**Implements**: Rules for edits, Screens (You, Sites people and trips, Recently deleted), Mobile rules (You shows last sync), Backups (item 3 and 6 as UI, download rows wired in milestone 13), decisions D6, D7, D20, D30. Screens: `SettingsHifi` as You (all sections but offline storage; Certifications row disabled until milestone 12, Download rows until milestone 13; Sync card static "All synced" until milestone 18), `EntitiesHifi` (plus Regions, each kind opened from its You row with no tabs), `EntityDetailHifi` (with Save, D7), `RecentlyDeletedHifi` (with the re-import note), `DiveDetailHifi` delete sheet and deleted state.

**Touches**: `apps/web/src/routes/you/` (sections, You, Preferences, Defaults with the form's controls, Your log, Sites people and trips, This phone with appearance, About), `apps/web/src/routes/entities/` (list with tabs and search, duplicate suggestions, detail with figures, Save, merge sheet, delete), `apps/web/src/routes/deleted/`, `apps/web/src/data/entities.ts`, `apps/web/src/theme.ts` (system, light, dark), tests.

**Acceptance**

- `delete.spec.ts`: deleting a synced dive shows the sheet, moves it to Recently deleted grouped by "Deleted today", the detail shows "Not in your log, stats or export" with Restore, restoring shows the toast with a link and the dive gets its number back; deleting a draft removes it for good with the draft wording.
- `entities.test.ts`: duplicate suggestions flag "2 Mile Reef" for "Two Mile Reef" and "Sam N" for "Sam Naidoo" (rule: number words, initials and normalised prefixes); person figures are dives together, as buddy and buddy since (D20); site figures are dives, deepest, last dive; every entity figure leaves out ignored dives (D23); trip dates come from its dives; delete is disabled with the explanation when used, counting deleted dives.
- `entities.spec.ts`: rename a site with Save; a colliding rename shows the error with "Merge instead"; merge moves the dives and the merged name disappears; the Regions tab lists regions with their sites count.
- `you.spec.ts`: diver name and max PO₂ save as their field is left, and a failed save puts the saved value back; new-dive defaults use the form's controls and fill a new dive; appearance override applies at once; About shows version and `TS_HOSTNAME`; the Your log dive count includes ignored dives.
- Screenshots of You, each entities tab, an entity detail with the merge sheet, and Recently deleted at 390 px against the boards.

**Not in this milestone**: cards (milestone 12), downloads and the export alert (milestone 13), sync states (milestone 18).

- [x] Delete sheet, deleted state, Recently deleted, restore toast
- [x] You sections with Save
- [x] Entities list with tabs, search, duplicate suggestions
- [x] Entity detail with figures, Save, merge, delete
- [x] Appearance override
- [x] Tests and screenshots listed above

**Notes for the next session** (written 29 October 2026, branch `feat/you-entities-deleted`)

Still to do on the owner's phone:

- the full-screen profile's entrance and the Log count's roll from a real tap: both now start a frame after their render, as headless WebKit skipped a transition begun inside the tap's long task; check they run from the start;
- the deleted dive's banner folding away on Restore while the profile card relayouts, and the entity detail's first "All N dives" reveal with about 50 rows;
- the restore toast above the tab bar and the home bar, its View link, and Sonner's swipe to dismiss;
- the native switch and segmented controls on the You tab (Nitrox, Appearance), and the Save line easing open under a card as the keyboard is up.

Decisions taken while building:

- The fourth tab is You with a scuba mask (D30); Gear moved to the scuba tank so one icon means one thing. `/settings` redirects to `/you`. About's version is the image's commit (`VITE_REVISION`, a Docker build argument CI fills; `dev` locally) and its server `TS_HOSTNAME` from `/api/health`.
- Sections with fields get Save and Cancel under their card, easing open on the first change; an entity detail's Save is in its bar. Each save sends only what changed (maximum PO₂ in Preferences and the new-dive defaults save apart, so neither puts back another phone's change), keeps anything typed while it saves, and shows defaults at their stored precision.
- The entity list's five tabs are words only (icons didn't fit at 390 px). A region's detail shows dives, sites and last dive; on a site or dive centre the region is picked, not typed (D6). Likely duplicates read "share a prefix" as one name starting with the whole other (spec updated); only a letter is an initial; sites are suggested within a country but can be merged across countries (regions only within one). Entities only a draft has created are listed but can't be renamed, merged or deleted until they upload, and a trip a draft uses can't be deleted.
- Dive lists on an entity show ignored dives too (the figures still leave them out), three then 50 at a time; Recently deleted pages 50 at a time and groups by today, yesterday and month. "Used by" names dives in Recently deleted apart.
- A merge or delete leaves its screen as soon as the server has it (`commit` with `settle: false`), so no "Not found" flashes. A draft deleted while its upload was in flight is deleted on the server too.
- "Last sync" lives in its own store (`data/last-sync.ts`), so the five-minute check doesn't re-render every screen; `/api/health` is asked again after each sync.
- Every new sheet keeps shadcn's centred 16 px title, as the form's do. Delete sheets' dark CTA is red-600 for contrast. The restore toast's Sonner styles need `!important`, as Sonner's CSS isn't layered.
- Motion added on request: the Log count rolls its changed digits (`components/rolling-number.tsx`), the full-screen profile eases in, and the restore fold on the detail; and from find-animation-opportunities: the Save line, a restored card folding away, and each batch of an entity's dives easing open.

Deferred, or to watch:

- Milestone 18: offline guards on the synced-data controls (Delete, Restore, Save, merge) with the "needs a connection" notes; meanwhile a request offline fails with "Couldn’t reach Shylog". The sync card's other states and the drafts row.
- Milestone 12: the Certifications row in the diver card. Milestone 13: the Download rows and the export alert. Milestone 18: the Offline storage row.
- The Log count's width snaps when a place is added or dropped (iOS eases it); a group heading in Recently deleted snaps away after its last card folds.
- `log.spec.ts`'s "scrolls the count away" failed once in WebKit under the parallel run and passed three times alone.
- Carried over from milestone 10: the e2e `@writes` uploads leave their sites and buddies, and their soft-deleted dives sit in Recently deleted for the rest of the run (`delete.spec.ts` now finds its own dive by name); `prefetch.spec.ts` timing; pressures on the number pad.
- Carried over from earlier milestones: everything under milestone 10's "Deferred, or to watch" not done here (the iOS checks, Node and Tailscale bumps, the derived pass reading every dive's samples, `minimumReleaseAge` to seven days, sharding Playwright).

## Milestone 12: Certification cards

**Goal**: certification cards can be added, viewed full screen, edited, reordered and deleted, and their images are cached on the phone.

**Implements**: Screens (Certifications), Client data (card images cached), Server endpoints from milestone 6, decisions D31 and D32. Screens: `CertsHifi` (list, empty, viewer, add, edit).

**Touches**: `apps/web/src/routes/you/certifications/` (list, viewer with pinch zoom and the Wake Lock API where available, add with one-card-or-separate choice, edit with reorder), `apps/web/src/data/cards.ts` (fetch images with the `X-Shylog` header into Dexie blobs, object URLs for display), tests.

**Acceptance**

- `cards.test.ts`: images fetched once are served from Dexie afterwards; a card deleted on the server is removed locally on the next log sync.
- `certs.spec.ts`: add two images as one card with two pages, swipe between them, reorder, rename, delete; add two images as separate cards; the viewer keeps the screen on where the API exists and says so in the hint.
- Screenshots of list, viewer and add at 390 px against `CertsHifi`.

**Not in this milestone**: offline disabling of add, edit and delete (milestone 18).

- [x] Card list and empty state
- [x] Viewer with pinch zoom, dots, Wake Lock
- [x] Add and edit with the one-or-separate choice and reorder
- [x] Image cache in Dexie
- [x] Tests and screenshots listed above

**Notes for the next session** (written 30 October 2026, branch `feat/certification-cards`)

Still to do on the owner's phone:

- the viewer's gestures: a flick between pages, tapping and sliding along the page dots, pinch about the fingers and the snap back from past 4x or below 1x, a pan with momentum, catching a page mid-spring, and a call or the home bar taking a gesture (pointercancel) part-way; the zoomed page should be sharp once it stops;
- the long press that lifts a page in Edit card: that a plain swipe still scrolls the strip, the lift needs no second try, and nothing stays lifted after the system takes the touch;
- the photo picker from the add button (iOS turns HEIC into JPEG for the PNG, JPEG and WebP filter), a HEIC picked from Files becoming a JPEG upright, and the screen staying on in the viewer, with the hint saying so only while it does (Low Power Mode refuses the lock);
- the long press that lifts a row in the Certifications list, and that releasing it doesn't open the card;
- a card opened with no signal after a sync, never opened before on that phone.

Decisions taken while building:

- D32: the first three cards as tiles on You (the owner picked tiles over rows and a wallet strip), in the owner's order: new cards first, rows moved by a long press, saved whole through `PUT /api/cards/order`, which refuses an order that doesn't name every card once.
- D31: cards under You at `/you/certifications`, the viewer a child route portalled over the list (as the full-screen profile is), the add button straight to the photo picker, New and Edit card full-height sheets, long-press reorder, Motion for the gestures, and every page downloaded after each sync.
- Images are kept in Dexie as `cardImages`, keyed by card and hash (schema version 4, whose upgrade makes the next sync fetch the whole log so cards get their place in the list). A page is fetched with `?v=<hash>`; the viewer and the download share a fetch; a saved page is kept under the hash the server will give it (the first 16 hex digits of its SHA-256) and held from pruning for ten minutes by a `heldUntil` on its row, which every tab's sync reads, so a sync whose log predates the save doesn't drop it. Object URLs are made once per page and forgotten, not revoked, once no card names them. A full disk stops the download for good, as for profiles.
- Card saving and deleting live in `data/card-edits.ts`, apart from `data/cards.ts`, which the sync imports, so there is no import cycle through `commit`. The viewer and the full-screen profile share `hooks/use-full-screen.ts` (the app made inert, and the entrance a frame after mount, which only the profile animates; the viewer opens at once). A picked image is known by its first bytes, never its name or the type the browser gives. HEIC or HEIF, which iOS hands over from Files and a computer picks as is, becomes a JPEG through the browser's own decoder (Safari's; Chrome and Firefox refuse it in the sheet), with the long edge kept to 4096 px and its EXIF left behind. Screenshots are PNG and go up untouched. On a desktop the file dialog names `.heic` and `.heif`; a phone's doesn't, or iOS would stop turning Photos' HEIC into JPEG.
- The viewer's motion values write the transforms directly (no motion components), so its chunk carries only Motion's animation code (about 32 KB gzipped); the sheet, with `Reorder`, loads once the viewer is up (so Edit opens at once) or on the press of the list's add button. Ctrl-scroll (a trackpad's pinch) zooms on a desktop, and the arrow keys turn the pages. The viewer has no hint line, as the gestures are the ones the phone's photo viewer uses. The page dots keep the board's 15 px pitch, and the whole strip under them is one 44 px target, as iOS's page control is: a tap either side of the shown dot turns a page, and a slide along it scrubs.
- Separate cards save one at a time, each with its own id kept across a retry, and only the last waits for the log. Leaving a sheet with picked screenshots or edits asks first; delete asks in a sheet.

Deferred, or to watch:

- A very small screenshot shows at its own size in the viewer rather than scaled up, which would blur it.
- Milestone 18: offline guards on add, edit and delete, and the Certifications list's offline note.
- Carried over from milestone 11: everything under its "Deferred, or to watch" still open (the phone checks, the Log count's width snap, `log.spec.ts`'s flaky scroll test in WebKit, the e2e `@writes` leftovers, Node and Tailscale bumps, `minimumReleaseAge` to seven days, sharding Playwright).

## Milestone 13: UDDF export

**Goal**: the whole log is written as valid UDDF nightly and on demand, opens in Subsurface, and the You tab's download and alert rows work.

**Implements**: UDDF export (Data model), Units (export column), v1 fields (export column of both tables), Server (UDDF export), Backups (items 1 and 6), Testing (Schema validation), Screens (Settings Download and alerts), decisions D3, D4.

**Touches**: `apps/server/src/uddf/writer.ts` (owner from settings, divecomputer, sites with geography and the body-of-water element, divebases, buddies, trips, gasdefinitions grouped by fraction, tanks grouped by material and volume, dives in schema order, `<applicationdata><shylog>` under Shylog's namespace, `<surfaceintervalbeforedive>` with `<infinity/>`), `apps/server/src/jobs/nightly.ts` (export after the snapshot, temp file, fsync, re-parse, rename), `apps/server/src/routes/export.ts` (`/api/export/uddf`, `/api/export/snapshot`, `/api/export/run`), `apps/web/src/routes/settings/` (Download rows, export alert with Export now), tests.

**Shape already in use**: the SSI converter (`apps/server/scripts/ssi/convert.ts`) writes `<shylog>` first: namespace `https://github.com/tkabalin/shylog/uddf`, elements named after core's dive fields (`surface`, `maxTemperature`, `trainingCourse`, one `tag` per tag), values as Shylog's keys, temperatures in kelvin. It also writes a site's region in `geography/location` and its ISO code in `address/country`, since the XSD requires both. The writer uses the same shape, or changes the converter with it.

**Acceptance**

- `writer.test.ts`: a log with hand dives on 32.4% and 32% nitrox produces two mixes; two dives with Aluminium 11100 ml share one tank; every id is the Shylog id and the export is byte-identical on two runs with no change; dive 63 maps to `informationbeforedive/datetime` without an offset, `greatestdepth` 32.66, temperatures in kelvin, duration in seconds; the per-dive `<shylog>` block carries surge, surface, weather, rating, max temperature, gear, tags, dive centre and trip id; a dive with no earlier dive writes `<infinity/>`; an ignored dive has no `divenumber` and its `<shylog>` block says it is ignored (D23); a hand value that differs from the computer's goes in the standard element; tags, people and professionals export as the spec says.
- `uddfSchemaErrors` (`apps/server/test/uddf-schema.ts`) finds nothing in the generated export of the seeded log and a hand-only log; it strips `<shylog>` first and accepts `tankdata` with no start pressure, the two failures the spec allows.
- `nightly.test.ts` (extended): the export is written after the snapshot through a temp file and re-parse; a failed export leaves the previous file, logs, and `/api/health` reports it; the next night retries.
- `export.test.ts`: `GET /api/export/uddf` rewrites the file and streams it; `GET /api/export/snapshot` streams a `VACUUM INTO` copy; `POST /api/export/run` rewrites without a body and clears the failure.
- `writer.test.ts` reads every export it makes with `readAsSubsurface` (`apps/server/test/reference/subsurface-uddf.ts`, Subsurface's own stylesheet): every dive comes out with its date, time, depth, duration and mix, sites with name and position, buddies with their names, and multi-paragraph notes whole. The owner opens one real export in Subsurface as a last check (noted in the milestone notes).
- You: the Download rows work, "Last UDDF export" updates, a failed export shows the alert with Export now.

**Not in this milestone**: pass-through of imported standard elements (milestone 16), the queued-ops file (milestone 19).

- [ ] Writer with every field mapping and grouping
- [ ] `<shylog>` application data
- [ ] Nightly export with temp file, fsync, re-parse, rename
- [ ] Export endpoints (D4)
- [x] Vendored XSD (`fixtures/uddf/uddf_v321.xsd`) and `uddfSchemaErrors`, run in CI with the server tests
- [ ] You tab Download rows and export alert
- [x] Subsurface's UDDF import as a test helper, proven on the D4i and Zoop Novo exports
- [ ] Subsurface reads the export (helper in `writer.test.ts`, one manual open)
- [ ] Tests listed above

## Milestone 14: Import, the Suunto reader

**Goal**: the server turns a Subsurface UDDF export from the D4i or Zoop Novo into Shylog dives, samples, events, gases and fingerprints, applying every rule in the spec's D4i section.

**Implements**: Subsurface import (Freedives, What the D4i export contains, The Zoop Novo), Instance configuration (Dive computer module), decisions D9, D10, D11, D12, D33.

**Touches**: `apps/server/src/uddf/reader.ts` (grows the milestone 4 sample reader), `apps/server/src/import/suunto.ts` (module chosen by `<divecomputer><model>`, D4i and Zoop Novo rules, generic fallback), `apps/server/src/import/freedive.ts` (freedives and dives under a minute, D33), `fingerprint.ts`, `fixtures/synthetic/generate.ts` and its outputs (D11), tests.

**Acceptance**

- `reader.test.ts` on the D4i fixture: 72 dives; 26 freedives (fixture 9 to 34 on 28 December 2025, 8 to 26 s, gaps of at most 2 s, no tankdata, no switchmix); 59 ascent pairs stored as 59 events with start and end (dive 3's first pair spans 290 to 311 s), 159 surface events stored and typed; the time-0 switchmix is the dive's gas, never an event; `o2 = 0.21` is air (D9) and 0.32 is Nitrox 32.0%; dive 3's duplicate times merge; dive 6 keeps samples to 502 s with duration 180 s; max depth is `greatestdepth` (dive 63: 32.66 m, deeper than any sample); `averagedepth` is stored as a computer value; temperatures are kelvin converted, carried forward, and min and max come from the samples (D10); `leadquantity` 0, the empty site link, `<notes><para/></notes>`, the dummy divebase and the empty `<divetrip/>` are ignored; datetimes have no offset; a gauge-style dive (no gas, 20 s sampling) is a normal dive, not a freedive.
- `subsurface-import.test.ts` (`apps/server/test/reference/`) keeps passing as the reader grows: each new rule that departs from Subsurface's import (the freedive rule, D33's short dives) is applied to Subsurface's answer there, with a comment, rather than loosening the comparison.
- `fingerprint.test.ts`: the fingerprint is start time on the computer's clock, duration and max depth; equal for the same computer dive in two exports.
- `zoop.test.ts` on the Zoop Novo fixture: 61 dives; `Suunto Zoop Novo` picks the Suunto module with no model-specific rule; 30 freedives (fixture 8 to 37 on 8 December 2025, 4 to 27 s); 8 ascent pairs (dive 61's second spans 3556 to 3571 s) and 140 surface events; dive 61's duplicate times merge; dive 53 keeps samples to 340 s with duration 160 s; dive 15's max depth is 8.15 m from `greatestdepth`, deeper than its 7.64 m deepest sample; dives 42 (20 s) and 54 (4 s) end with no `surface` alarm and are left out as under a minute (D33); dive 54, one sample and no `averagedepth`, gets the fallback average depth when included.
- `generate.test.ts`: the synthetic fixtures are regenerated identically and each contains the case it is for.

**Not in this milestone**: pairing, preview, apply, UI.

- [ ] Reader covering every element and placeholder in the spec's list
- [ ] Suunto module with model selection and generic fallback
- [ ] Freedive rule and the under-a-minute rule (D33)
- [ ] Fingerprints
- [ ] Zoop Novo fixture and rules
- [ ] Synthetic fixture generator
- [ ] Tests listed above

## Milestone 15: Import, preview, clock offsets and pairing

**Goal**: uploading an export produces a stored preview with per-day clock offsets, proposed pairs that pass Subsurface's same-dive test, unpaired and unmatched lists, and freedives, adjustable by day.

**Implements**: Subsurface import (Workflow, Matching and review), Endpoints `POST /api/import`, decision D5 (`GET /api/import/pending`, `PATCH /api/import/:id`, `DELETE /api/import/:id`).

**Touches**: `apps/server/src/import/offset.ts` (per-day estimate rounded to 15 minutes from hand-logged times; the day is the one the dive starts in local site time), `pairing.ts` (closest start on the same day, `likely_same` from core), `preview.ts` (store with the data version, expiry after seven days, override per day), `apps/server/src/routes/import.ts`, tests.

**Acceptance**

- `offset.test.ts`: the synthetic "abroad" fixture (D4i clock 5 hours behind site time) estimates +5:00 for those days and 0:00 at home; a day with no hand dives gets the nearest estimated day's offset; estimates round to 15 minutes; a night dive starting 23:40 belongs to that date.
- `pairing.test.ts`: dive 63 pairs with a hand dive logged at 08:10 for 42 min to 32.7 m and not with one at 08:10 for 20 min; three hand dives on 20 July 2026 pair with fixture 58, 59 and 60 by closest start; a hand dive with no computer dive within the test is listed with the distance to the nearest start; already-fingerprinted dives are skipped; freedives and dives under a minute are never proposed.
- `preview.test.ts`: the preview stores the data version and expires after seven days; `PATCH` with a day offset re-proposes that day only and keeps the override; `DELETE` discards; `GET /api/import/pending` returns the one awaiting review.
- `import-route.test.ts`: `POST /api/import` needs the UDDF content type and a connection, writes nothing to `dives`, and returns the preview in the schema from core.

**Not in this milestone**: apply (milestone 16), UI (milestone 17).

- [ ] Clock-offset estimation per day
- [ ] Pairing with `likely_same`
- [ ] Preview storage, expiry, overrides
- [ ] Routes: upload, pending, patch, delete
- [ ] Tests listed above

## Milestone 16: Import, apply, fingerprints and pass-through export

**Goal**: confirming a preview attaches profiles to paired dives, adds new dives, fingerprints everything seen, stores raw fragments, computes CNS and OTU, and the export passes imported standard elements through.

**Implements**: Subsurface import (For a matched dive, Summary), Server (Imports in chunks), UDDF export (Standard data is passed through), Testing (Pass-through, Sync: imports against hand-logged dives), Endpoint `POST /api/import/:id/apply`, decisions D5, D16 data, D19.

**Touches**: `apps/server/src/import/apply.ts` (re-check against current data, return changed dives, chunks of 50 in one transaction each with a journal entry carrying the payload, idempotent by import id), `field_meta` writes for filled and differing fields, `import_raw`, fingerprints with reasons, `apps/server/src/uddf/passthrough.ts` (standard elements in schema order with remapped links; hand values in standard elements), tests.

**Acceptance**

- `apply.test.ts`: a paired dive keeps every hand value (an ignored dive stays ignored), gets samples and events, fills empty fields as computer values (average depth, min and max temperature), records `computer_value` for each of start time, max depth, average depth, duration and temperatures that differ, by any amount; an added dive carries the computer's values with source computer; a skipped dive gets no fingerprint; a freedive left out gets one with reason `freedive`, and a Zoop Novo dive under a minute one with reason `short`; an included freedive becomes a dive; a second apply with the same import id changes nothing; a 120-dive synthetic export commits in three chunks with three journal entries, and a failure in chunk two leaves chunk one applied and reports it; a hand dive edited after the preview is returned as changed before anything commits; the summary counts match D19.
- `reimport.test.ts`: importing the same export twice skips every dive as already imported; deleting a dive and importing again still skips it.
- `passthrough.test.ts`: import the D4i fixture, export, and compare each dive's standard elements before and after, allowing only remapped ids, hand values and Shylog's own additions to differ; the result has no `uddfSchemaErrors`; `<he>`, alarms and extra sample channels in a synthetic fixture survive in place.
- `sync-import.test.ts`: a hand-logged dive uploaded from a draft, then matched by an import, ends with the same data whether the draft arrived before or after the preview was made.
- `ssi.test.ts`: a file from the SSI converter (its `generatorName`) adds every dive as hand values, with no fingerprint and no clock offset, reading its `<shylog>` block; the D4i fixture imported afterwards pairs with those dives.

**Not in this milestone**: UI (milestone 17).

- [ ] Apply with re-check, chunks, idempotency
- [ ] `field_meta`, fingerprints, `import_raw`
- [ ] CNS and OTU stored from imported samples
- [ ] Pass-through in the export
- [ ] Tests listed above

## Milestone 17: Import, screens

**Goal**: the Import flow on the phone: upload, review with the clock sheet, paired list, change pairing, the changed-since-preview sheet, and the summary with the differing dives.

**Implements**: Screens (Import), Subsurface import (Matching and review, Summary), the dive detail's differs banner on imported data, decisions D5, D16, D19. Screens: `ImportHifi` (Ready, Waiting review, Uploading as indeterminate; the Offline state comes with milestone 18, and until then an upload with no connection fails with "Couldn’t reach Shylog"), `ImportReviewHifi` (Not paired, New dives, Also in this file, Freedives, clock sheet, changed sheet), `PairedHifi`, `ChangePairingHifi` (including other days with the warning), `ImportDoneHifi` (with the list of differing dives, D16).

**Touches**: `apps/web/src/routes/import/` (screens above), `apps/web/src/data/import.ts` (upload, pending, patch, apply, discard), tests.

**Acceptance**

- `review.test.ts`: the computer is named from the preview's model ("your D4i", "your Zoop Novo", "dive computer"); "Already imported" is a count row with no expansion and freedives and dives under a minute are one row each under day headings with their own Include (D21); the CTA total is paired + added + included left-out dives; unticking a new dive counts it as skipped; the clock sheet steps by 15 minutes, shows the pair line, and offers "Use +5:00" or "Reset"; a hand pairing across days or failing the test shows the warning.
- `import.spec.ts` (Playwright): upload the D4i fixture into a log with three hand-logged dives for 20 July 2026, see three pairs, 43 new dives and 26 freedives left out; shift a day's clock and see the pairs re-propose; change one pairing to Don't import; include one freedive; apply; the summary shows the counts and lists the dives that differ; opening one shows the banner and the ✓/✕ groups; the Import screen then shows the last import; uploading the same file again shows everything as already imported.
- Screenshots of the five import screens and the clock sheet at 390 px against the boards.

**Not in this milestone**: the Import screen's Offline state (milestone 18); this closes the Import step.

- [ ] Import screen states
- [ ] Review with sections, clock sheet, changed sheet
- [ ] Paired and Change pairing
- [ ] Done with differing dives
- [ ] Tests and screenshots listed above

## Milestone 18: Offline, service worker, sync states, storage

**Goal**: the app opens with no signal, drafts wait and retry, every sync state is visible, and the phone's storage is protected where it can be.

**Implements**: Operations and offline sync (Flow steps 2 and 7, retry), Client data (service worker), Mobile rules (sync pill, provisional numbers, disabled controls offline), Offline safety and accessibility, Screens (Settings sync card states). Screens: `LogHifi2` sync pill and draft cards, `DiveDetailHifi` offline note and unsynced banner, `SettingsHifi` sync card and storage sheet, `CertsHifi` offline note, `RecentlyDeletedHifi` offline, `SitePickerHifi` offline note, `ImportHifi` Offline state.

**Touches**: `apps/web/vite.config.ts` (vite-plugin-pwa precaching the shell and lazy chunks, manifest served by the server), `apps/web/src/data/sync.ts` (states offline, unreachable, syncing, synced; retry on reconnect and app focus), `apps/web/src/components/SyncPill.tsx`, `UnsyncedBanner.tsx`, `apps/web/src/data/storage.ts` (`navigator.storage.persist()`), `apps/web/src/routes/settings/storage-sheet.tsx`, guards that disable Edit, Delete, Restore, rename, merge, card actions and Import offline, tests.

**Acceptance**

- `sync-states.test.ts`: `navigator.onLine` false gives offline; a failed fetch while online gives server unreachable; an upload in flight gives syncing; an empty queue gives synced and hides the pill; the banner shows the count and the age of the oldest draft.
- `offline.spec.ts` (Playwright with `context.setOffline`): the app loads from the cache with the Log and a dive detail with cached samples; a new dive saved offline shows the outline, cloud-off icon, screen-reader text and a provisional number; back online it uploads and gets its number; a synced dive's Edit and Delete are disabled with the note; a rejected draft shows its reason on the card; the Import screen shows its Offline state and doesn't upload.
- `storage.test.ts`: persist is requested on first launch; the You tab's row shows Protected or the help sheet; the sheet's copy matches the board.
- Screenshots of the pill states, the draft card, the storage sheet and the Import screen's Offline state at 390 px.

**Not in this milestone**: the update flow and queue export (milestone 19).

- [ ] Service worker precache and manifest
- [ ] iOS install details: `apple-mobile-web-app-title` and a status bar style checked on a phone in both themes (`black-translucent` puts white text over the light theme's white header). Also check the soft blur iOS draws under the status bar on a cold launch, over the top of the Log's count until the first scroll (seen on the dev server, 24 October 2026)
- [ ] Sync states, retry, pill, banner
- [ ] Draft indicators and provisional numbers
- [ ] Offline guards on synced-data controls
- [ ] Storage persistence and sheet (`navigator.storage.persist()` also protects the Dexie log mirror and sample cache that make the detail instant, not only the drafts)
- [ ] Tests and screenshots listed above

## Milestone 19: Offline, update flow, queue export, end-to-end sync tests

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

## Milestone 20: Statistics, figures and charts

**Goal**: the Statistics screen shows every figure and chart in the spec's table for the chosen year, lazily loaded, cached until the log changes, with the early-days states.

**Implements**: Statistics (table, Records and milestones, Early days, Averages, SAC rate trend), the lazy chunk rule, decision D24. Screens: `StatsHifi` (all cards except Patterns), `StatsEmptyHifi` (2 dives and no dives).

**Touches**: `apps/web/src/stats/` (lazy chunk: `figures.ts`, `charts/` on shadcn charts, `StatsScreen.tsx`, table alternatives), `apps/web/src/stats/cache.ts` (keyed by log version and year), tests.

**Acceptance**

The figures below were worked out before the Import milestones. Milestone 14 grows the seed's sample reader into the full reader, which can change what the seed stores (temperatures from the samples, D10; the computer's average depth), so re-derive them against the seed before writing the tests.

- `figures.test.ts`: on the seeded fixture (46 scuba dives), totals, deepest (dive 54, 42.3 m), longest (dive 50, 72 min), plain-mean average depth and duration, dives per month for 2026 and per year, depth bands (0 to 10, 10 to 18, 18 to 30, over 30), time of day (before 11:00, 11:00 to 14:00, 14:00 to 18:00, after 18:00), water range from min and max fields; average SAC is duration-weighted and drops 0.1 L/min or less; nitrox share and average nitrox oxygen (four of the 46 dives, average 32.3%); marking a dive ignored removes it from every figure and chart (D23).
- `records.test.ts` (D24), all time on the seeded fixture unless stated: coldest dive 72 (12 °C), warmest dive 7 (30 °C, not dive 6, whose maximum is 34 °C on a 3.9 m dive); a tie goes to the earlier dive; total depth descended 759.1 m, worded "You've descended Lion's Head" with "92% of the way to the Burj Khalifa"; synthetic totals for below the first rung (a share of the Leaning Tower of Pisa), exactly on a rung, "twice" and "3 times", and past the last rung; the landmark list is strictly ascending; longest streaks of 6 days (17 to 22 July 2026) and 4 weeks (4 to 25 April 2026), two dives on one day counting once, and a running streak marked as such; anniversary "7 years diving, since 10 February 2019" with the clock at 19 October 2026, the "today" wording on 10 February, months under a year, unchanged by the year filter; an ignored first dive moves the anniversary to the next dive.
- `trend.test.ts`: the rolling average of the last five dives, only dives with a SAC and not ignored, in date order.
- `stats.spec.ts`: the year chip switches every figure; below five dives the screen shows totals, records and the "More after 5 dives" progress; with no dives the empty state and "Log a dive"; each chart has a table alternative; the chunk is separate in `dist`, not loaded on the Log, precached by the service worker and works offline; `pointerdown` on the Stats tab starts loading the chunk (`preload="intent"`), so a tap doesn't wait on it.
- Tap-to-content time for Statistics on the owner's phone, first visit and cached, is recorded in the notes against the performance target.
- Screenshots of Statistics (2026 and all time), the 2-dive and 0-dive states at 390 px against the boards.

**Not in this milestone**: patterns (milestone 21).

- [ ] Figures with the Subsurface averaging rules
- [ ] Records and milestones: coldest and warmest, depth descended against the landmark ladder, day and week streaks, anniversary (D24)
- [ ] Charts: dives per month or year, SAC trend, depth bands, conditions bars, weather and surface, time of day, gas, entry, sites, buddies, regions, tags
- [ ] Early-days and empty states
- [ ] Cache keyed by version and year
- [ ] Tests and screenshots listed above

## Milestone 21: Statistics, patterns

**Goal**: the Patterns section shows the top three findings that clear the bar from the full catalogue, with an All patterns list and a drill-down.

**Implements**: Patterns (Computing, Rule types, Catalogue, The bar, Choosing and showing).

**Touches**: `apps/web/src/stats/patterns/` (`rules/` one file per rule type, `catalogue.ts`, `score.ts`, `wording.ts`, `PatternsCard.tsx`, `AllPatterns.tsx`, `PatternDetail.tsx`), tests with synthetic logs.

**Acceptance**

- `rules.test.ts`: a Difference rule needs five dives per group and finds the best adjacent-level split; a Threshold rule scans whole-number cut-offs and words "4 of 5 dives" when not all match; Change compares with the previous year or the two halves of the log; Trend uses a linear fit; Habit needs 60% over ten dives; Season needs a region and month; Records always qualify; minimum effect sizes per measure as listed; ignored dives never enter a group or a record (D23).
- `score.test.ts`: score is effect over minimum times √(smallest group); ties break by rule id; the top three has at most one per measure and one per field and never a record.
- `wording.test.ts`: describes rather than explains ("is higher in", never "because of"); numbers rounded as elsewhere.
- `patterns.spec.ts`: a seeded log that supports two patterns shows exactly those two; All patterns groups by measure; tapping shows the groups and opens those dives in the Log; with none qualifying the section is hidden.

**Not in this milestone**: new rules beyond the catalogue; this closes the Statistics step and v1.

- [ ] Rule types
- [ ] Catalogue of measures and fields
- [ ] Bar, scoring, selection
- [ ] Wording, All patterns, drill-down to the Log
- [ ] Tests listed above

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

`playwright.config.ts` runs Chromium and WebKit at a 390 × 844 viewport with a `webServer` that starts the server on a temp `SHYLOG_DATA_DIR` with `SHYLOG_DEV_LOGIN` set and seeds the fixture. UDDF schema checks run inside Vitest: `uddfSchemaErrors` in `apps/server/test/uddf-schema.ts` strips `<shylog>` elements, runs `xmllint --noout --schema fixtures/uddf/uddf_v321.xsd` on the XML it is given and drops the one allowed `tankdata` error, so CI installs `libxml2-utils` before the tests.

## Still open

Everything else that was under-specified has been decided and written into the spec. Two items remain, and one is now closed:

1. **UDDF elements for site data**: the exact elements for region, country and body of water are settled against the vendored XSD in milestone 13 and written into the spec then. The `environment` values were checked against the UDDF 3.2.1 documentation in milestone 2 and are in the spec.
2. **Subsurface comparison figures**: recorded on 19 October 2026 and checked in `cns-otu.test.ts` (milestone 3); no longer open.
3. **Sync pill colours**: the wireframe review thread on the Log's sync pill is still open. Milestone 18 builds the pill as drawn until a choice is made.
4. **Landscape on phones** (26 October 2026): the app is close to unusable sideways. Safari's 750 × 340 leaves room for one card under the tab bar and sticky search, and the installed app's 844 × 390 crossed the `md:` width, so the desktop sidebar took 256 px. The sidebar and compact sizes now need a fine pointer (`desk:`, 28 October 2026), so a sideways phone keeps the tab bar and touch sizes. Still deferred: a compact-height layout (a slim rail or short tab bar, search and filters on one row). The full-screen chart (D28) covers the profile meanwhile.
