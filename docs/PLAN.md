# Shylog build plan

This plan turns `docs/SPEC.md` into milestones that each fit one working session. It follows the spec's Build order (scaffold, core, server, deploy, read-only app, editing, UDDF export, import, offline, logging, direct download, statistics) and splits the larger steps. Import and offline were moved ahead of statistics on 1 November 2026, so the app is usable for real logging before the statistics are built, and logging and direct download followed on 11 November 2026, so the Subsurface step goes away sooner and the download's failures are logged from the start. A milestone is done only when typecheck, lint and its tests pass and its acceptance criteria below are met, with evidence shown (test output, screenshots).

Conventions used throughout:

- **Fixture dive numbers** are Subsurface's `divenumber` in `fixtures/subsurface/d4i-2026-10-12.uddf` (1 to 72), not Shylog's. Dive 63 there is the EANx32 dive to 32.66 m on 22 July 2026. Once imported into an empty log with the 26 freedives and four dives under five minutes left out, it would be Shylog dive 33, so tests must look dives up by fixture number or start time, never by Shylog number. Zoop Novo fixture numbers are its own `divenumber` in `fixtures/subsurface/zoop-novo-2026-11-01.uddf` (1 to 61).
- **Icons** follow the hi-fi boards' *Essential* tweak, board by board: an icon is built where that board shows it with icons set to Essential (the `xi` elements not marked `xi2`), and not where the board shows it only with All. The per-screen choices were made in review (for example no country or region icons on site detail, no calendar on Recently deleted or the last-import date, no map icons in Choose site, no water-temperature or gear icons on dive detail, but icons on the Notable animals, Gear and General cards, on Settings' About and entity rows, and on entity list and detail meta lines), so `IconKeyHifi`'s Essential column is a vocabulary, not a per-screen rule. The *Off* and *All* variants are not built. The Icon key is a reference document, not a screen.
- **Separators**: where an icon follows, facts are separated by a gap, never a dot. The " · " dot is used only between plain text, as on the Log card's "Sat 10 · Simon's Town".
- **Design screens** are the boards in `docs/design/hifi/`. The spec wins for behaviour, the board for layout, and `docs/design/NOTES.md` lists the places the boards are wrong. Decisions taken for this plan are listed under Decisions and should be folded into the spec.
- **Scoped checks**: each milestone names the test files it adds. Run those files and the static checks for the milestone rather than the whole suite.
- **Performance target** (added 19 October 2026): a dive's detail and the Statistics screen should feel instant, under about 100 ms from tap to content. Compute is not the bottleneck at Shylog's scale, so the work targets network, rendering and storage. It is measured on the owner's phone and recorded in the milestone notes, not asserted in CI, where timings are too noisy to gate on.

## Decisions taken while planning

These resolve the inconsistencies found between the spec, the boards and the fixture. They were folded into `docs/SPEC.md` and `docs/design/NOTES.md` on 17 October 2026; the table stays as the record the milestones refer to.

| # | Topic | Decision |
| --- | --- | --- |
| D1 | Seed dive before Import exists | The Server milestone adds a dev-only `seed` script with a small UDDF sample reader (dives, samples, alarms, gas) used only for seeding. The Import milestone grows that reader into the full import reader. |
| D2 | Sparklines and alarm counts without samples | `/api/log` carries, per dive, a downsampled depth profile (24 points) and an ascent-alarm count, both stored on the dive row when samples are written. Samples themselves stay on demand. |
| D3 | Export validation | At runtime the export is re-parsed with xmldom and its dive count checked. Full XSD validation runs in CI with `xmllint` against the vendored UDDF 3.2.1 schema. |
| D4 | Export endpoints | `GET /api/export/uddf` builds a fresh export and streams it, leaving `export/dives.uddf` and the last-export time alone (changed 4 November 2026: it used to replace both, but the server's file is the backup copy, and the snapshot download never touched the nightly snapshots either). `GET /api/export/snapshot` streams a `VACUUM INTO` copy. `POST /api/export/run` rewrites the export file without a download, for the "Export now" action on the failed-export alert. |
| D5 | Import review endpoints | `GET /api/import/pending` returns the stored preview. `PATCH /api/import/:id` stores a day's clock-offset override and returns the preview with that day's pairs re-proposed. Pairing, skip and freedive-include choices travel in `POST /api/import/:id/apply`, which re-checks against current data, returns dives changed since the preview before committing, and commits in chunks. `DELETE /api/import/:id` discards a preview. Upload shows an indeterminate "Reading your export" state. |
| D6 | Where entities are created | From the dive form's pickers (site picker, people and dive-centre inputs, trip picker), and trips, dive centres and people also from You together with their first dives (D39). Settings lists, renames, merges and deletes. `PUT /api/entities/:kind/:id` still creates when given a new id. |
| D7 | Saving renames and settings | Entity detail gets an explicit Save action that appears when a field changes, like the Certifications edit screen. A collision shows under the Details card with a "Merge into" row (restyled 6 November 2026, as squeezed into the card under the field it read as a mess). You's sections save as you go instead (changed 30 October 2026): a tap at once, typing as its field is left, and a failed save puts the saved value back, as a Save bar after every tap was an extra step. |
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
| D19 | Freedives in the summary | Counted separately: paired, added, already imported, left out (freedives and dives under five minutes, D33), included (shown when non-zero). The CTA total includes the included ones. |
| D20 | Person figures | "Dives together", "As buddy" and "Buddy since" are kept, derived on the client from the link tables. |
| D21 | Long lists in the import review | "Already imported" is a plain count row that never expands. Freedives are listed as the board draws them: one row per freedive under a day heading, each with its own Include. Dives under five minutes (D33) join the same list, their row saying so. |
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
| D33 | Dives under five minutes (added 1 November 2026, raised from a minute on 6 November 2026) | A computer dive that isn't a freedive but has a `diveduration` under 5 minutes is left out like a freedive: fingerprinted with reason `short`, listed with the freedives with its own Include, and counted with them as left out. Without this the blips would be added by default on every import, as a skipped dive gets no fingerprint. The Zoop Novo export has three (dives 42, 53 and 54) and the D4i four (dives 6, 7, 37 and 40: snorkelling, one that stops at 13 m, the swim back and a weight check), while the shortest real dive in either is 15 minutes. The first cut-off, a minute, caught only the Zoop's two shortest; checking the preview against the owner's log showed the rest. A short dive that passes the same-dive test with a hand-logged dive pairs as usual, so an aborted dive logged by hand still gets its profile. |
| D34 | UDDF export details (added 2 November 2026) | The writer puts a dive's samples back as waypoints and its stored events as `<alarm>`s (`surface` at its time, `ascent` at both ends of a pair), since Shylog models and shows them; pass-through (milestone 16) is left with what Shylog doesn't store. A site with no region writes an empty `geography/location`, which the schema requires. The export is built in one read transaction on the server's own connection rather than a second, read-only one, as better-sqlite3 builds it synchronously. Only a failed nightly export raises the You tab's alert; a failed download or Export now says so on the spot. Trips and dive centres go in `<shylog>` by id and name, as the schema's `divetrip` and `divebase` require data Shylog doesn't have (a rating and trip parts, and a link). |
| D35 | Smoothed water temperature (added 3 November 2026) | The profile's temperature lane draws the water as it was by default, from the dive's own settled readings (see Profile chart in the spec): the water column by depth on a dive with a thermocline, otherwise the settled readings with a change shown only once it holds for 2 minutes. On the fixtures' 73 scuba dives, 70 have settled readings in two or more bands, descent and ascent agree within 1 °C in 157 of 160 bands, and the two computers agree in all 35 bands of the 10 dives both logged. The lane's caption is a menu between Smoothed and Recorded, kept per phone, with a switch under You's This phone. Records and statistics keep the effective minimum. |
| D36 | CSV export (added 4 November 2026, issue #41) | A CSV of the whole log, one row per dive and a column per v1 field, with names in place of links, choice labels, the calculated figures and a JSON profile column, for spreadsheets, since UDDF doesn't open in one and Subsurface drops `<shylog>` (see CSV export in the spec). It is built on the server from the database, not on the phone. `export/dives.csv` is rewritten with `export/dives.uddf` from the same read transaction (nightly, and by Export now), and a failure of either fails the export; the You tab's CSV download, like the UDDF one (D4), writes nothing on the server. You's "Last UDDF export" row becomes "Last export", as it covers both files. |
| D37 | Import rules for every computer (added 6 November 2026) | The import applies one rule set whatever computer the export names: the freedive signs, dives under five minutes (D33), Subsurface's placeholders and the clock-offset estimate. The spec had put them in a Suunto module, with bare generic rules for any other computer, but the placeholders are Subsurface's, so another computer would have recorded 0 kg of weight; and an unknown computer's dive misjudged as a freedive is put right with Include, where a freedive added by mistake and then skipped comes back on every import. Neither Suunto needs a rule of its own, so there is no model switch until one does. |
| D38 | Import previews (added 6 November 2026) | A preview is scratch, not log data: storing, adjusting or discarding it isn't journalled and doesn't change the version, and the restore drill skips `import_previews`, so a restore may lose a pending preview, which is uploaded again. The row keeps the uploaded file, which apply (milestone 16) reads again for samples, sites and `import_raw` fragments, rather than a JSON copy of the read dives that would need a second copy of the XML for the fragments anyway. One preview waits at a time; a new upload replaces it. A dive whose starting gas has helium or under 20.9 % oxygen, which v1 can't hold, is offered as usual but marked, and the review must say it will be stored as air (see Matching and review in the spec). |
| D39 | Putting dives on a trip, dive centre or person from You (added 6 November 2026, issue #46) | You's trips, dive centres and people can be given many dives at once, and a new one can be made there, for tidying the log after an import. A new one is saved only with its first dives, in one `POST /api/entities/:kind/:id/dives` that creates it and edits each dive as a hand edit would, so nothing is saved with no dives and a refused dive leaves nothing half done. The picker ticks and unticks: a dive in another trip or dive centre shows it and moves when ticked, a person is added in the role chosen at the top of the picker (buddy or dive professional), and unticking every dive deletes the entity after a confirmation where a delete is allowed. Sites and regions are left out, as a site is where a dive was, not a grouping. Bulk editing of other fields stays under Later. The write always runs the derived pass, as it saves dives (a person or dive centre change would otherwise drop the calculated surface interval), a resend after the delete writes nothing, and a refused dive is named in the reply. The picker diffs against the ticks it opened with, so a sync while it's open can't untick a dive, and a swipe can't discard ticks once there are changes. |
| D40 | Site for an added dive (added 7 November 2026) | A computer dive added by an import with no site in the export, as every Subsurface export has, goes to one shared "Unknown site" in South Africa (the owner's choice, over guessing from the nearest dive), created on first use. Its site has no `field_meta` row, so the PADI script and the dive form replace it as a value nobody chose. A site another program's file names with no country goes to South Africa the same way. |
| D41 | Reading Shylog's own export (added 7 November 2026) | The round trip is complete: `<shylog>` also carries the site's water type, the dive professionals, the dive centre's region and a hand-set surface interval, and the import reads Shylog's export in full, entities matched by key or created. Standard elements are computer values and `<shylog>` values hand values, since no computer records tags or Ignore this dive, so a restore from UDDF loses only the markers, as the spec promised. |
| D42 | Pass-through (added 7 November 2026) | `import_raw` keeps the dive's element and the mixes it links to. The export writes back the elements Shylog doesn't model, in the schema's order, with mix links remapped (mixes Shylog lacks, such as a trimix switch gas, are added under ids made from their make-up) and other links dropped. The starting gas is always Shylog's, so an unsupported one stays air. |
| D43 | Apply's re-check (added 7 November 2026) | The preview keeps a digest of every hand dive it paired or listed. Apply compares them, and new hand dives on the export's days, before any chunk; a change re-proposes those days and returns the dives, so the review asks again and the next apply proceeds. Chunks are journalled as `importChunk` entries under the import id; a computer dive with a fingerprint is never applied twice, and the finished summary is kept as the last import, which a late retry gets back. The preview has a `revision`, bumped by every re-proposal, which the apply request echoes, so a resent request is asked again rather than applied over the change. |
| D44 | Import screens (added 7 November 2026) | The review's bar gets a Discard action, which asks first, as a waiting preview otherwise stays until a new upload replaces it or it expires. A hand-logged dive under Not paired opens the pairing screen turned round (its day's computer dives and Leave unpaired), as the board's Change pairing is built around one computer dive. Freedives and dives under five minutes share one Left out row in the review, each saying which it is, and the summary counts them as left out. `GET /api/import/pending` also returns the last completed import, with the number of dives the file held and the days they span, for the Import screen. The review's choices are kept per preview revision on the phone, so a reload doesn't lose them. |
| D45 | Comparing the gas (added 7 November 2026, issue #60) | The gas is a compared field, Nitrox and the oxygen percentage as one value. A hand Nitrox no, often only a new dive's starting air, takes the computer's nitrox mix as a computer value (the owner's choice: one tap turns Nitrox off where that was wrong). A hand nitrox mix keeps its oxygen, so analysed decimals are never lost, and is flagged only when its whole per cent differs from the computer's; a hand nitrox mix against the computer's air is kept and flagged. The computer's reading is kept on `oxygen`'s `field_meta` row, 210 for air. |
| D46 | Import review by outcome (added 8 November 2026) | The owner found the review unclear about unpaired dives. Paired leads it as its own card, the import's main outcome, rather than sitting under Also in this file. New dives are headed as from the computer (its watch icon) and unpaired hand-logged dives as the diver's own ("Your dives with no match", the Log's notebook), with a line saying they stay as logged and a gap note that is no longer a warning; the foot bar counts them as unchanged. Paired marks your values with the notebook beside the computer's watch, and a differing start in the warning colour, since the review counts it among the differences. Dives under five minutes are called false starts, new dives use file-plus and already imported dives player-skip-forward. |
| D47 | The Unknown site is locked (added 8 November 2026, issue #69) | Renaming or editing the Unknown site (D40) would split the next import's dives across two sites and give every dive already there one real place, and merging it moves them all to one site. So the server refuses edits, merges either way and deletes of it, a site taking its name and country (before an import has made it too, since that site would become it), and a country change for a region it is in, all in the routes rather than the apply functions so a replayed journal keeps an older edit. It stays recognised by its name and country rather than a stored marker: the key is unique and nothing can now change which row holds it, and a marker would need a migration and a new field in the log for no extra safety. It stays even once empty (the owner's choice, over deleting it then), left out of You's sites list while no dive outside Recently deleted is at it, and the site picker and Copy from last dive never offer it (the owner's choice), as it is a place to leave, not to choose. |
| D48 | Night suggestion (added 8 November 2026, issue #74) | The dive form suggests the Night tag when any part of the dive was in the dark, on new dives and edits (the owner's choices, over "starts after sunset", "mostly in the dark" and new dives only). Sites store no coordinates, so sunset comes from the site's country (the owner's choice, over a fixed 18:00 and over adding site coordinates): `packages/core/src/zones.ts` is generated from tzdata's public-domain `zone.tab` and `zonenow.tab` by `packages/core/scripts/zones.ts`. Zones a country has that keep the same clock today count once (Indiana's eight are New York), and where it has any of `zonenow.tab`'s populous clocks only those count, so Greenland is Nuuk rather than two polar stations. The country takes the sunrise and sunset of the city with the median sunset, on that zone's clocks through `Intl`: one city's pair, since medians taken apart mixed a polar night with daylight. Time zones follow longitude, so the error is mostly latitude: about half an hour across South Africa and the United States. A zone the phone's time zone data lacks (America/Coyhaique, added in 2025, which CI's WebKit refuses) or a date its clocks skipped is left out rather than breaking the form. It is a suggestion only, never saved or applied by itself. |
| D49 | Taking the computer's values in the review (added 8 November 2026) | Adopting each differing value one dive at a time on the form is slow after a big import, when hand-logged depths, times and durations are mostly rough copies of the computer's. Paired gets a switch per compared value that differs on any pair, off by default so the hand-beats-computer rule still holds until the diver says otherwise. It is per value rather than one Use all, as the gas is the one value where the hand one is usually right (a computer left on air). Apply takes them in the import's own transaction and journals them with the chunk, so a replay adopts the same; a taken value that breaks a rule with a hand value goes back to the hand one, flagged. The owner chose the review over the Done screen and per-dive buttons. |
| D50 | New-dive defaults on imported dives (added 8 November 2026) | A dive an import added took nothing from the You tab's defaults, so it had no cylinder material or dive type. Added and included dives now take them (cylinder material and volume, weight, dive type) in the fields their export leaves empty, as hand values, after the computer's, so the computer always wins. The defaults ride in the journalled chunk, so a replay doesn't read settings changed since. Shylog's own export takes none, as it restores the log as it was. The owner's choice. |
| D51 | Downloading from the dive computer (added 8 November 2026) | The server downloads from the D4i or Zoop Novo on its USB cable at the home server, with libdivecomputer's `dctool` built into the image, since no Node binding is maintained. The app container opens the cable itself (a device cgroup rule for USB serial devices and a read-only view of the host's `/dev`), rather than a host service or a sidecar. Both instances get it, each turned on in its env, and each remembers its computer's serial on the first download and refuses another watch, with Forget on You. The read shows how much of the watch has been read, from dctool's progress events, asked for alongside the download rather than streamed (changed 12 November 2026 from indeterminate progress, as a full read takes up to half a minute; the owner's choice). A spike on the server with both computers comes first. The Import screen's prompt is how the owner imagines it, open to suggestions when it is built. The owner's choices. |
| D52 | Dive-number milestones (added 8 November 2026) | The milestone numbers are 40, 50, 60, 75, 100, 250, 500, 750 and 1000: the doors on the way to Divemaster and instructor (PADI and SSI), then SSI's recognition levels, leaving out SSI's 12 and 24, which are specialty ratings rather than doors, and plain round numbers. A milestone save shows a line saying what the number means beside the burst, and Statistics' Records and averages card shows the next milestone. The wording and look are proposed when built. The owner's choices. |
| D53 | Packing checklist (added 8 November 2026) | A packing checklist like the one in PADI's app, but editable. One flat list, rather than sections or several lists as PADI has. The list is stored on the server per instance, so every device shares it and editing needs a connection; ticks stay on the phone only, with a Reset. Where it opens from, its design, its editing and its default items are proposed when built. The owner's choices. |
| D54 | Safety stops (added 8 November 2026, issue #44) | The D4i and Zoop Novo log their safety stop, but Subsurface drops it and its UDDF export has no element for it, so Shylog finds the stop in the depth samples by its own rule (see the spec's Safety stop), with no Subsurface differential test and, at first, no `dctool` calibration (the owner's choice, reversed by D58). It follows the Suunto manuals: dives deeper than 10 m, a 3-minute count in the 3 to 6 m band on the final ascent. The manuals don't say whether the count pauses or resets outside the band; the owner confirmed their D4i pauses, as Suunto's newer computers and Divesoft do, which also gives the fuzziness the issue asked for. A complete stop first ended at the next exit from the band; D58 replaced that, and the endless pause, with stretches. Stops of 1 to 3 minutes are listed as short. Dive detail's Alarms section becomes Events, listing the stop among the alarms in time order, in green when full and grey when short. The chart marks it with a faint green band for its span and a stairs icon beside the alarms' (the owner's pick of the mockups, over the icon alone, a rule along the time axis alone, and the icon with that rule), kept apart from the events and green so it never reads as a warning. The stop is stored on the dive like the sparkline, so the card reserves its row before the samples arrive. Neither export writes it, as it is derived. |
| D55 | Offline (added 9 November 2026) | The sync pill is grey and takes the warning colour only for Can’t reach the server and a draft the server refused, the states the diver must act on (the owner’s choice from mockups of the board’s grey pill, cyan while syncing, and both combined). The spec’s banner of waiting dives is You’s sync card, as `SettingsHifi` draws it, not a strip on the Log. Server unreachable disables the online-only controls as offline does, as `SettingsHifi` treats it. On the owner's review of the PR the pill became a badge on the Log's shyshark, in the accent colour where it was grey, a refused draft's card kept its place line with a warning icon, and every “needs a connection” note gave way to the disabled controls and a small offline icon in the screen's bar. Until milestone 19’s reload offer, a new version waits until every Shylog window has closed and takes over on the next launch, as browsers do by default, so nothing reloads under an open form or sheet (the owner’s choice over reloading on return to the app when no form is open). |
| D56 | Update offer and queue file (added 9 November 2026) | A new version's reload offer is a toast on every tab, as the newer-server one is, held back over the dive form, the import steps and any form or sheet with unsaved edits, so a tap can't drop typed changes (the owner's choice over showing it everywhere or only as a row on You). It waits for the queue as the spec says, and a dismissed offer stays away until the next launch. Save waiting dives to a file writes JSON with each draft's ops as an `/api/ops` body, refused drafts included, so a lost phone's drafts can be sent back with one request each (chosen for the owner). |
| D57 | Fields cleared after a lost reply (added 9 November 2026) | A draft whose upload landed but whose reply was lost, then edited offline, uploads again as an edit of the fields it carries, and the form leaves an emptied field out, so a cleared note or buddy came back. The draft now remembers every field it has held and sends those it has lost as `null`; an edit clears them and a new dive ignores them, so `upsertDive` takes `null` for optional fields as `PATCH` does. Fields the draft never held stay as they are, so a change made on another device between the two uploads survives (the owner's choice over replacing every hand field, which would wipe it, and over leaving the clear to be redone once synced). |
| D58 | Safety stops as stretches (added 9 November 2026, issue #80) | D54's rule failed two ways on real dives. Dive 72 counted 40 s at 5 m, paused through 16 minutes at 8 m, then counted 3.5 minutes before surfacing, so its band spanned 20 minutes for 4:05 held. Dive 54's long stop at about 5 m (it had five ascent alarms, so the D4i probably added a mandatory stop) was cut at its first dip to 6.3 m. A stop is now a stretch of the final ascent in the band: drifts out of it of up to 2 minutes pause it, a longer one ends it, and the stop is the last full stretch, else the longest. The number shown stays the time in the band, not the band's span (the owner's choice), and a long shallow finish counts as one long stop (the owner's choice). Suunto's manuals don't say what the count does outside 3 to 6 m, and the D4i's own log doesn't show it: the owner chose to calibrate on the computer's stop markers, but a raw download of all 93 of its dives (10 November) has none for the recommended stop, only for mandatory ones, which begin at an ascent-rate alarm and end about 30 s after reaching the band, so they say nothing about the 3-minute count. The band runs to 6.4 m and the drift limit is 2 minutes, fitted so every real dive's stop stays full as the owner remembers them (a 6 m edge made dive 67 short). Migration 9 recomputes every stop and widens the stored depth's check to 0 to 10 m, so a later change to the band needs no column change; migration 8 no longer fills the stops, as it would run today's rule against its own 3 to 6 m check. |
| D59 | Profile icons apart (added 13 November 2026, issue #91) | The icons above the profile crowded together at the end of a dive. Every mandatory stop in both watches' downloads (28 of 28) begins on an ascent alarm, so a triangle always stood beside each hand; the stairs hopped past each icon in its way and, off the plot's edge, landed left of the hand over the deep part of the dive; and moved icons sat 2 px apart. The hand now stands for an alarm at its moment, which keeps its band and its Events row (the owner's pick, as recommended). Alarms close together keep their own triangles over their bands even where they overlap (the owner's pick, over one shared triangle), and over a hand too, as a triangle moved aside read as a separate event (the owner's pick). The stairs, the one icon that moves, goes the shortest distance to either side, and moved icons keep 4 px apart. An alarm that would draw under 6 px wide, which every ascent alarm in the fixtures does (1 to 8 s, about 50 s of axis on a phone), is now a line where it began rather than a band widened to 6 px, which read as how long the alarm sounded (the owner's request); a mandatory stop's red line covers the alarm it began on. |
| D60 | The Statistics screen (added 13 November 2026) | The year chip opens the same menu as the Log's year pill, on a phone as with a mouse (the owner's choice, over a bottom sheet), of All time and each year with a dive, newest first, and the screen always opens on All time (the owner's choice, over opening on the current year and over the board's next year on each tap). Early days counts the whole log (the owner's choice): under five dives there is no year chip, as `StatsEmptyHifi` draws it, while a year with few dives in a bigger log still shows its charts. Only the SAC trend is drawn with Recharts through shadcn's chart (the owner's choice): the dives per month or year, the depth bands, the proportion strips and the SAC spread are plain markup or SVG, lighter and closer to the board, each with its table alternative. The layout follows the owner's redesign of `StatsHifi` (a Design canvas, 13 November 2026, answering a design critique on PR #95): Air consumption leads, titled by the trend's change, with its chart cropped to the data, round ticks and a far-off rate pinned to the top, and a Distribution behind a tap (median, standard deviation, best and worst dive, a histogram with its bell curve and, under it, a box plot the owner asked for in issue #97); then Records and averages, with the landmark sentence leading its row and the water temperature range dropped; dives per year in a card with the anniversary under it; Depth; Conditions (weather and surface joined in) and Habits (time of day, entry, gas) as one-line answers with each strip behind a tap and Expand all in the heading, replacing the tiles; then Sites, Buddies and Regions, each showing its top three with Show all opening the rest in place, and each row opening its site, buddy or region over Statistics (Back says Stats and the Stats tab stays current); then Tags. Regions leave out sites with no region rather than listing their country. A tag opens the Log filtered by that tag and the chosen year, so it lists the dives counted. The board's "Never used" line under the tags is left out (the owner's choice): it lists the app's fixed tags, which says nothing about the diving. |
| D61 | Patterns (added 14 November 2026) | The Patterns section sits under Records and averages (the owner's choice, over leading the screen, after Habits, or last). Tapping a pattern opens its groups in place, each with its number of dives and its figure, as Conditions and Distribution open, and doesn't list the dives or open the Log (the owner's choice, over a sheet, a detail screen or a Log filter, which can't express a group such as "moderate or stronger current, with a SAC rate"); All patterns is its own screen, pushed over Statistics. Habits never reach the top three, as records don't (the owner's choice): scored as the spec says, a habit such as "air on 90% of 40 dives" outscored real differences, and each repeats the Habits answers or the ranked lists. The spec's catalogue left the change, trend, habit, season and record rules' inputs, the choice measures' outcomes and the fields' splits open; they are set under Catalogue in the spec. After a design critique of the first build the owner chose, as recommended: SAC rate over time out of the top three, as the Air consumption card leads with it by its own average and a second figure read as a contradiction, while SAC against current, workload and the rest can lead; one finding over time per measure, the change before the trend; bold that reads on its own, the outcome in bold with its share (the owner's call on the threshold); a threshold's rows saying how many felt cold, with the dives between the cut-offs as left out, under a dot strip of every dive; each pattern's icon from what it compares across, in the accent on All patterns too (the owner's choice, over the critique's muted icons there); only the records and habits the screen doesn't already show; rows whose icon and chevron centre on the sentence (the owner's); and an expandable row tinting as one item on hover with a mouse, on Statistics' other expanding rows too (the owner's). Near-duplicate differences were left as they are (the owner's choice). The owner then asked for more drawings like the threshold's and chose, as recommended, a lane of dots per group for differences and changes between averages and a month-by-month bar row for seasons, over a trend line and a gap timeline, which repeat the SAC chart and the sentence; and Expand all in each patterns section's heading, as Conditions and Habits have. |

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
| 20 | 10 | Logging: structured server log, request ids, the app's errors | 7 |
| 21 | 11 | Direct download from the dive computer | 7, 17, 20 (its log lines) |
| 22 | 12 | Statistics: figures and charts | 9, 18 (the stats chunk offline) |
| 23 | 12 | Statistics: patterns | 22 |
| 24 | 13 | Dive-number milestones | 10, 22 (the Records card) |
| 25 | 14 | Packing checklist | 11 |

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
- CI runs typecheck, lint and build (`static`) beside the unit tests (`unit`), `image`, and Playwright in three shards (`e2e-shard`). A `check` job passes only when `static` and `unit` did, and an `e2e` job only when every shard did, as the main ruleset requires checks by those names.
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

**Not in this milestone**: statistics (milestones 22 and 23), pattern rules, anything touching XML in production code.

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
- `settings.test.ts`: defaults are the diver name empty, max PO₂ 1.4, new-dive defaults empty; `PUT` validates with the core schema; a new-dive default uses the same shapes as dive fields (material, volume in ml).
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
- Browser tests run on seeded stacks: read-only tests on one, `@writes` tests one at a time on one per browser, undoing their change in a `restore` fixture, and `@built` tests on a production build served by its own API, the only stack with the service worker (added with the offline work). `console.spec.ts` fails on any console warning or error, uncaught exception or failed request. Ports move with `E2E_WEB_PORT` and `E2E_API_PORT`.
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
- Added later (D35, issue #36): the smoothed temperature lane. `smoothTemperatures` is in core (`calc/water.ts`), tested on both exports, and applied in `profileModel` before the temperature axis. The caption's menu is `chart/line-menu.tsx`, a panel laid out in the chart rather than a portalled popover, because Base UI's positioner can't place one inside the full-screen view's quarter turn. The setting is `data/smooth-temperature.ts`, read by the chart, the table alternative and You.

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
- `entities.spec.ts`: rename a site with Save; a colliding rename shows the error with "Merge instead"; merge moves the dives and the merged name disappears; the Regions tab lists regions with their dive count.
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
- the native switch and segmented controls on the You tab (Smooth water temperature, Appearance), and the Save line easing open under a card as the keyboard is up.

Decisions taken while building:

- The fourth tab is You with a scuba mask (D30); Gear moved to the scuba tank so one icon means one thing. `/settings` redirects to `/you`. About's version is the image's commit (`VITE_REVISION`, a Docker build argument CI fills; `dev` locally) and its server `TS_HOSTNAME` from `/api/health`.
- Sections with fields get Save and Cancel under their card, easing open on the first change; an entity detail's Save is in its bar. Each save sends only what changed (maximum PO₂ in Preferences and the new-dive defaults save apart, so neither puts back another phone's change), keeps anything typed while it saves, and shows defaults at their stored precision.
- The entity list's five tabs are words only (icons didn't fit at 390 px). A region's detail shows dives, sites and last dive; on a site or dive centre the region is picked, not typed (D6). Likely duplicates read "share a prefix" as one name starting with the whole other (spec updated); only a letter is an initial; sites are suggested within a country but can be merged across countries (regions only within one). Entities only a draft has created are listed but can't be renamed, merged or deleted until they upload, and a trip a draft uses can't be deleted.
- Dive lists on an entity show ignored dives too (the figures still leave them out), three then 50 at a time; Recently deleted pages 50 at a time and groups by today, yesterday and month. "Used by" names dives in Recently deleted apart.
- A merge or delete leaves its screen as soon as the server has it (`commit` with `settle: false`), so no "Not found" flashes. A draft deleted while its upload was in flight is deleted on the server too.
- "Last sync" lives in its own store (`data/last-sync.ts`), so the five-minute check doesn't re-render every screen; `/api/health` is asked again after each sync.
- Every new sheet keeps shadcn's centred 16 px title, as the form's do. Delete sheets' dark CTA is red-600 for contrast. The restore toast's Sonner styles need `!important`, as Sonner's CSS isn't layered.
- Motion added on request: the Log count rolls its changed digits (`components/rolling-number.tsx`) and the restore fold on the detail (the full-screen profile eased in too, until it was dropped so it opens at once); and from find-animation-opportunities: the Save line, a restored card folding away, and each batch of an entity's dives easing open.

Deferred, or to watch:

- Milestone 18: offline guards on the synced-data controls (Delete, Restore, Save, merge) with the offline icon in each screen's bar; meanwhile a request offline fails with "Couldn’t reach Shylog". The sync card's other states and the drafts row.
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
- Card saving and deleting live in `data/card-edits.ts`, apart from `data/cards.ts`, which the sync imports, so there is no import cycle through `commit`. The viewer and the full-screen profile share `hooks/use-full-screen.ts` (the app made inert beneath them; both open and close at once). A picked image is known by its first bytes, never its name or the type the browser gives. HEIC or HEIF, which iOS hands over from Files and a computer picks as is, becomes a JPEG through the browser's own decoder (Safari's; Chrome and Firefox refuse it in the sheet), with the long edge kept to 4096 px and its EXIF left behind. Screenshots are PNG and go up untouched. On a desktop the file dialog names `.heic` and `.heif`; a phone's doesn't, or iOS would stop turning Photos' HEIC into JPEG.
- The viewer's motion values write the transforms directly (no motion components), so its chunk carries only Motion's animation code (about 32 KB gzipped); the sheet, with `Reorder`, loads once the viewer is up (so Edit opens at once) or on the press of the list's add button. Ctrl-scroll (a trackpad's pinch) zooms on a desktop, and the arrow keys turn the pages. The viewer has no hint line, as the gestures are the ones the phone's photo viewer uses. The page dots keep the board's 15 px pitch, and the whole strip under them is one 44 px target, as iOS's page control is: a tap either side of the shown dot turns a page, and a slide along it scrubs.
- Separate cards save one at a time, each with its own id kept across a retry, and only the last waits for the log. Leaving a sheet with picked screenshots or edits asks first; delete asks in a sheet.

Deferred, or to watch:

- A very small screenshot shows at its own size in the viewer rather than scaled up, which would blur it.
- Milestone 18: offline guards on add, edit and delete, and the Certifications list's offline note.
- Carried over from milestone 11: everything under its "Deferred, or to watch" still open (the phone checks, the Log count's width snap, `log.spec.ts`'s flaky scroll test in WebKit, the e2e `@writes` leftovers, Node and Tailscale bumps, `minimumReleaseAge` to seven days, sharding Playwright).

## Milestone 13: UDDF export

**Goal**: the whole log is written as valid UDDF nightly and on demand, opens in Subsurface, and the You tab's download and alert rows work.

**Implements**: UDDF export (Data model), Units (export column), v1 fields (export column of both tables), Server (UDDF export), Backups (items 1 and 6), Testing (Schema validation), Screens (Settings Download and alerts), decisions D3, D4.

**Touches**: `apps/server/src/uddf/writer.ts` (owner from settings, divecomputer, sites with geography and the body-of-water element, buddies, gasdefinitions grouped by fraction, tanks grouped by material and volume, dives in schema order, `<applicationdata><shylog>` under Shylog's namespace, `<surfaceintervalbeforedive>` with `<infinity/>`), `apps/server/src/jobs/nightly.ts` (export after the snapshot, temp file, fsync, re-parse, rename), `apps/server/src/routes/export.ts` (`/api/export/uddf`, `/api/export/snapshot`, `/api/export/run`), `apps/web/src/routes/settings/` (Download rows, export alert with Export now), tests.

**Shape already in use**: the SSI converter (`apps/server/scripts/ssi/convert.ts`) writes `<shylog>` first: namespace `https://github.com/tkabalin/shylog/uddf`, elements named after core's dive fields (`surface`, `maxTemperature`, `trainingCourse`, one `tag` per tag), values as Shylog's keys, temperatures in kelvin. It also writes a site's region in `geography/location` and its ISO code in `address/country`, since the XSD requires both. The writer uses the same shape. (The converter has since switched to uploading drafts; see SSI logbook history in the spec.)

**Acceptance**

- `writer.test.ts`: a log with hand dives on 32.4% and 32% nitrox produces two mixes; two dives with Aluminium 11100 ml share one tank; every id is the Shylog id and the export is byte-identical on two runs with no change; dive 63 maps to `informationbeforedive/datetime` without an offset, `greatestdepth` 32.66, temperatures in kelvin, duration in seconds; the per-dive `<shylog>` block carries surge, surface, weather, rating, max temperature, gear, tags, dive centre and trip id; a dive with no earlier dive writes `<infinity/>`; an ignored dive has no `divenumber` and its `<shylog>` block says it is ignored (D23); a hand value that differs from the computer's goes in the standard element; tags, people and professionals export as the spec says.
- `uddfSchemaErrors` (`apps/server/test/uddf-schema.ts`) finds nothing in the generated export of the seeded log and a hand-only log; it strips `<shylog>` first and accepts `tankdata` with no start pressure, the two failures the spec allows.
- `nightly.test.ts` (extended): the export is written after the snapshot through a temp file and re-parse; a failed export leaves the previous file, logs, and `/api/health` reports it; the next night retries.
- `export.test.ts`: `GET /api/export/uddf` rewrites the file and streams it; `GET /api/export/snapshot` streams a `VACUUM INTO` copy; `POST /api/export/run` rewrites without a body and clears the failure.
- `writer.test.ts` reads every export it makes with `readAsSubsurface` (`apps/server/test/reference/subsurface-uddf.ts`, Subsurface's own stylesheet): every dive comes out with its date, time, depth, duration and mix, sites with name and position, buddies with their names, and multi-paragraph notes whole. The owner opens one real export in Subsurface as a last check (noted in the milestone notes).
- You: the Download rows work, "Last UDDF export" updates, a failed export shows the alert with Export now.

**Not in this milestone**: pass-through of imported standard elements (milestone 16), the queued-ops file (milestone 19).

- [x] Writer with every field mapping and grouping
- [x] `<shylog>` application data
- [x] Nightly export with temp file, fsync, re-parse, rename
- [x] Export endpoints (D4)
- [x] Vendored XSD (`fixtures/uddf/uddf_v321.xsd`) and `uddfSchemaErrors`, run in CI with the server tests
- [x] You tab Download rows and export alert
- [x] Subsurface's UDDF import as a test helper, proven on the D4i and Zoop Novo exports
- [x] Subsurface reads the export (helper in `writer.test.ts`, one manual open)
- [x] Tests listed above

**Notes for the next session** (written 2 November 2026, branch `feat/uddf-export`)

Checked on the owner's side:

- A real export of the dev log (55 dives) opened in Subsurface with every dive, date, time, depth (42.28 m kept; its list rounds to whole metres), EANx and profile. Subsurface ignores UDDF's surface interval and works out its own, needs cylinder size and both pressures for SAC, and fills Extra Info only from file-wide facts, so a `.ssrf` download is under Later in the spec.
- A throwaway on the phone tried four ways to save a download (share sheet or `a[download]`, fetched on tap or beforehand); all worked, and the owner chose the share sheet for Save to Files' folder choice. Still to try on the phone after deploy: the Download rows from the installed app, and the snapshot through the share sheet (only the UDDF's `application/xml` was tried; a refused type falls back to a download).

Decisions taken while building (D34 in the table, and the spec):

- Trips and dive centres are in `<shylog>` as `tripId`/`tripName` and `diveCentreId`/`diveCentreName`: the XSD's `divetrip` needs a rating and trip parts and `divebase` a link, so writing them meant inventing data. A dive centre's region stays in the database.
- The writer writes samples as waypoints and stored events as `<alarm>`s (`ascent` at both ends of a pair, `surface` at its time), which `readUddf` reads back to the same events; milestone 16's pass-through is left with what Shylog doesn't store. A site with no region writes an empty `geography/location`.
- Air is `mix-210` (`o2` 0.21, D9), the constant shared with the sample reader. Dive-computer ids are `computer-<slug>-<6 hex of the model's SHA-256>`, so a new model never renumbers another. Repetition groups are `group-<dive id>`. There is no generator date, so an unchanged log exports the same bytes.
- The export reads in one transaction on the server's connection (it is built synchronously), writes through a flushed temp file in `export/`, re-reads and parses it with xmldom and counts its dives before the rename. Temp files over an hour old are cleared on the next export or snapshot download. Startup runs the nightly job when today's snapshot or the export file is missing.
- Only a failed night raises `exportFailedAt` (cleared by any export that succeeds); a damaged database skips the export without an alert of its own, and `writeExport` refuses it with a 503 `Rejected`. A HEAD on `/api/export/uddf` answers 405 rather than rewriting the file.
- You: the Download rows share the file on a phone and download it on a desktop, with a spinner while the server builds it and a red error line naming the file. "Last UDDF export" reads "Failed today" (no time) after a failed night. You's alerts unfold and fold through `you/fold.tsx` (measured height, 250 ms `--ease-drawer`, the fade kept apart from the fold; `--ease-in-out` moved a tall alert 61 px in a frame), and `useHealth` keeps the last answer between visits, so an alert already known is drawn in place.
- Added later (D36, issue #41, PR #43): the CSV export. `csv/writer.ts` writes one row per dive with core's units and labels and a compact JSON profile column, through a hand-written RFC 4180 encoder (CRLF, BOM, semicolons quoted, a `'` before text a spreadsheet would run as a formula). `writeExport` writes `export/dives.csv` with `dives.uddf` from one read, and `checkUddf`/`checkCsv` (csv-parse, now a runtime dependency) check both files before either is renamed. The UDDF and CSV downloads build and check a file for the download alone; only the nightly job and Export now write the server's copies (D4 changed). "Last UDDF export" is "Last export". `countryName`, `diveSacRate` and `storedSampleFigures` moved into core; `selectEvents` and `byDive` are shared by both writers. Decision numbers were taken out of every comment and doc but this plan.

Deferred, or to watch:

- Size and speed, measured on the dev log (55 dives): the export is 1.1 MB, sent as 66 KB gzipped, and takes about 0.3 s on the server, most of it the xmldom re-parse. At about 1,000 dives that is about 1.2 MB and 3–5 s, during which the server answers nothing else; a cheaper count check would fix that. The snapshot isn't compressed in transit (Hono's `compress` skips `application/vnd.sqlite3`): about 15 KB a dive.
- The XML builders copy each line once per nesting level (25 ms for 9,340 samples); not worth restructuring yet.
- The alert body's muted text on the tinted fill is about 4.2:1, the board's own choice.
- Server logging is plain text and errors only (no request log, no success lines). Shipping the container's stdout to Loki needs no code; JSON lines, a request log with a request id, and job success lines were discussed with the owner as a possible separate item.
- CSV export, to watch: the share sheet with a `text/csv` file is untested on the owner's phone (a refused type falls back to a download). The two renames aren't atomic as a pair: a crash between them leaves the files one export apart until the next night (a failed rename raises the alert as usual). Both writers read each dive's samples (about 1.5 ms of a 165 ms export on 46 dives), left as is. A start with `dives.csv` missing also retakes that day's snapshot. The keyboard focus ring is faint in Chromium's light theme, app-wide.
- Carried over from milestone 12: the viewer and reorder gestures, the photo picker, and a card opened offline after a sync, all to check on the phone; offline guards on card add, edit and delete (milestone 18); and milestone 11's list (the phone checks, the Log count's width snap, `log.spec.ts`'s flaky scroll test in WebKit, the e2e `@writes` leftovers, Node and Tailscale bumps, `minimumReleaseAge` to seven days).

## Milestone 14: Import, the Suunto reader

**Goal**: the server turns a Subsurface UDDF export from the D4i or Zoop Novo into Shylog dives, samples, events, gases and fingerprints, applying every rule in the spec's D4i section.

**Implements**: Subsurface import (Freedives, What the D4i export contains, The Zoop Novo), Instance configuration (Dive computer), decisions D9, D10, D11, D12, D33, D37.

**Touches**: `apps/server/src/uddf/reader.ts` (grows the milestone 4 sample reader), `apps/server/src/import/freedive.ts` (freedives and dives under five minutes, D33, for every computer, D37), `fingerprint.ts`, `fixtures/synthetic/generate.ts` and its outputs (D11), tests.

**Acceptance**

- `reader.test.ts` on the D4i fixture: 72 dives; 26 freedives (fixture 9 to 34 on 28 December 2025, 8 to 26 s, gaps of at most 2 s, no tankdata, no switchmix); 59 ascent pairs stored as 59 events with start and end (dive 3's first pair spans 290 to 311 s), 159 surface events stored and typed; the time-0 switchmix is the dive's gas, never an event; `o2 = 0.21` is air (D9) and 0.32 is Nitrox 32.0%; dive 3's duplicate times merge; dive 6 keeps samples to 502 s with duration 180 s; max depth is `greatestdepth` (dive 63: 32.66 m, deeper than any sample); `averagedepth` is stored as a computer value; temperatures are converted from kelvin and stored only on the samples that carry one (the chart carries them forward, as Subsurface does), and min and max come from the samples (D10); `leadquantity` 0, the empty site link, `<notes><para/></notes>`, the dummy divebase and the empty `<divetrip/>` are ignored; datetimes have no offset; a gauge-style dive (no gas, 20 s sampling) is a normal dive, not a freedive.
- `subsurface-import.test.ts` (`apps/server/test/reference/`) keeps passing as the reader grows: each new rule that departs from Subsurface's import (the freedive rule, D33's short dives) is applied to Subsurface's answer there, with a comment, rather than loosening the comparison.
- `fingerprint.test.ts`: the fingerprint is start time on the computer's clock, duration and max depth; equal for the same computer dive in two exports.
- `zoop.test.ts` on the Zoop Novo fixture: 61 dives; the D4i's rules hold with none of its own (D37); 30 freedives (fixture 8 to 37 on 8 December 2025, 4 to 26 s); 8 ascent pairs (dive 61's second spans 3556 to 3571 s) and 140 surface events; dive 61's duplicate times merge; dive 53 keeps samples to 340 s with duration 160 s; dive 15's max depth is 8.15 m from `greatestdepth`, deeper than its 7.64 m deepest sample; dives 42 (20 s) and 54 (4 s) end with no `surface` alarm, and they and dive 53 (160 s) are left out as under five minutes (D33); dive 54, one sample and no `averagedepth`, has no average depth when included, as the samples' fallback gives none for a single sample at 0 s, as Subsurface's does.
- `generate.test.ts`: the synthetic fixtures are regenerated identically and each contains the case it is for.

**Not in this milestone**: pairing, preview, apply, UI.

- [x] Reader covering every element and placeholder in the spec's list
- [x] One rule set for every computer (D37)
- [x] Freedive rule and the under-five-minutes rule (D33)
- [x] Fingerprints
- [x] Zoop Novo fixture and rules
- [x] Synthetic fixture generator
- [x] Tests listed above

**Notes for the next session** (written 6 November 2026, branch `feat/suunto-reader`)

Decisions taken while building:

- One rule set for every computer (D37, the owner's choice): `import/freedive.ts` holds the freedive and under-five-minutes rules, the reader reads Subsurface's placeholders as nothing, and milestone 15's clock-offset estimate should apply whatever the model. There is no `suunto.ts`; add a model switch only with the first rule one model needs.
- `uddf/reader.ts` (the old sample reader) returns every dive: the computer's start, duration, max and average depth, `lowesttemperature` when present, the gas (the switchmix at 0 s, else the tank's link), the tank's volume and start and end pressures, weight, notes, samples (with tank pressure) and paired alarms, plus `hasTankData` and `hasGas` for the freedive rule. Temperatures stay only on the samples that carry one; the chart carries them forward.
- A 0 kg under `informationbeforedive` is Subsurface's placeholder; under `informationafterdive` (UDDF's place, where Shylog writes it) it is a real 0. Notes are joined by paragraph, trimmed, with unwritable characters dropped.
- Each dive's figures go through core's `diveFieldsPatch`, and sample times must be whole and in order, or the whole file is refused with "Dive N in the file has no valid …" (start time, duration, depth, average depth, weight, tank pressures, sample time). Milestone 15's upload route should turn that error into a 400. A dive with depth or duration 0 also refuses the file, even though it would be left out as short; kept for now, as neither computer writes one.
- A freedive needs two or more samples; a dive with fewer is never one (in the spec). Zoop Novo dive 54 has no average depth when included, as one sample at 0 s gives none, as in Subsurface's `fixup_dc_duration`. The Zoop Novo's freedives last 4 to 26 s (the spec said 27).
- The fingerprint is `<computer start> <duration> <max depth in mm>`, from the reader's values before any offset.
- `fixtures/synthetic/generate.ts` runs on plain Node (`node fixtures/synthetic/generate.ts`) and makes `abroad.uddf` (dives 52 to 65 five hours behind, 51 and 66 at home), `midnight.uddf` (dive 63 at 23:40), `gauge.uddf` (dive 66 without tank or gas), `pressure.uddf` (dive 63 with pressure on samples and tank) and `high-po2.uddf` (dive 63 on EANx36). Prettier now formats `fixtures/synthetic/` but not its `.uddf` files. Milestone 16's 120-dive export and its extra-channel file aren't made yet: add them to the generator then.
- The seed uses the same left-out rule: the D4i export seeds 42 dives, the Zoop Novo 28 (46 and 29 while the cut-off was a minute).

Deferred, or to watch:

- O₂ under 20.8 % and any helium read as air, as v1 has no trimix; the preview should flag such dives rather than import them silently.
- Subsurface links no dive to its computer, so an export holding two computers gives every dive a null model ("dive computer").
- The reader doesn't read sites (the spec's site matching on apply), the raw dive fragment for `import_raw`, or standard elements Shylog doesn't model; milestone 16 needs all three. The "empty site link, dummy divebase and empty divetrip are ignored" bullet holds because none of them is read yet.
- `abroad.uddf` never puts a dive on another date on the computer's clock; milestone 15 may want such a case for per-day offsets.
- The seed still stores only the fields it did (no weight, notes or tank data from the file), as the apply step will define how those become computer values.
- Carried over from milestone 13: the Download rows from the installed app and the snapshot and `text/csv` share sheets to try on the phone; the export's xmldom re-parse at about 1,000 dives (3–5 s); the two export renames not atomic as a pair; the faint keyboard focus ring in Chromium's light theme; server logging (milestone 20). From milestone 12 and earlier: the viewer and reorder gestures, the photo picker and a card opened offline after a sync, all to check on the phone; offline guards on card add, edit and delete (milestone 18); the Log count's width snap, `log.spec.ts`'s flaky scroll test in WebKit, the e2e `@writes` leftovers, Node and Tailscale bumps, `minimumReleaseAge` to seven days.

## Milestone 15: Import, preview, clock offsets and pairing

**Goal**: uploading an export produces a stored preview with per-day clock offsets, proposed pairs that pass Subsurface's same-dive test, unpaired and unmatched lists, and freedives, adjustable by day.

**Implements**: Subsurface import (Workflow, Matching and review), Endpoints `POST /api/import`, decision D5 (`GET /api/import/pending`, `PATCH /api/import/:id`, `DELETE /api/import/:id`), D38.

**Touches**: `apps/server/src/import/offset.ts` (per-day estimate rounded to 15 minutes from hand-logged times; the day is the one the dive starts in local site time), `pairing.ts` (closest start on the same day, `likely_same` from core), `preview.ts` (store with the data version and the uploaded file, expiry after seven days, override per day), a migration adding the file to `import_previews`, the reader's export ids and unsupported-gas flag, the restore drill skipping previews (D38), `apps/server/src/routes/import.ts`, tests.

**Acceptance**

- `offset.test.ts`: the synthetic "abroad" fixture (D4i clock 5 hours behind site time) estimates +5:00 for those days and 0:00 at home; a day with no hand dives gets the nearest estimated day's offset; estimates round to 15 minutes; a night dive starting 23:40 belongs to that date.
- `pairing.test.ts`: dive 63 pairs with a hand dive logged at 08:10 for 42 min to 32.7 m and not with one at 08:10 for 20 min; three hand dives on 20 July 2026 pair with fixture 58, 59 and 60 by closest start; a hand dive with no computer dive within the test is listed with the distance to the nearest start; already-fingerprinted dives are skipped; freedives and dives under five minutes are never proposed.
- `preview.test.ts`: the preview stores the data version and expires after seven days; `PATCH` with a day offset re-proposes that day only and keeps the override; `DELETE` discards; `GET /api/import/pending` returns the one awaiting review.
- `import-route.test.ts`: `POST /api/import` needs the UDDF content type and a connection, writes nothing to `dives`, and returns the preview in the schema from core.

**Not in this milestone**: apply (milestone 16), UI (milestone 17).

- [x] Clock-offset estimation per day
- [x] Pairing with `likely_same`
- [x] Preview storage, expiry, overrides
- [x] Routes: upload, pending, patch, delete
- [x] Tests listed above

**Notes for the next session** (written 6 November 2026, branch `feat/import-preview`)

Decisions taken while building:

- Previews are scratch (D38, the owner's choice): `import/preview.ts` writes them outside `write()`, so no journal entry and no new version; the restore drill skips `import_previews`; migration 6 adds the uploaded file (`uddf`) to the row, which apply should read again with `readUddf` for samples, sites and fragments. One preview at a time; a new upload replaces it. `GET /api/import/pending` writes nothing (so it works while saving is paused) and the nightly job purges expired previews before its snapshot.
- Days: each hand-logged day's offset is the 15-minute step that pairs most of its hand dives (halves round away from zero, ±14 h at most, dives an earlier day paired with don't vote). A dive goes to the day it paired with, else an estimated day it lands on, else the day the nearest estimate's offset puts it on, which takes that offset. Only clocks that disagree by hours on neighbouring days can leave a dive starting off its day. A day's dives are fixed: `PATCH` re-proposes that day only, against the log as it is then, and returns the whole preview. Other days' lists stay as built, so apply's re-check is what catches changes there.
- Hand dives paired or listed: live, without a fingerprint, ignored dives included, and only on the export's days. The unpaired gap is to the nearest computer dive on the same day, null on a day with none.
- Computer dives are named by the export's own ids (`ref`); a file repeating one is refused, as is XML that isn't UDDF. A dive the file holds twice counts as already imported. The preview's computer is named from every dive in the file, so a re-upload still names it.
- Gases v1 can't hold (helium or under 20.9 % O₂) are read as air and marked `unsupportedGas`; milestone 17's review must say the gas isn't supported and the dive will be stored as air, as the owner asked. A mix with no `<o2>` is air and not marked.
- Uploads: XML types, or `application/octet-stream` with a `.uddf`/`.xml` name in `Content-Disposition` (`filename*` wins), up to 25 MB, decoded by BOM or XML declaration, else UTF-8. Reader refusals are `UnreadableUddf` and a 400 with their message; DELETE is safe to repeat (204). Each computer dive carries its day, both starts, figures, temperatures from the samples and the 24-point sparkline for the review.
- `latestSchemaVersion` is now 6 for the migration, so a phone on older code stops syncing until it reloads.

Deferred, or to watch:

- Apply has to return "the dives changed since the preview", but `basedOnVersion` is a random id that can't name them. Record the journal's `MAX(seq)` with the preview and scan later entries, or snapshot the paired hand dives' figures; previews are scratch, so their shape can change freely.
- The import-route bullet's "needs a connection" is the app's job (milestone 17's offline state); the server can't test it.
- Carried over from milestone 14: Subsurface links no dive to its computer, so a two-computer export gives a null model; the reader doesn't read sites, the raw fragment or standard elements Shylog doesn't model (milestone 16); a dive with depth or duration 0 still refuses the whole file; the seed stores only the fields it did. From milestone 13 and earlier: the Download rows from the installed app and the snapshot and `text/csv` share sheets to try on the phone; the export's xmldom re-parse at about 1,000 dives (3–5 s); the two export renames not atomic as a pair; the faint keyboard focus ring in Chromium's light theme; server logging (milestone 20); the viewer and reorder gestures, the photo picker and a card opened offline after a sync, all to check on the phone; offline guards on card add, edit and delete (milestone 18); the Log count's width snap, `log.spec.ts`'s flaky scroll test in WebKit, the e2e `@writes` leftovers, Node and Tailscale bumps, `minimumReleaseAge` to seven days.

## Milestone 16: Import, apply, fingerprints and pass-through export

**Goal**: confirming a preview attaches profiles to paired dives, adds new dives, fingerprints everything seen, stores raw fragments, computes CNS and OTU, and the export passes imported standard elements through.

**Implements**: Subsurface import (For a matched dive, Summary), Server (Imports in chunks), UDDF export (Standard data is passed through), Testing (Pass-through, Sync: imports against hand-logged dives), Endpoint `POST /api/import/:id/apply`, decisions D5, D16 data, D19, D40 to D43.

**Touches**: the reader and writer for the round trip (D41), `apps/server/src/import/apply.ts` (re-check against current data, return changed dives, chunks of 50 in one transaction each with a journal entry carrying the payload, idempotent by import id), `field_meta` writes for filled and differing fields, `import_raw`, fingerprints with reasons, `apps/server/src/uddf/passthrough.ts` (standard elements in schema order with remapped links; hand values in standard elements), tests.

**Acceptance**

- `apply.test.ts`: a paired dive keeps every hand value (an ignored dive stays ignored), gets samples and events, fills empty fields as computer values (average depth, min and max temperature), records `computer_value` for each of start time, max depth, average depth, duration and temperatures that differ, by any amount; an added dive carries the computer's values with source computer; a skipped dive gets no fingerprint; a freedive left out gets one with reason `freedive`, and a Zoop Novo dive under five minutes one with reason `short`; an included freedive becomes a dive; a second apply with the same import id changes nothing; a 120-dive synthetic export commits in three chunks with three journal entries, and a failure in chunk two leaves chunk one applied and reports it; a hand dive edited after the preview is returned as changed before anything commits; the summary counts match D19.
- `reimport.test.ts`: importing the same export twice skips every dive as already imported; deleting a dive and importing again still skips it.
- `passthrough.test.ts`: import the D4i fixture, export, and compare each dive's standard elements before and after, allowing only remapped ids, hand values and Shylog's own additions to differ; the result has no `uddfSchemaErrors`; `<he>`, alarms and extra sample channels in a synthetic fixture survive in place.
- `uddf-round-trip.test.ts` (`apps/server/test/reference/`) grows a fifth property: a random log exported and imported into an empty instance comes back with every v1 field equal, the hand values read from `<shylog>`.
- `sync-import.test.ts`: a hand-logged dive uploaded from a draft, then matched by an import, ends with the same data whether the draft arrived before or after the preview was made. The SSI logbook's drafts (`convertSsi` on the converter's test rows, shifted onto the D4i fixture's July 2026 dives) uploaded first, then the D4i fixture imported, pair with those dives and keep their hand values.

**Not in this milestone**: UI (milestone 17).

- [x] Apply with re-check, chunks, idempotency
- [x] `field_meta`, fingerprints, `import_raw`
- [x] CNS and OTU stored from imported samples
- [x] Pass-through in the export
- [x] Tests listed above

**Notes for the next session** (written 7 November 2026, branch `feat/import-apply`)

Decisions taken while building:

- An added computer dive with no site goes to one shared "Unknown site" in South Africa (D40, the owner's choice), with no `field_meta` row so the PADI script and the form replace it. A site another program's file names in no ISO country is made in South Africa the same way.
- The round trip is whole (D41, the owner's choice): `<shylog>` carries the dive professionals, the dive centre's region, the site's water type where its body of water doesn't imply it, and a hand surface interval. The reader knows Shylog's own file by `<generator><name>` and takes everything in it: standard elements as computer values, `<shylog>` as hand values (so Ignore this dive comes back), and no temperatures from the samples. The fifth round-trip property checks every v1 field; person names come back with their words joined by one space, as UDDF's first and last name hold them.
- Pass-through (D42, the owner's choice): `import_raw` holds `<fragment>` with the dive and the mixes it links to. The writer re-parses it on every export and writes the standard elements Shylog doesn't model in UDDF's order. Mix links are remapped (a helium mix as `mix-<o2>-<he>`), other links are dropped, and the gas switch at 0 s takes the dive's own mix. A security review found that a crafted file could break out of a passed element (a processing instruction or CDATA turned into markup by a global namespace replace), so comments, instructions and CDATA are scrubbed, characters XML can't hold are dropped, and the namespace comes off the root tag only.
- Apply (D43): the stored preview keeps a digest of every hand dive it read, a `revision` bumped by each re-proposal (the request must echo it), the dives a failed apply already applied, and the ids it last asked about. Changed hand dives re-propose their days and return `changed`; a resent stale request gets `changed` again. Chunks of 50 are journalled as `importChunk` under op id `<import id>:<n>` with everything a replay needs. They run back to back: yielding between them was tried in review and let a resend or a clock change race the import, which a lock across five routes would have had to stop, for an import that takes well under a second. After a failed chunk the stored preview counts the applied dives as imported and unpairs any proposed pair whose hand dive went elsewhere. A preview stored before this change gets defaults and asks again on its first apply. The finished summary is `meta.last_import`, which a late retry gets back. `POST /api/import/:id/apply` answers 200 with `applied` or `changed`, and 500 with `failed`, the error and what was applied.
- Fingerprint reasons are `paired`, `added` (included left-out dives too), `freedive` and `short`. A filled computer value that breaks a rule with a hand one (an average depth below a shallower hand max depth) is left empty, not kept.

Deferred, or to watch:

- **Open for the owner**: a paired dive logged with the default Nitrox no keeps it, and the computer's EAN32 is dropped without a flag, as gas isn't a compared field; CNS and OTU are then worked out on air. Comparing the gas would change the spec and the form (milestone 17 or its own issue).
- Milestone 17's review must send `revision`, handle `changed` (re-fetch the pending preview) and `failed` (retry), show the Unknown site, and name the unsupported gas as air.
- Each imported dive costs about 1.5 ms of export time for its fragment (190 dives: 353 ms, against 76 ms without), on top of the re-parse noted at about 1,000 dives. Each `importChunk` entry carries the samples and the fragment, so the journal grows by roughly the export's size per import.
- The seed still stores only the fields it did, rather than going through apply.
- Carried over from milestone 15: a dive with depth or duration 0 still refuses the whole file; Subsurface links no dive to its computer, so a two-computer export gives a null model. From milestone 13 and earlier: the Download rows from the installed app and the snapshot and `text/csv` share sheets to try on the phone; the two export renames not atomic as a pair; the faint keyboard focus ring in Chromium's light theme; server logging (milestone 20); the viewer and reorder gestures, the photo picker and a card opened offline after a sync, all to check on the phone; offline guards on card add, edit and delete (milestone 18); the Log count's width snap, `log.spec.ts`'s flaky scroll test in WebKit, the e2e `@writes` leftovers, Node and Tailscale bumps, `minimumReleaseAge` to seven days.

## Milestone 17: Import, screens

**Goal**: the Import flow on the phone: upload, review with the clock sheet, paired list, change pairing, the changed-since-preview sheet, and the summary with the differing dives.

**Implements**: Screens (Import), Subsurface import (Matching and review, For a matched dive's gas rule, Summary), the dive detail's differs banner on imported data, decisions D5, D16, D19, D44, D45. Screens: `ImportHifi` (Ready, Waiting review, Uploading as indeterminate; the Offline state comes with milestone 18, and until then an upload with no connection fails with "Couldn’t reach Shylog"), `ImportReviewHifi` (Not paired, New dives, Also in this file, Freedives, clock sheet, changed sheet), `PairedHifi`, `ChangePairingHifi` (including other days with the warning), `ImportDoneHifi` (with the list of differing dives, D16).

**Touches**: `apps/web/src/routes/import/` (screens above), `apps/web/src/data/import.ts` (upload, pending, patch, apply, discard), tests.

**Acceptance**

- `review.test.ts`: the computer is named from the preview's model ("your D4i", "your Zoop Novo", "dive computer"); "Already imported" is a count row with no expansion and freedives and dives under five minutes are one row each under day headings with their own Include (D21); the CTA total is paired + added + included left-out dives; unticking a new dive counts it as skipped; the clock sheet steps by 15 minutes, shows the pair line, and offers "Use +5:00" or "Reset"; a hand pairing across days or failing the test shows the warning.
- `import.spec.ts` (Playwright): upload the D4i fixture into a log with three hand-logged dives for 20 July 2026, see three pairs, 39 new dives and 30 dives left out (26 freedives and 4 under five minutes); shift a day's clock and see the pairs re-propose; change one pairing to Don't import; include one freedive; apply; the summary shows the counts and lists the dives that differ; opening one shows the banner and the ✓/✕ groups; the Import screen then shows the last import; uploading the same file again shows everything as already imported.
- Screenshots of the five import screens and the clock sheet at 390 px against the boards.

**Not in this milestone**: the Import screen's Offline state (milestone 18); this closes the Import step.

- [x] Import screen states
- [x] Review with sections, clock sheet, changed sheet
- [x] Paired and Change pairing
- [x] Done with differing dives
- [x] Tests and screenshots listed above

**Notes for the next session** (written 7 November 2026, branch `feat/import-screens`)

Decisions taken while building:

- The review's bar has Discard, which asks first; a hand-logged dive under Your dives with no match opens the pairing screen turned round (D44, the owner's choices); Paired leads the review (D46). Freedives and dives under five minutes share one Left out row, each saying which it is; the summary counts them together as left out.
- The gas is a compared field (D45, issue #60, the owner's choices): a hand Nitrox no takes the computer's nitrox as a computer value; a hand mix keeps its oxygen and is flagged only when its whole per cent differs; a hand mix against the computer's air is kept and flagged. The computer's reading sits on `oxygen`'s `field_meta` row, 210 for air. Import chunks carry `gasCompared`, so a restore replays older entries without the rule, as they were applied.
- `GET /api/import/pending` also returns the last completed import, with the file's dive count, its days and the computer model, which each chunk carries (`file`), so the Import screen and Done survive a reload.
- The preview's computer dives carry `oxygen` and `site` (optional, as previews stored before lack them) for the Compare table and the Unknown site note.
- The review's choices stay on the phone in sessionStorage, keyed by preview id and revision; a clock change or a `changed` reply drops the choices on the days proposed again and keeps the rest. A computer dive paired with a hand dive another had takes it, and that one is added as new (or left out when under five minutes).
- Review, Paired, the pairing screens and Done cover the tab bar, as the boards draw them. Each import step replaces the last; Paired and the pairing screens are pushed.
- The review flags differences as the dive form does (at the precision shown), so its counts and Done's list of differing dives match the dive's banner, though the server records any difference.
- Screens name the computer from the preview's model ("your D4i"), as the spec and the plan's acceptance say; generic copy, such as the upload steps, says "your dive computer", as `.claude/rules/ui-copy.md` asks.
- Issue #57: a screen bar's back label reads "Back" when the parent's name doesn't fit beside the title, as iOS does, and full-height sheet bars have more room above their actions.
- A hand edit over a gas the computer filled keeps the computer's reading on the oxygen row, as an import keeps a differing one. Unlike import chunks, hand edits aren't versioned for this: no journalled edit could have met the case before the import screens existed. A gas v1 can't hold is never compared, as it is stored as air.
- Done celebrates an import once, on arriving from the review's apply: the badge settles in and seven bubbles rise off it, as a new dive's save does.

Deferred, or to watch:

- **Clear filters on the Log** (found in an animation-performance pass): the router reads the URL through `useSyncExternalStore`, which React always renders as blocking, so the whole Log, every card included, re-renders inside the tap (127 ms with 42 dives and 193 ms with 126 at 4× CPU throttle, production build). Fixed by deferring the list and memoising the cards: the pills and count answer the tap and the cards follow a moment later, which the owner couldn't see on the phone.
- Importing a second computer's file into the same log adds the dives both recorded again, as an import pairs only hand-logged dives; each instance imports one diver's computer, so it shouldn't arise.
- To check on the phone: the native day picker in the clock sheet, the file picker with a `.uddf` from Files, the sticky review footer over the home bar, and the back label falling back to "Back" on the entity screens.
- "Show dives from other days" offers the export's other hand-logged dives and any dive without a profile within two days; the log doesn't say which dives have a fingerprint, so a dive with a profile stands for one and the server refuses any it gets wrong.
- The review lists every new dive flat, as the board does; a file of hundreds of new dives (a first import) is a long list. Day headings could come later.
- Carried over from milestone 16: a dive with depth or duration 0 still refuses the whole file; a two-computer export gives a null model; each imported dive costs about 1.5 ms of export time for its fragment; the seed doesn't go through apply. From milestone 13 and earlier: the Download rows from the installed app and the snapshot and `text/csv` share sheets to try on the phone; the two export renames not atomic as a pair; the faint keyboard focus ring in Chromium's light theme; server logging (milestone 20); the card gestures, photo picker and offline card to check on the phone; offline guards on card add, edit and delete (milestone 18); the Log count's width snap, `log.spec.ts`'s flaky scroll test in WebKit, the e2e `@writes` leftovers (the import test's deleted dives join them), Node and Tailscale bumps, `minimumReleaseAge` to seven days.

## Milestone 18: Offline, service worker, sync states, storage

**Goal**: the app opens with no signal, drafts wait and retry, every sync state is visible, and the phone's storage is protected where it can be.

**Implements**: Operations and offline sync (Flow steps 2 and 7, retry), Client data (service worker), Mobile rules (sync badge, provisional numbers, disabled controls offline), Offline safety and accessibility, Screens (Settings sync card states). Screens: `LogHifi2` sync pill and draft cards, `DiveDetailHifi` offline note and unsynced banner, `SettingsHifi` sync card and storage sheet, `CertsHifi` offline note, `RecentlyDeletedHifi` offline, `SitePickerHifi` offline note, `ImportHifi` Offline state.

**Touches**: `apps/web/vite.config.ts` (vite-plugin-pwa precaching the shell and lazy chunks, manifest served by the server), `apps/web/src/data/sync.ts` (states offline, unreachable, syncing, synced; retry on reconnect and app focus), `apps/web/src/components/sync-shark.tsx`, `UnsyncedBanner.tsx`, `apps/web/src/data/storage.ts` (`navigator.storage.persist()`), `apps/web/src/routes/settings/storage-sheet.tsx`, guards that disable Edit, Delete, Restore, rename, merge, card actions and Import offline, tests.

**Acceptance**

- `sync-states.test.ts`: `navigator.onLine` false gives offline; a failed fetch while online gives server unreachable; an upload in flight gives syncing; an empty queue gives synced and hides the badge; the banner shows the count and the age of the oldest draft.
- `offline.spec.ts` (Playwright with `context.setOffline`): the app loads from the cache with the Log and a dive detail with cached samples; a new dive saved offline shows the outline, cloud-off icon, screen-reader text and a provisional number; back online it uploads and gets its number; a synced dive's Edit and Delete are disabled with the note; a rejected draft shows its reason on the card; the Import screen shows its Offline state and doesn't upload.
- `storage.test.ts`: persist is requested on first launch; the You tab's row shows Protected or the help sheet; the sheet's copy matches the board.
- Screenshots of the badge states, the draft card, the storage sheet and the Import screen's Offline state at 390 px.

**Not in this milestone**: the update flow and queue export (milestone 19).

**Notes for the next session** (written 2 November 2026, from a look at cold launch speed, which the owner left for this milestone)

- Precaching is also the fix for a slow cold launch, not only for offline. Without a service worker every launch downloads `index.html` again (`no-cache`, no ETag) and then 35 critical-path files: about 886 KB raw, 268 KB gzipped (the entry, the Log chunk, about 30 modulepreloads, 159 KB of CSS, the Geist fonts). iOS evicts an installed web app's HTTP cache readily, so the `immutable` assets often come over the network too. Record these numbers and launch-to-Log time on the phone before and after.
- The server writes `<title>` from `SHYLOG_APP_NAME` when it serves `index.html` (`apps/server/src/static.ts`). The precached page must come from the server, not the build output, or both installed instances are called Shylog. Check the title in `offline.spec.ts`.
- With a cache-first shell, a deploy reaches the phone only once the new worker takes over, and the guarded update flow waits for milestone 19. Pick the interim update behaviour when this milestone starts. An automatic reload must not drop an open form, and only the dive form autosaves.

- [x] Service worker precache and manifest
- [ ] iOS install details: `apple-mobile-web-app-title` and a status bar style checked on a phone in both themes (`black-translucent` puts white text over the light theme's white header). Also check the soft blur iOS draws under the status bar on a cold launch, over the top of the Log's count until the first scroll (seen on the dev server, 24 October 2026)
- [x] Sync states, retry, badge, banner
- [x] Draft indicators and provisional numbers
- [x] Offline guards on synced-data controls
- [x] Storage persistence and sheet (`navigator.storage.persist()` also protects the Dexie log mirror and sample cache that make the detail instant, not only the drafts)
- [x] Tests and screenshots listed above

**Notes for the next session** (written 9 November 2026, branch `feat/offline`)

Decisions taken while building:

- D55 (the owner's choices): the sync pill is grey and takes the warning colour only for Can’t reach and Not synced (a refused draft, or an upload the server answered with an error), chosen from mockups of the board’s grey, cyan while syncing, and both combined. Paused (a server on a newer schema) is warn too. The banner of waiting dives is You’s sync card, as `SettingsHifi` draws it. A new version waits for every window to close (`registerType: "prompt"`, no `skipWaiting`), with `clientsClaim` so the first install takes the open page; the worker also checks for an update each time the app returns to the foreground.
- Server unreachable means the phone says it is online and a sync or upload got no answer. It retries after 5 s, doubling to the five-minute check; going back online, returning to the app and Try again reset the backoff and sync at once. An upload the server answers with an error (a 503 while saving is paused, a 500) is a state of its own, Not synced in the warning colour with Try again, retried with its own backoff that a working log sync doesn't reset; so is any other failed upload that did get an answer (a failure on the phone, a log fetch with an error), so only a request with no answer shows Can’t reach. It disables online-only controls as offline does, with the server-off icon in place of wifi-off.
- Guards: the dive’s Edit and Delete (a draft stays editable), Restore on the detail and in Recently deleted, an entity’s Save, merge, delete and Choose dives, a new entity’s Save, You’s diver name, maximum PO₂ and defaults (a disabled fieldset), the Export rows, Export now, adding, moving and editing cards (the list’s footer drops its reorder hint offline), and Import, whose Offline state greys the upload out where it is. The site picker’s new-site form gives `SitePickerHifi`’s note that the site is matched with existing ones when it syncs.
- A draft’s provisional number is worked out on the phone as the server numbers (non-ignored, live dives by start time, ties to the one written first); a refused draft takes none. The badge counts the dives waiting to upload, and under Not synced every dive the server hasn’t taken, refused ones included; the stuck card, titled “Couldn’t upload N dives” and saying they’re safe on this phone, adds “N more were refused”, and Paused gives the count waiting. A refused draft is left out of the Log's figures and month counts too, so “dives logged” matches the newest number, and its card keeps its place line with a warning icon, the reason on its detail (two lines on the card still cut it short). A synced dive after an earlier-dated draft shows the number it will have once that draft uploads, so the Log never shows one number twice (the visual review found 52, 41, 50 down the Log otherwise).
- You’s sync card follows `SettingsHifi`’s states, with Try again on Can’t reach, under the words rather than beside them, which squeezed the title into a third of the card on a phone; refused drafts show as “N dives not synced”. The card’s icon takes the warning colour where the badge does. Its age line is when the dive was saved on the phone: “Saved on this phone just now” for one, “The oldest was saved 2 days ago” for several (“Oldest logged” read as the dive’s date).
- Storage: `navigator.storage.persist()` is asked once on the first launch in a tab and once more on the first launch installed (localStorage flags, as Firefox prompts each time and an app added from Chrome shares the tab’s storage), and again from the sheet’s Keep them safe. The row says nothing alarming until the browser answers. The row and sheet use the board’s copy.
- vite-plugin-pwa 2.0.0 with workbox 7.4.1: `@trickfilm400/rollup-plugin-off-main-thread@3.0.0-pre1` is excluded from the trust policy (its runtime files match the attested 2.5.0), and `workbox-build>glob` is overridden to 14, as glob 11 matches nothing with the repo’s forced minimatch 11.
- The e2e Vite servers run without the HMR socket (`E2E_NO_HMR`), as Vite’s client reloads the page once a socket dropped by `setOffline` comes back. A built-app stack (`@built` tests) builds for production into its run folder (`E2E_BUILD`) and its API serves that through `SHYLOG_WEB_ROOT`, refused in production; a second worktree now steps the ports by 4. Offline on the dev server, a screen’s code must be loaded by navigating inside the app first, as a full `page.goto` drops it.
- The draft strip folds with `Fold` (moved to `components/`) rather than jumping the page; the shyshark's badge fades in only when it appears with the Log on screen (the header has no `@container`, which made WebKit's scroll anchoring move `main` and flaked `shell.spec.ts`). The edit form, delete confirmation and card sheet hold Save and Delete offline too, and You's disabled settings dim, label and value together, under the sync card's Offline. Forms that save with Save (a dive, an entity, a card) stay editable offline with Save held, so a change can be finished and saved once the signal is back; You's settings save as they change, so they are disabled. The badge is filled, grey or the warning colour, as a pale grey was lost against the shark, and the draft strip's line is darker than muted, for 4.5:1 at 13px. The copy says “this phone” on desktop too, as the boards and the rest of the app do.

Deferred, or to watch:

- To check on the phone: offline cold launch of the installed app, the Home Screen name from `SHYLOG_APP_NAME` (`apple-mobile-web-app-title`), the status bar in both themes (left as the default style), the soft blur under the status bar on a cold launch, whether iOS grants persistence to the installed app, and launch time and bytes before and after (the 2 November note: ~886 KB raw, 35 critical files without the worker).
- Milestone 19: the reload offer, Save waiting dives to a file on the sync card, and the `schemaVersion` gate's update offer (the badge and card already say Paused, with “Reload Shylog to update”). The existing reload toast now calls `reloadApp()` in `src/pwa.ts`, which lets a waiting worker take over (a plain reload would get the cached app again), waiting for a version still downloading to install however slow the link. `onNeedReload` reloads only the window that asked: by default `registerSW` reloads every open window once a new version takes over, an open form included, and the others keep their loaded code until the next launch.
- A renamed instance (`SHYLOG_APP_NAME`) keeps its old title and Home Screen name on installed phones until an image with new code replaces the cached page.
- The built stack’s production build runs in every e2e shard (a few seconds each); a run that names spec files without a `@built` test (a single spec, CI's repeats) skips it. Split it out of the shards only if they slow down.
- To watch on the phone: the strip and note folds’ frame rate, WebKit’s scroll anchoring with a note folding in, and the storage sheet on a Home Screen install.
- Carried over from milestone 17: Clear filters re-rendering the Log; a second computer's file adding shared dives again; the native day picker, `.uddf` file picker, sticky review footer and "Back" label to check on the phone; a long first-import review list; from milestone 16 and earlier as listed there.

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

- [x] Update flow
- [x] Queue export file
- [x] Sync end-to-end tests
- [x] Two-device Playwright test

**Notes for the next session** (written 9 November 2026, branch `feat/update-flow`, stacked on `feat/offline`)

Decisions taken while building:

- D56 (the owner's choices): the reload offer is a toast on every tab, held back over the dive form, the import steps and any form or sheet with unsaved edits (`useHoldUpdate` in `src/update.ts`, called by the entity detail, new entity, card sheet, dive picker and You's name, maximum PO₂ and defaults), the newer server's paused offer included. It waits for drafts still to upload, counted live from the queue (`useQueueCounts` in `data/drafts.ts`, one Dexie `liveQuery` per queue, which sees other tabs), not from the tab's log copy. Swiped away, it stays away until the next launch; Reload keeps the toast up until the page reloads, and works in a window whose new version another window already let take over. You's sync card gets Reload in Try again's place when syncing is paused. Save waiting dives to a file is the row under You's sync card (`you/sync-card.tsx`, not `routes/settings/`), writing `shylog-waiting-dives-<date>.json` with each draft, refused ones included, as an `/api/ops` body.
- D57 (the owner's choice): a draft remembers every optional field it has held (`held`) and sends those it has lost as `null`, which `draftDiveFieldsSchema` accepts; the server clears them on a dive whose first reply was lost and ignores them on a new one, so a field cleared offline is cleared, and an edit made elsewhere to a field the draft never held survives.
- Sonner: a toast re-created under an id still in its 200 ms exit inherits the removal, and `onDismiss` fires for the app's own dismissals, so each showing gets a fresh id (the same one while it is up, so ready turning to paused updates in place) and the take-down waits a tick, which React's double effect cancels. Its `mobileOffset` applies only below 600px, so placement is `--toast-bottom` in `index.css`, switched at `desk:`; on the Log it rises above the floating button (`:root:has([data-fab])`), and on a desktop it centres on the content beside the sidebar. A toast with a second line has 12px above and below it (the owner's request).

Deferred, or to watch:

- To check on the phone: the update toast after a deploy on the installed app and Reload taking the new version, the `application/json` share sheet for the waiting dives file, and toasts above the Log's button in portrait and landscape.
- The update toast drops 63px over the dive form for a few frames before it is taken down, as the button's lift ends with the Log; a fix would tie the toast to the router.
- With two tabs open, the sync card's title follows the tab's own log until it syncs, while the row and the offer follow the queue.
- Carried over from milestone 18: the phone checks listed there (offline cold launch, Home Screen name, status bar, cold-launch blur, persistence, launch time and bytes, fold frame rates), a renamed instance's old Home Screen name, and the built stack's build in every shard; from milestone 17 and earlier as listed there.

## Milestone 20: Logging

**Goal**: the server's log says what happened, one JSON line per event on stdout, so a shipper can put it in Loki and someone (or an agent with Loki access) can follow a problem from the phone's request to the server and back.

**Implements**: Server (Logging), Endpoint `POST /api/client-log`, Build order step 10. Decided with the owner on 2 November 2026: pino; `/api` requests only, with the polled `/api/version` and `/api/health` at debug; the phone's errors in the same log; Shylog writes stdout and a README note, and the shipper's configuration lives with the home server, not in this repo.

**Touches**: `apps/server/src/log.ts` (the pino logger with `instance` and `version`, error serialising, redaction), a request-log middleware in `app.ts` (request id from `X-Request-Id` or a new one, echoed in the response, a child logger on the context), the nightly job, integrity, `onError`, refused writes (`Rejected`) and the security checks, `apps/server/src/routes/client-log.ts`, `apps/web/src/api/client.ts` (an `X-Request-Id` on every call), `apps/web/src/data/client-log.ts` (reporting the app's errors), `README.md` (logs and example LogQL queries), tests. The `console.*` calls in the server's long-running code move to the logger; the CLI keeps printing for a person.

**Acceptance**

- `log.test.ts`: each line is one JSON object with `time`, `level`, `event`, `msg`, `instance` (`TS_HOSTNAME`) and `version` (the build's commit, `dev` off a build); an `Error` logs its message, stack and cause; fields for dive contents (notes, names, animals, gear, a request or response body) are never written; development prints readable lines through pino-pretty, and tests can capture lines.
- `request-log.test.ts`: every `/api` request logs method, route pattern and path, status, duration in ms and request id once it ends; the response carries `X-Request-Id`, the app's when it sent a valid one; `/api/version` and `/api/health` log at debug and static files not at all; a 500 logs its error under the same request id; a refusal (403 from the security checks, 4xx from `Rejected`, 503 while writes are paused) logs its reason at warn.
- `nightly.test.ts` (extended): a snapshot logs its file size and duration and an export its dive count, size and duration, at info; a failure logs at error with the stack.
- `client-log.test.ts`: `POST /api/client-log` takes the app's error report (kind, message, stack, the request id and route it failed on, the app's version), drops anything outside its Zod schema, cuts the message to 2 KB and the stack to 8 KB, answers 429 past 30 reports a minute, needs the Origin and JSON content type like any write, and writes nothing to the database or the journal.
- `client-log.test.ts` (web): a failed sync, a rejected draft, a lazy chunk that failed to load, a `window` error and an unhandled rejection each post one report carrying the failed call's request id where there is one; the same error repeated within a minute is sent once; a report that can't be sent is dropped, never queued.
- README: where the logs go, that any Docker log shipper picks them up, the fields, and a few LogQL queries (errors for an instance, one request by id, slow requests).

**Not in this milestone**: metrics, tracing, alerting, and the Alloy or Loki configuration, which belongs to the home server's own setup.

- [x] Logger with instance, version, error serialising and redaction
- [x] Request log with request ids, quiet polls
- [x] Nightly, integrity, refusal and error lines
- [x] `POST /api/client-log` and the app's error reports
- [x] README note and LogQL examples
- [x] Tests listed above

**Notes for the next session** (written 11 November 2026, branch `feat/logging`)

Decisions taken while building:

- pino 10 writes level names and ISO times, without pino's `pid` and `hostname`. `instance` and `version` come from a mixin over a module variable that `configureLog` replaces, not pino's bindings (a second call appended duplicate keys, and returning a shared object leaked one line's fields into the next). A request's id travels in AsyncLocalStorage (`duringRequest`), so any line logged during it carries `requestId`.
- Debug only in development; no level setting. At debug: `/api/version`, `/api/health`, an accepted `/api/client-log` report's request line, and the report limit's 429s.
- Refusals log `Rejected.logged`, which is the message unless it names something: the two name-collision messages and a refusal failing an import chunk log a generic reason. The request line's `route` is the pattern of the handler that answered, null when a middleware refused.
- Request ids match `requestIdPattern` in core's `ids.ts`, and the app makes them with core's `uuid()`, as `crypto.randomUUID()` needs a secure context.
- `/api/client-log` is registered before the integrity pause, so reports still arrive while saving is paused, and its rate limit runs before the body is checked. The app reports failed syncs and uploads (no answer, including a body cut off mid-download, is Can't reach and not reported), refused drafts by id without the reason, lazy chunks (`preloadable`, the chart loader), screens caught by an error boundary (React's `onCaughtError`: TanStack's `defaultOnCatch` never runs without a route error component), and window errors and unhandled rejections. One message is sent once a minute; nothing is sent offline or queued.
- The CLI writes the server's lines to stderr. Server tests drop log lines except errors and read them with `captureLog()` (`test/log.ts`); web tests stub `reportError` and `startErrorReports` in `src/test-setup.ts`, and `client-log.test.ts` unmocks them.

Deferred, or to watch:

- The owner's call: a server answering 5xx to `/api/log` still shows Can't reach and retries every few seconds, as before this branch.
- On the server after deploying: the JSON lines in `docker compose logs app`, Docker's log rotation (`log-opts`), and a shipper such as Alloy, configured with the home server.
- Any message an uncaught error carries goes in its report; no current path rejects with a site name unhandled, so keep content-bearing errors handled.
- Carried over from milestone 19: on the phone, the update toast after a deploy on the installed app, the `application/json` share sheet for the waiting dives file, toasts above the Log's button in portrait and landscape; the update toast's 63px drop over the dive form; a second tab's sync card title; from milestone 18 and earlier as listed there.

## Milestone 21: Direct download from the dive computer

**Goal**: with the watch on its USB cable at the home server, the Import screen offers to download it, and the dives newer than the last confirmed download go into the usual review, so the Subsurface step goes away. The UDDF upload stays.

**Implements**: Subsurface import (Downloading from the dive computer), Instance configuration (Dive computer cable), Build order step 11, decision D51.

**First, a spike on the server** (before any code): a throwaway image with `dctool` from a pinned libdivecomputer release, which the owner runs on the home server with the D4i and then the Zoop Novo. It confirms that the cable appears (and the udev rule's fixed name), that a container started before the cable was plugged in can open it as the image's user, the family name `dctool` wants, how long identifying the watch takes, and that a full raw download and `dctool parse` both work. Most of all it checks that the downloaded dives get the same fingerprints as in the Subsurface fixtures (`fixtures/subsurface/d4i-2026-10-12.uddf` and `zoop-novo-2026-11-01.uddf`) for the dives both hold. The raw downloads and their parsed XML become fixtures. If the fingerprints differ, the rule is settled with the owner before going on.

**Then a mockup**: the Import screen, built around a Detect dive computer button (the owner's choice, 11 November 2026, over detecting in the background): no cable, looking for the watch, no watch answering, the detected computer's card (its picture, its model as the watch reports it, when it was last downloaded, Download dives), downloading, no new dives, a different watch, failed. The pictures are the owner's own, in `apps/web/src/assets/dive-computers/` (`d4i.png`, `zoop-novo.png`, 800 px square on solid white, so dark mode needs a cut-out or a light tile), chosen by the model the watch reports; those are the only two computers supported. A watch that isn't answering takes several seconds of `dctool`'s retries (six packets at a 3 s timeout), so time it and shorten it if `dctool` allows. Discussed with the owner before any UI is built; suggestions welcome.

**The computer's own stops** (added 9 November 2026 from issue #80, updated 10 November after a raw download of the D4i):

- The D4i doesn't log the recommended stop. A raw download of all 93 of its dives through `dctool` 0.9.0, patched to report the stop events, has no recommended-stop marker and no sample in the `safety` state, so a download can't replace the detected stop and every dive keeps the rule, shown as calculated. The Zoop Novo is the same (the spike's 69 dives: 20 mandatory stops, no recommended one).
- It does log mandatory stops. One begins when an ascent-rate alarm makes the stop mandatory, at any depth (44.8 m on one dive), and ends about 30 s after the diver reaches the band. 42 began and 34 ended across the 93 dives.
- **The owner's choice**: a downloaded dive records the moment its stop becomes mandatory, as a computer event. How Events and the chart show it is proposed when built.
- Stock libdivecomputer gives only the `deco` sample state from that moment, to within a sample (10 or 20 s on the D4i), and the same state for real deco. The exact second, told apart from deco, needs the begin event that upstream has suppressed since 2017: issue #80's three-line patch to `suunto_d9_parser.c` in the image's build, or an opt-in upstream. The patch is the likely choice, as the image builds libdivecomputer from source anyway.
- The conversion to UDDF has to carry the event, as a `deco` alarm or in `<shylog>`, settled when built.

**The spike's results** (11 November 2026: the D4i's 10 November download, then both watches on the home server through a throwaway image of `dctool` 0.9.0 on the app's base image, user and hardening, plus #80's patch):

- Fingerprints match on every dive both sources hold: 66 on the D4i and 61 on the Zoop Novo, once the duration is Subsurface's own (`fixup_dc_duration`: time below 0.75 m, core's `underwater()`) rather than the parser's dive time, which differs by a few seconds on most dives. Start time, maximum depth and the average depth from `underwater()` match as they are.
- The cable: the udev rule's `/dev/suunto` appeared in a container started before it was plugged in, through a read-only bind of the host's `/dev` with the `c 188:* rmw` cgroup rule, and the image's `node` user opened it through the host's `dialout` group (gid 20) with no capabilities. `dctool -d "Suunto D4i"` and `-d "Suunto Zoop Novo"` name the watches; the driver reads the real model and serial from the watch.
- Times: a full read took 23 s for the D4i's 93 dives and 16 s for the Zoop Novo's 69; with the cache's fingerprint, a read with nothing new took 1.0 s and 0.4 s. Every raw dive parsed.
- Failures differ: the watch off the cable times out after six unanswered packets ("Failed to identify the protocol variant"), and the cable unplugged fails to open `/dev/suunto` ("No such file or directory").
- A raw dive file holds no serial number (only `dctool`'s cache name and verbose log do), so raw downloads can be fixtures, keeping out other people's dives.
- Both watches hold other people's dives below their owner's (the owner, 11 November 2026): the D4i 24 from June to November 2022, its previous owner's, and the Zoop Novo 7 from 2019 to 2021, not the second diver's. libdivecomputer's fingerprint for these watches is the dive's start time on the watch's clock (`E607060C0B0C11` is 2022-06-12 11:12:17), so the first download from a watch starts at the newest dive already imported from it and never reads them. "Read every dive again" puts every dive older than that marker and not yet imported in the left-out list, as freedives are, with a reason such as "Before your last download": fingerprinted unless included, so they stay out, and a dive skipped in an earlier review is found there and included (the owner's choice over a separate "not my dive" option). A watch nothing was imported from yet offers its first download whole, to be unticked once; the exports can't say which dives came from which watch, so nothing smarter is reliable.

**Likely touches**: the `Dockerfile` (a stage building libdivecomputer with serial support only, pinned, with its licence), `compose.yml` (the device rule, the `/dev` view, the serial group), env parsing, a server module running `dctool` (one download at a time, with a timeout) and converting its output to UDDF for `storePreview`, a migration for the remembered computer and its download marker, routes, apply moving the marker, the Import screen and Forget on You, the README (udev rule and Compose), the image smoke test, tests.

**Acceptance**

- The conversion: for every dive both sources hold, the converted download read by `readUddf` matches the Subsurface fixture (start, duration, max depth, fingerprint, samples, events, gas, and which dives are freedives or under five minutes), with each difference asserted and explained; the model reads as Subsurface's does, so screens say "your D4i"; the UDDF has no `uddfSchemaErrors`. For both computers.
- Running `dctool`, against a fake in tests: a second download while one runs is refused; a watch that stops answering times out; no cable, no watch and a failed read each give their own error.
- The routes: the states (turned off, no cable, no watch, connected and named); the first download remembers the serial, and a different watch is refused with nothing stored; Forget clears it; the raw download is kept in the data directory; a later download asks only for dives after the marker; the marker moves only on apply, never on discard or a failed apply; reading every dive again still skips what is imported.
- Playwright, with the fake: from the Import screen a download reaches the review, applies and finishes, in whatever form the mockup settles.
- The published image runs `dctool` and parses a raw fixture to the same XML as the fixture.
- README: the setup steps take a new server from nothing to a working download, alongside the existing deploy steps: the udev rule and how to check the cable shows up under its fixed name, the serial group's id on that host, the env var that turns downloading on for an instance, which instances get it when several share one server, that the cable can be plugged in after the containers start, and what to check when Import doesn't see the watch. The same pass fills the gaps a new deployment hits today (the owner's choice, 11 November 2026): the prerequisites (Docker with Compose v2, git, a Tailscale account, and where `TS_AUTHKEY` comes from), an example tailnet policy restricting each instance to its diver's devices, and a pointer on covering `/srv/shylog/` with an off-site backup. How updates run is left to each owner, so the README gives the update command but no timer (the owner's choice, 12 November 2026). The owner follows them on the home server.
- On the server and phone (the owner): plugging the watch in after the containers started shows it on the Import screen; a download with nothing new says so; a new dive opens the review.

**Not in this milestone**: downloading on plug-in without a tap, writing to the watch, Bluetooth computers, libdivecomputer in the browser, and computers other than the D4i and Zoop Novo.

**Research notes** (8 November 2026; findings for the spike and the build to confirm, not decisions):

- Support: libdivecomputer lists the D4i as Suunto D9 family model 0x19 and the Zoop Novo as 0x1E and 0x1F (two hardware revisions, handled alike), serial only, upstream and in Subsurface's fork ([descriptor.c](https://github.com/libdivecomputer/libdivecomputer/blob/master/src/descriptor.c)). The driver reads the real model from the watch, tries 115200 baud before 9600 for these models, and both share one memory layout ([suunto_d9.c](https://github.com/libdivecomputer/libdivecomputer/blob/master/src/suunto_d9.c)). Forum reports blame failed Suunto downloads mostly on a low battery or a badly seated cable. Upstream's latest release is v0.9.0 (30 June 2025); a tagged upstream release is the natural pin, as both models are the same in the fork.
- The cable: Suunto's USB interface (D-series, Zoop Novo, Vyper Novo) is FTDI 0403:f680, which Linux's `ftdi_sio` lists ([ftdi_sio_ids.h](https://github.com/torvalds/linux/blob/master/drivers/usb/serial/ftdi_sio_ids.h)), so it appears as `/dev/ttyUSB*`. A udev rule such as `SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="f680", SYMLINK+="suunto", MODE="0660", GROUP="dialout"` gives it a fixed name. The spec's old flow said the watch may need waking or switching to transfer mode; the spike finds out.
- Building: Debian dropped libdivecomputer in 2017 and Ubuntu has had none since 16.04, so it is built from source. Autotools installs `dctool` by default, and `--without-libusb --without-hidapi --without-bluez` leaves serial only ([configure.ac](https://github.com/libdivecomputer/libdivecomputer/blob/master/configure.ac)).
- `dctool`: `download` takes `-f raw|xml`, `-o`, `-p <fingerprint>` and `-c <dir>`, a cache keeping the newest dive's fingerprint per serial; raw output is one file per dive, whose name can carry the fingerprint (`%f`), number and time. `parse` turns saved raw files into XML offline, given the family and model ([dctool_download.c](https://github.com/libdivecomputer/libdivecomputer/blob/master/examples/dctool_download.c), [dctool_parse.c](https://github.com/libdivecomputer/libdivecomputer/blob/master/examples/dctool_parse.c), [output_xml.c](https://github.com/libdivecomputer/libdivecomputer/blob/master/examples/output_xml.c)). The family string (probably `suunto9`) comes from `dctool list`.
- Fingerprints: the D9 family's is 7 bytes, the dive's date and time from its header. The download walks the memory newest first and stops at a match, and the serial number is read from the watch ([suunto_common2.c](https://github.com/libdivecomputer/libdivecomputer/blob/master/src/suunto_common2.c)). Subsurface keeps one per model and serial and reuses it only while that dive is still in its log ([libdivecomputer.cpp](https://github.com/subsurface/subsurface/blob/master/core/libdivecomputer.cpp)).
- What the parser gives ([suunto_d9_parser.c](https://github.com/libdivecomputer/libdivecomputer/blob/master/src/suunto_d9_parser.c)): dive time, max depth, one gas mix and the dive mode (open circuit, gauge, freedive); samples of depth, temperature, tank pressure when present, and deco and safety-stop status; events such as ascent, surface, safety-stop ceiling and bookmark. No average depth, temperature summary, tank, or anything typed in.
- Why UDDF: preview and apply both read the stored file again with `readUddf` (`apps/server/src/import/preview.ts`, `apply.ts`), and each imported dive's fragment, which `import_raw` and the export's pass-through need, is a UDDF element. Converting to UDDF reuses the whole import.
- Where the conversion has to match Subsurface's export, since the import's rules were written against it: the freedive rule's signs (no tank data and no gas, `apps/server/src/import/freedive.ts`; libdivecomputer's freedive mode may or may not be how those dips were recorded), average depth and the temperatures worked out from the samples, the D4i's ascent alarms as start and end pairs and its surfacings, and the model string. Subsurface's placeholders won't appear in a download at all.
- Docker: `--device` binds only devices present when the container is created, and Docker advises a cgroup rule for ephemeral ones ([docker run](https://docs.docker.com/reference/cli/docker/container/run/), [Compose services](https://docs.docker.com/reference/compose-file/services/)): `device_cgroup_rules: ['c 188:* rmw']`, 188 being USB serial converters ([devices.txt](https://www.kernel.org/doc/Documentation/admin-guide/devices.txt)), plus the host's `/dev`. Untested with the app's hardening (read-only root, no capabilities); the spike checks it.
- Licence: the FSF lists LGPL-2.1 as compatible with GPLv3 ([licence list](https://www.gnu.org/licenses/license-list.html)); the image ships its licence text and says where its source is.
- No Node binding: `libdivecomputerjs` (last release April 2024, archived June 2026, no serial support mentioned) and `divecomputer.js` (an empty port from 2022).

- [x] Spike on the server with both computers
- [x] Raw downloads and their parsed XML saved as fixtures, without other people's dives
- [x] Import screen mocked up and agreed
- [x] `dctool` in the image, the cable reachable from the container
- [x] Download, conversion and the remembered computer
- [x] Import screen and Forget
- [x] The moment a stop becomes mandatory, recorded on downloaded dives
- [ ] README setup steps for the cable, followed on the home server
- [x] Tests listed above

**Notes for the next session** (written 11 November 2026, branch `feat/dive-computer-download`, built while the owner was away, so every judgement call below is theirs to review)

Decisions taken while building:

- The conversion copies Subsurface where its export differs from dctool: `fixup_dc_events` drops an event repeating one of the same name and flags within 60 s (the first event is never compared, and a new event goes after others at its second), each event between samples gets its own waypoint at the depth between them, and a temperature is written only where it changes. Three differences remain, all in those event waypoints, asserted in `convert.test.ts`: a centimetre off in a few, extrapolated past the last sample by Subsurface's older stylesheet, and a waypoint for each mandatory stop's begin and end.
- A mandatory stop is a `mandatory-stop` event from begin to end, written to UDDF as a pair of `deco` alarms and read back as one from a download, or from Shylog's own export, which lists each stop's seconds in `<shylog>`; another tool's `deco` alarm stays a single `deco` event. Dive detail draws a red vertical line with a hand-stop icon where it became mandatory, and Events lists that moment and its clearing (the owner's choice, 12 November 2026; a span line along the top and a red stretch of the depth line were offered). No band, as it can span most of the ascent. Each dive keeps the number of Events rows they take (`mandatory_stop_events`, in migration 10) so the card reserves them. libdivecomputer's violations aren't converted (neither watch reports one).
- Detect starts a download and cancels it (SIGINT) as soon as dctool names the watch; a watch silent for 8 s isn't there. A download first identifies the watch, so another diver's is refused before any dive is read, then runs `dctool download -p <marker>`, then parses 4 dives at a time. A port another instance holds says the cable is busy. Each download keeps its raw files and their XML in its own folder under `downloads/`.
- The first download remembers the watch even with nothing new; the marker (a start on the watch's clock) moves only on apply, and before any apply it is the newest dive imported from that model. A dive before the marker that passes the same-dive test with a hand dive pairs, as a short one does; otherwise it is left out as "Earlier".
- Compose: the cable is an opt-in `compose.dive-computer.yml` (via `COMPOSE_FILE` in the env file), binding the host's `/dev` read-only at `/host/dev` without its submounts, so the host's terminals never reach the container (a recursive `/dev:/dev:ro`, as the spike used, would have exposed `/dev/pts`), and a dedicated `suunto` group, so no other USB serial device opens for the app. Needs Docker Engine 25+.
- Its state (on, and the remembered watch) loads at launch and is kept on the phone, so the watch never pops in above the upload. The Import screen was settled from four mockups (12 November 2026, the owner's choice of B): the watch leads with no card (its 216 px picture with no edge in light mode, a 22 px title, the progress bar under it), its buttons in the bottom bar on a phone with Read every dive again above Download dives, and under the watch with a mouse; the tab bar drops its line while that bar shows, as before. The upload is one row (a grey tile with the file icon, Import a Subsurface file, File › Export › UDDF, a chevron), greyed in place offline and during a download, where it also carries the screen's offline mark; Getting the file's steps are gone. Last import is a card of counts two to a row (paired and new in the text colour, already imported and left out muted, none left out, included dives counted as new), sized so already imported just fits a 390 px phone, with the day beside its heading; Done keeps the summary rows. An instance without the cable shows the same screen with no watch (the owner's choice). Forget is a row under You's Dive computer, with a confirm sheet. The Import screen holds its review banner during a download, as during an upload, so the new preview doesn't flash it. The import progress bar is now linear (the upload's too). While dctool reads the watch, the card's bar fills with its progress (`GET /api/dive-computer/progress`). The pictures are 320 px WebP copies of the owner's PNGs.
- The schema version is 10 (`dive_computer`), so an app from before this branch stops syncing until it updates, as designed.
- Mandatory stops for the dives already imported from Subsurface come from a manual step, not the app (the owner's choice, 12 November 2026; filling them in during any download was offered): `scripts/mandatory-stops.sh <instance> [--dry-run]` reads the watch whole and adds the stops to matched dives that have none, journalled as `addMandatoryStops`.
- Review (12 November 2026): one download holds the cable from opening the watch to its preview, and the mandatory-stops command for its whole read, so a second download or Forget answers busy until it ends; before, the lock ended once the cable was read and a second download during the parse could remember another diver's watch. The read's progress clears when the read ends, so the bar fills while the dives are matched. A parse has a 30 s timeout. A remembered watch with nothing applied says "Nothing imported from it yet". Done counts dives from before the last download under Left out, with freedives and false starts. Reading Shylog's own export skips one deco alarm per stop second, so another tool's deco alarm there is kept. The Mandatory stop row has no figure on the right: the span to its clearing was mostly the ascent, as the watch logs no time at the stop itself, so it read as a meaningless time (the owner's call).

Deferred, or to watch:

- On the home server (the owner): follow the README's Dive computer cable steps (the `suunto` group replaces the spike's `dialout`, and `/host/dev/suunto` replaces `/dev/suunto`), confirm `COMPOSE_FILE` from the env file takes the override (`docker compose --env-file … config`), plug the watch in after start, check a download with nothing new says so and a new dive opens the review. Nothing Docker-related has run outside CI.
- On the phone: the Import screen's states, its bottom bar, and Forget's sheet; on a 375 px phone already imported wraps in Last import.
- The owner's: whether "Last downloaded" should move on a download that found nothing new. It moves only on apply now; moving it on every read needs a journalled write per download.
- On the phone: the held-press tint's 90 ms wait and quick-tap flash, a pen's press, and no long-press menu on the watch picture.
- Carried over from milestone 20: a server answering 5xx to `/api/log` still shows Can't reach; after deploying, the JSON lines, Docker's log rotation and a shipper. From milestone 19: the update toast after a deploy on the installed app, the `application/json` share sheet for the waiting dives file, toasts above the Log's button in portrait and landscape; the update toast's 63px drop over the dive form; a second tab's sync card title; from milestone 18 and earlier as listed there.

## Milestone 22: Statistics, figures and charts

**Goal**: the Statistics screen shows every figure and chart in the spec's table for the chosen year, lazily loaded, cached until the log changes, with the early-days states.

**Implements**: Statistics (table, Records and milestones, Early days, Averages, SAC rate trend), the lazy chunk rule, decision D24. Screens: `StatsHifi` (all cards except Patterns), `StatsEmptyHifi` (2 dives and no dives).

**Touches**: `apps/web/src/stats/` (lazy chunk: `figures.ts`, `charts/`, the SAC trend on shadcn charts and the rest plain markup (D60), `stats-screen.tsx`, table alternatives), `apps/web/src/stats/cache.ts` (keyed by the in-memory log, the year and the day), tests.

**Acceptance**

The figures below were worked out before the Import milestones. Milestone 14 grows the seed's sample reader into the full reader, which can change what the seed stores (temperatures from the samples, D10; the computer's average depth), so re-derive them against the seed before writing the tests.

- `figures.test.ts`: on the seeded fixture (42 scuba dives), totals, deepest (dive 54, 42.3 m), longest (dive 50, 72 min), plain-mean average depth and duration, dives per month for 2026 and per year, depth bands (0 to 10, 10 to 18, 18 to 30, over 30), time of day (before 11:00, 11:00 to 14:00, 14:00 to 18:00, after 18:00); average SAC is duration-weighted and drops 0.1 L/min or less, with the plain median, sample standard deviation and best and worst dive beside it; regions leave out sites with no region; nitrox share (four of the 42 dives); marking a dive ignored removes it from every figure and chart (D23).
- `records.test.ts` (D24), all time on the seeded fixture unless stated: coldest dive 72 (12 °C), warmest dive 1 (25 °C, tied with dive 2, so a tie goes to the earlier dive; not dive 5, whose maximum of 29 °C is the highest); total depth descended 735.9 m, worded "You've descended Lion's Head" with "89% of the way to the Burj Khalifa"; synthetic totals for below the first rung (a share of the Leaning Tower of Pisa), exactly on a rung, "twice" and "3 times", and past the last rung; the landmark list is strictly ascending; longest streaks of 6 days (17 to 22 July 2026) and 4 weeks (4 to 25 April 2026), two dives on one day counting once, and a running streak marked as such; anniversary "7 years 8 months diving, since 10 Feb 2019" with the clock at 19 October 2026, the "today" wording on 10 February, months under a year, unchanged by the year filter; an ignored first dive moves the anniversary to the next dive.
- `trend.test.ts`: the rolling average of the last five dives, only dives with a SAC and not ignored, in date order.
- `stats.spec.ts`: the year chip switches every figure; below five dives the screen shows totals, records and the "More after 5 dives" progress; with no dives the empty state and "Log a dive"; each chart has a table alternative; the chunk is separate in `dist`, not loaded on the Log, precached by the service worker and works offline; `pointerdown` on the Stats tab starts loading the chunk (`preload="intent"`), so a tap doesn't wait on it.
- Tap-to-content time for Statistics on the owner's phone, first visit and cached, is recorded in the notes against the performance target.
- Screenshots of Statistics (2026 and all time), the 2-dive and 0-dive states at 390 px against the boards.

**Not in this milestone**: patterns (milestone 23).

- [x] Figures with the Subsurface averaging rules
- [x] Records and milestones: coldest and warmest, depth descended against the landmark ladder, day and week streaks, anniversary (D24)
- [x] Charts: dives per month or year, SAC trend, depth bands, conditions bars, weather and surface, time of day, gas, entry, sites, buddies, regions, tags
- [x] Early-days and empty states
- [x] Cache keyed by the in-memory log, year and day
- [x] Tests and screenshots listed above
- [x] Tap-to-content under the performance target on a production build
- [ ] Tap-to-content timed on the owner's phone

**Notes for the next session** (written 13 November 2026, branch `feat/statistics`, draft PR #95)

Decisions taken while building (D60 has the owner's):

- The seeded figures matched this milestone's acceptance as written (42 dives, deepest 42.3 m, 72 min, 12 and 25 °C, 735.9 m and "89% of the way to the Burj Khalifa", 6 days and 4 weeks, 7 years). Landmark progress rounds to the nearest per cent, capped at 99 %; past the last rung it counts towards the next whole time.
- A day streak runs if its last day is today or yesterday, a week streak if its last week is this week or last; a streak of one day or week isn't shown, and one shown alone takes the row. Ties keep the earlier record or streak.
- Visibility in metres joins the rating as Patterns groups it (under 5 m low, 5 to 10 m average, over 10 m high), with an info icon beside the Visibility label saying so (the owner's choice, issue #97, over the board's info line under the strip). Rates of 0.1 L/min or less leave the trend as well as the average. Conditions in the water are shares of every dive, with a hatched Not logged; weather and surface shares of the dives that logged them; a row with nothing logged is hidden, and so is a section with no rows. Choices with no order of their own (weather, surface, time of day, entry) shade by rank, the most common in the accent; ordered ones (current, surge, visibility, workload) ramp with the level. Time of day answers "Mostly mornings", names two times tied at the top ("Mornings and midday"), and says "Spread through the day" for three or more.
- Sites, buddies (not dive professionals) and regions list every one, three until Show all, every row tied for the most in the accent.
- The SAC rate axis pins a rate over three interquartile ranges above the upper quartile, and over twice the median (a few equal rates have no spread), as a caret on the top edge; its ticks are the widest of 20, 10, 5 or 2 L/min giving two, and its top always fits the five-dive average. The time axis is cropped to the rated months in a year too, labelling at most four round months, with the year on the first and on each January for all time, or years once months would crowd. The spread's curve is the dives expected in a 1 L/min window, so a tight spread can't tower over the bars, and it shows from five rated dives whose deviation rounds above 0.0.
- Back to Statistics from a record, site, buddy or region returns to the same scroll, with the rows it had opened (Distribution, answers, Show all) open at once: the router's own restore ran before the sections below the records rendered, so it landed short. Kept per history entry, in memory.
- Thermal comfort uses StatsHifi's own muted colours as `--stats-*` tokens in `index.css`, light and dark, as no Tailwind colour matches them. In dark mode Very cold stays the deeper blue and Cold the paler, as in light (the owner's request; the board swaps them). Gas uses Tailwind's sky-300 for air and lime-400 for nitrox (the owner's choice over the board's muted pair). The rest are accent tints, rising to the accent from a faint floor: a 30% tint in light mode and Tailwind's cyan-800 in dark, where a 30% tint all but vanished on the card (the owner's choice).
- A record opens its dive with a `fromStats` history state: its Back link says Stats and the Stats tab returns to the year. A tag opens the Log filtered by tag and year, replacing Statistics. The year chip uses the Log's year menu (`FilterMenu`), and the year follows a painted frame after the pick, so the menu closes first.
- Statistics shows the Log's Update Shylog and Can't reach screens before there is a log (`components/no-log.tsx`). The copy no longer mentions patterns until milestone 23 builds them; it should say so again then.
- The figures' unit tests sync a server seeded with the D4i fixture through the app's own sync (`stats/seeded-log.ts`, Vitest's node environment).

Deferred, or to watch:

- **Load time:** opening Statistics took about 550 ms with 42 dives and 2.5 s with 630 (production build, full CPU). Recharts' `CartesianGrid` laid out an X tick per dive to place vertical lines it doesn't draw, measuring each label in the DOM, and every measure was a whole-document restyle through the root `:has()` rules in `index.css`. An empty `verticalCoordinatesGenerator`, plain `<text>` ticks and `interval={0}` on the Y axis took it to no measuring at all. The tables' rows, the SAC chart (drawn once at its measured width) and everything below the records now render a painted frame after the screen, behind placeholder cards: first open about 100 ms and a re-open under 60 ms at full CPU on either log; at 4x CPU 257 ms and 63 ms with 42 dives, 1 s and 113 ms with 630. Precomputing the figures while the Log is idle would cut a big log's first open further, if the phone needs it. The root `:has()` rules still restyle the whole page on any DOM change elsewhere (a held press too).
- On the phone (the owner): the year menu, a record's Back, the tag link, the chip's touch area, long presses on records and tags, the expanding rows (Distribution, Conditions, Habits, Show all) and their press tints, a site, buddy or region's Back to Stats, the count's roll, and tap-to-content timings, first visit and cached.
- The owner's: whether the Log and Statistics tabs keep their filters when tapped again or left and come back to (both drop them now).
- A tag's count leaves out ignored dives, which the Log it opens still lists. The desktop sidebar lights Log on the edit form of a record's dive, as it already does for dives from You. Every held press restyles the whole document in Chromium through the same root `:has()` rules; whether WebKit pays it needs the phone.
- Carried over from milestone 21: the README's cable steps followed on the home server, the Import screen's states and Forget's sheet on the phone, whether Last downloaded moves on a read with nothing new; and from milestone 20 and earlier as listed there.

## Milestone 23: Statistics, patterns

**Goal**: the Patterns section shows the top three findings that clear the bar from the full catalogue, with an All patterns list and a drill-down.

**Implements**: Patterns (Computing, Rule types, Catalogue, The bar, Choosing and showing), decision D61.

**Touches**: `apps/web/src/stats/patterns/` (`rules/` one file per rule type, `catalogue.ts`, `score.ts`, `wording.ts`, `patterns-card.tsx`, `all-patterns.tsx`, `pattern-detail.tsx`, named as the rest of the app's files are), the All patterns route, tests with synthetic logs.

**Acceptance**

- `rules.test.ts`: a Difference rule needs five dives per group and finds the best adjacent-level split; a Threshold rule scans whole-number cut-offs and words "4 of 5 dives" when not all match; Change compares with the previous year or the two halves of the log; Trend uses a linear fit; Habit needs 60% over ten dives; Season needs a region and month; Records always qualify; minimum effect sizes per measure as listed; ignored dives never enter a group or a record (D23).
- `score.test.ts`: score is effect over minimum times √(smallest group); ties break by rule id; the top three has at most one per measure and one per field and never a record or a habit (D61).
- `wording.test.ts`: describes rather than explains ("is higher in", never "because of"); numbers rounded as elsewhere.
- `patterns.spec.ts`: a seeded log that supports two patterns shows exactly those two; All patterns groups by measure; tapping a pattern shows its groups in place; with none qualifying the section is hidden.

**Not in this milestone**: new rules beyond the catalogue; this closes the Statistics step and v1.

- [x] Rule types
- [x] Catalogue of measures and fields
- [x] Bar, scoring, selection
- [x] Wording, All patterns, the groups behind each pattern
- [x] Tests listed above

**Notes for the next session** (written 14 November 2026, branch `feat/patterns`)

Decisions taken while building (D61 has the owner's):

- The spec's catalogue left the other rule types' inputs, the choice measures' outcomes and the fields' splits open; they are now under Catalogue in the spec. Ordered fields split at each boundary of the levels the dives have, others set one value against the rest, people, centres, trips and tags compare the dives with them against those without. The Unknown site is never a group or a habit, but its dives count.
- Pattern averages of SAC rate are weighted by duration, as Air consumption's is, so the figures agree. A sentence's figure is the difference between the rounded figures shown under it, never the raw one (it said 4.4 where the rows showed 20.4 and 16.1).
- Trends fit along the dives in order, as the SAC chart's Dive no. axis spaces them: against dates, the D4i log's 6-year gap made a 4-minute change a 26-minute climb. Their ends are kept at nothing or more and the bar is judged on the change between those ends.
- A threshold's cleanest split ranks on its weaker side's share, then its other side's, then the gap, then the dive count.
- Patterns are cached apart from the figures, by log and year (not day), and render a painted frame after the screen like everything below the records. Timed on a 630-dive log in Node: 7 ms all time, 1 ms a year.
- Pressing or hovering an expanding row tints the whole open item, on Statistics' Conditions, Habits and Distribution too; Distribution's opaque figure cells take the tint themselves.
- File names follow the app's kebab case (`patterns-card.tsx`, `all-patterns.tsx`, `pattern-detail.tsx`, `pattern-chart.tsx`) rather than the plan's PascalCase.

Deferred, or to watch:

- On the phone (the owner): the pattern rows' tap and press tint, Expand all, whether the lanes, the threshold strip and the month bars read at arm's length, All patterns' length with everything open, and the time to open Statistics now patterns join the deferred frame.
- Near-duplicate differences (two splits of the same dives, such as mild or stronger current and surge on the same days) are left as they are (the owner's choice). The design critique also noted that "since Feb 2019" covers a 6-year gap on the D4i log; with SAC over time out of the top three it matters less.
- `capital()` in `catalogue.ts` repeats the import review's, and `/stats/patterns` repeats Statistics' year parser: sharing either would pull import or route code into the stats chunk.
- Carried over from milestone 22: tap-to-content for Statistics timed on the owner's phone; the year menu, a record's Back, the tag link, the expanding rows and the count's roll on the phone; whether the Log and Statistics tabs keep their filters; a tag's count leaving out ignored dives the Log lists; the desktop sidebar lighting Log on a record's dive's edit form; the root `:has()` restyles on a held press in WebKit; and from milestone 21 the README's cable steps on the home server, the Import screen's states and Forget's sheet on the phone, and whether Last downloaded moves on a read with nothing new.

## Milestone 24: Dive-number milestones

**Goal**: saving dive 40, 50, 60, 75, 100, 250, 500, 750 or 1000 plays the milestone burst with a line saying what the number means, and Statistics shows the next milestone.

**Implements**: Statistics (Records and milestones, Dive-number milestones), Screens (Add or edit, the save's celebration), Build order step 13, decision D52.

**Open when it is built**: the lines' wording, how the save shows its line and how the Records and averages card shows the next milestone, and anything else the owner wants a milestone to do. Proposed in the real app on localhost, then discussed.

**Likely touches**: `apps/web/src/dive/milestones.ts` (the numbers, now with their meanings), the save's celebration, the Records and averages card, tests.

**Acceptance**

- Saving a dive with a milestone number plays the burst with its line; any other number plays only the small bubbles; an offline draft celebrates once, when the server numbers it.
- Ignored dives don't count, as they have no number.
- Statistics shows the next milestone and how far off it is, and nothing once the last is passed.
- Screenshots of the save and the card at 390 px, in both themes.

**Not in this milestone**: milestones for anything but the dive count (hours underwater, depth, certifications).

**Research notes** (8 November 2026), the counts behind the numbers:

- PADI: Divemaster takes 40 dives to start and 60 to certify ([PADI blog](https://blog.padi.com/padi-divemaster-requirements/)); Master Scuba Diver 50 ([padi.com](https://www.padi.com/become-a-padi-master-scuba-diver)); the instructor course 60 to enrol and 100 for the exam ([PADI blog](https://blog.padi.com/how-to-become-a-scuba-instructor/)).
- SSI: Dive Guide and Divemaster 40 dives (25 hours) to enrol and 60 (40 hours) to certify ([SSI standards](https://training.divessi.com/us/course/scuba-training-standards-and-procedures/professional-programs-1/divemaster-iso-24801-3)); Master Diver 50, Century 100, Elite 250, Gold 500, Platinum 750, Diamond 1000 and Platinum Pro 5000 ([SSI recognition](https://www.divessi.com/en/join-ssi/recognition/diver-recognition)). The instructor course is 75 dives (50 hours) on SSI's [ITC page](https://www.divessi.com/en/professional/scuba-diving/instructor-training-course) but 60 (40 hours) on a [standards page](https://training.divessi.com/course/scuba-training-standards-and-procedures-20241/professional-programs/open-water-instructor-iso-24802-2-assistant-instructor-iso-24802-1). Older sources give SSI's levels as Silver 300, Gold 500 and Platinum 1000.
- Left out: SSI's Specialty Diver (12) and Advanced Specialty Diver (24); PADI Tec 40, 45 and 50 at 30, 50 and 100 dives and Self-Reliant Diver at 100, from dive-shop pages only.
- The code: `apps/web/src/dive/celebration.ts` already plays the burst for `milestones.includes(dive.number)`, and `milestones.ts` is empty.

- [ ] Wording and look agreed
- [ ] Milestone numbers and their lines on the save
- [ ] Next milestone on Statistics
- [ ] Tests and screenshots listed above

## Milestone 25: Packing checklist

**Goal**: one flat checklist of things to pack, starting from a default list the diver can change (add, rename, delete, reorder), ticked off on the phone while packing and cleared with a Reset.

**Implements**: Screens (Packing checklist), Edits to synced data, Build order step 14, decision D53.

**Open when it is built**: where it opens from (a row on You is the obvious place), the screen's design, mocked up first as no board covers it, how adding, editing and reordering work, and the default items. A starting list from research: mask, snorkel, fins, wetsuit, hood, gloves, boots, BCD, regulator, dive computer, weights, SMB, torch, cutting tool, defog, save-a-dive kit, certification card, dive insurance details, sunscreen, towel, warm layer, seasickness tablets, water and snacks, dry bag. One way to store it, to weigh then: a table of ordered items with the defaults inserted by its migration, one request saving the whole ordered list (safe to repeat), and the list carried in the synced log so it shows offline.

**Likely touches**: a migration, a schema in core, a route, the synced log, a screen under You, tests.

**Acceptance**

- The server saves the list in one transaction, journalled; saving the same list again changes nothing; the restore drill keeps it.
- Ticks survive a reload, Reset clears them, and a deleted item's tick goes with it.
- Offline, the list shows and ticks, and editing is disabled, with the offline icon in the bar.
- Playwright: editing the list and Reset at 390 px, with screenshots in both themes.

**Not in this milestone**: several lists, sections, sharing a list between instances.

**Research notes** (8 November 2026): PADI's app has Checklists under Tools, with four lists, Dive Day, Dive Vacation, Save-a-Dive Kit and First Aid Kit ([PADI Pros blog](https://pros-blog.padi.com/?p=4587)); their items, and whether they can be edited, ticked or reset, weren't found. PADI's own packing list, sent by email, groups items as scuba gear, travel and dive documents, exposure protection, electronics, photo and video, and spares ([padi.com](https://www.padi.com/scuba-diving-packing-list)). The starting list above comes from those groups and PADI's blog ([1](https://blog.padi.com/10-things-padi-pro-never-leaves-shore-without/), [2](https://blog.padi.com/essentials-next-dive-holiday/)).

- [ ] Screen mocked up and defaults agreed
- [ ] Stored list and its route
- [ ] Screen, ticks and Reset
- [ ] Tests and screenshots listed above

---

## Next steps

Directly after milestone 25, in this order, each planned as its own milestone when it starts (added 13 November 2026). How each is built is not decided yet.

1. **A map of dive sites**, using the Cape Town site map Dive Team (Simon's Town) publishes at [diveteam.co.za](https://diveteam.co.za/pages/cape-town-dive-site-map). It is a Google My Maps map whose KML can be downloaded: 140 sites, each a point with a free-text description of its kind (reef, wreck), access (shore or boat) and depth, and a link to its Wikivoyage page. Its text, and likely its positions, come from Wikivoyage's [Diving the Cape Peninsula and False Bay](https://en.wikivoyage.org/wiki/Diving_the_Cape_Peninsula_and_False_Bay%2FDive_sites), which covers 300 or more sites under CC BY-SA, while the shop's map states no licence. Sites store no position yet (the spec's Units table lists latitude and longitude, but no table has them), so this starts with coordinates on sites.
2. **The MCP server** for logging dives with Claude, which the spec lists under Not in v1 and Later, with its notes on reaching a tailnet-only server and keeping the MCP layer separate in the server.
