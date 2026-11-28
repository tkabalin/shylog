# Testing

How Shylog is tested: where the risk is, the level each test sits at, the checks against Subsurface and the UDDF schema, the fixtures, and the rule that no test may be flaky. How CI runs all of this is in [ci-cd.md](ci-cd.md). The calculations being checked are described in [calculations.md](calculations.md), the import and export formats in [import.md](import.md) and [export.md](export.md), and the sync rules in [offline-sync.md](offline-sync.md).

## Where the risk is

Three things can go wrong silently, and the tests are concentrated on them:

- **Sync.** A draft uploaded twice, resent after a dropped reply, or pointing at a site merged on the server while the phone was offline must still leave the log as one clean upload would.
- **UDDF import and export.** The log arrives as Subsurface's UDDF and leaves as Shylog's own, so a dive that comes in short or goes out unreadable is a dive lost.
- **Calculations.** SAC rate, MOD, CNS and the rest are meant to match Subsurface's figures to the rounding, and a figure that is slightly wrong looks exactly like one that is right.

The screens matter too, but a broken screen is visible at once. They are covered in the browser rather than at unit level.

## Test levels

| Level     | What it exercises                                                                     | Tooling                                              |
| --------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Core      | Schemas, unit conversion and every calculation in `packages/core`, all pure functions | Vitest, fast-check, a C++ build of Subsurface's code |
| Server    | Routes, import, export, migrations and restores against a real SQLite database        | Vitest, Hono's test client, `xmllint`, `xsltproc`    |
| Web logic | The app's data layer: the IndexedDB mirror, drafts, upload, sync states, edits        | Vitest with jsdom and `fake-indexeddb`               |
| Browser   | The real screens on a seeded server                                                   | Playwright on Chromium and WebKit                    |

Vitest runs the first three as projects of one root config (`vitest.config.ts`), so `pnpm test` covers them all. Unit tests sit beside the code they test as `*.test.ts`; the suites that compare Shylog with Subsurface live apart, under `test/reference/` in `packages/core` and `apps/server`.

**The server is tested against a real database.** Each test gets a migrated in-memory better-sqlite3 database and sends requests through the Hono app itself, with the identity headers Tailscale Serve would add. Nothing is mocked: the transactions, foreign keys and `STRICT` tables a mock would skip are where a data bug would hide.

**The web app's data layer runs on a fake IndexedDB.** jsdom has none, so `fake-indexeddb` is registered before every web test and Dexie opens it as it would the browser's. The sync queue, draft upload and retry, refused drafts and the sync state machine are tested there. React screens and shadcn components are left to Playwright, where they run in a real browser.

## Browser tests

The Playwright suite in `apps/web/e2e/` runs at a 390 by 844 viewport, phone width, in Chromium and WebKit. WebKit matters most, since the app is used installed from iOS Safari, and several bugs have shown up only there.

Playwright starts everything it needs and never reuses a running dev server. Each stack is a fresh data folder seeded from the D4i fixture, the server with the dev login standing in for Tailscale, and Vite's dev server in front of it. A stand-in for `dctool` plays back raw downloads from the watch, so even the direct download from the dive computer runs end to end. The suite is split into four lanes by tag:

- **Read-only tests** run in parallel on one shared stack and assert the fixture's real figures.
- **`@writes` tests** change the log and put it back, so each browser runs them one at a time on a stack of its own.
- **`@built` tests** run against a production build served by the server itself, because only a build has the service worker, and offline behaviour can't be tested without it.
- **`@divesites` tests** run against the public dive site map as it's built, previewed with no server behind it, and check it never asks for the app's API or the extract.

Some specs check conventions rather than features: one tours the Log, a dive and You and fails on any console warning, uncaught exception or error response, and each navigation flow checks that `page.goBack()` lands where the history rule in [ui.md](ui.md) says. Screenshots taken during a run are evidence for review, uploaded as a CI artifact, not pixel comparisons and never committed.

## Checking against Subsurface

Shylog's figures are meant to be Subsurface's figures. Rather than trust a port by reading it, the tests run Subsurface's own code.

**The differential test.** Subsurface's functions for gas volume, SAC rate, MOD, CNS with carry-over, OTU, average depth, the dive's end, surface intervals, the chart's points, speeds, axes and tick spacing are copied into one small C++ program, `packages/core/test/reference/subsurface.cpp`, which the test compiles and runs side by side with the TypeScript. fast-check generates random dives, logs and profiles, with generators aimed at the exact boundaries where rounding goes wrong, and every rounded figure must match exactly. Where Shylog departs from Subsurface on purpose, such as MOD to 0.1 m or the 48-hour surface interval cap, the departure is applied to Subsurface's answer, so each one is written down in the test. See [calculations.md](calculations.md).

**The reader against Subsurface's import.** Shylog's UDDF reader runs beside Subsurface's own import, its unchanged `uddf.xslt` applied with `xsltproc`, on both real exports. Every dive's start, duration, depths, gas and computer, every sample, and every alarm must agree.

**What Subsurface doesn't have.** The safety stop is Shylog's own rule, as Subsurface doesn't detect one and the watch never logs a recommended stop. It is tested on hand-built profiles, with its counts of full, short and missing stops pinned on both real exports.

## UDDF and CSV

**Schema validation.** Every export is validated with `xmllint` against the official UDDF 3.2.1 schema, vendored at `fixtures/uddf/uddf_v321.xsd`, after Shylog's own `<shylog>` element is stripped. One failure is allowed: a cylinder with no start pressure still gets its `tankdata`, which UDDF says must hold one, because leaving it out would lose the dive's gas in Subsurface. Nothing else may fail.

**Read by Subsurface.** Exports are also read the way Subsurface reads them: its namespace strip, then its own stylesheet. Every dive, site, buddy and mix must come out with its date, time, depth, duration and gas. This replaces opening each export in Subsurface by hand; the stylesheet produces Subsurface's native XML, so only its loader for that format goes untested.

**The round-trip fuzzer.** `apps/server/test/reference/uddf-round-trip.test.ts` generates random logs with awkward text, boundary numbers, computer profiles with alarms and deleted dives, uploads them as drafts through the API and exports them. The export must pass the schema, be byte-identical on a second run, read back through Shylog's reader as it was stored, and be read by Subsurface with every field its stylesheet takes. It has found what the fixed tests missed: a CNS figure on a deep, oxygen-rich dive overflowing SQLite's integer column, names made only of control characters exported blank, and tiny numbers written as `1e-7`, a form the schema's decimal type doesn't allow. Quirks of Subsurface's own XPath, such as reading 273.15 K as no temperature, are applied to its answer.

**Pass-through.** Importing a real Subsurface export and exporting it again keeps every standard element Shylog doesn't model, in its proper place and valid against the schema. The test compares each dive's elements before and after, and only remapped ids and hand-entered values may differ.

**CSV.** The writer is tested on quoting, the byte order mark, line ends, units, blanks and the prefix that stops a spreadsheet running a cell as a formula, and a property test checks that any table of text survives a round trip through a standard CSV parser.

## Fixtures

Real data shows what a dive computer actually writes; synthetic data reaches what the diving hasn't done yet. Both are used.

- **Real exports.** Subsurface UDDF exports from the Suunto D4i and the Zoop Novo in `fixtures/subsurface/`, covering nitrox, dives past 30 m, ascent alarms, surfacings mid-dive, freedives and dives under five minutes. Raw downloads from each watch, with the XML `dctool` must turn them into, are in `fixtures/dctool/`.
- **Synthetic exports.** Small UDDF files in `fixtures/synthetic/`, generated from real fixture dives by a checked-in script, for what the real exports lack: a trip abroad with an offset clock, a night dive crossing midnight, a gauge dive, pressure samples, and a PO₂ over the limit.

The browser suite and `pnpm seed` both load the D4i export, so the screens are tested on a real log rather than placeholder dives.

## Data safety

**Sync end to end.** `apps/server/test/sync-e2e.test.ts` drives the routes the phone calls with drafts resent, sent twice at once, sent again after an edit, pointing at a merged entity, or made on two phones, and checks that each ends as one clean upload of the same dives would. A companion test imports whole exports against dives already logged by hand on the phone.

**Migrations against real data.** A migration test brings a copy of a real nightly snapshot up to the latest schema, then runs `foreign_key_check` and the integrity check. The snapshot is personal data and is kept out of git, so this test runs locally where a snapshot has been copied in, and is skipped in CI and on a fresh clone; every migration is also exercised on a fresh database by every other server test.

**Restores.** Unit tests cover swapping a snapshot in and replaying the journal onto it. `scripts/restore-drill.sh` runs the same thing for real inside an instance's container: it restores last night's snapshot to a scratch folder, replays the live journal, and compares the result with the live database table by table, without writing to it. CI's image smoke test runs the drill too. See [server.md](server.md).

## No flaky tests

A test that sometimes fails teaches everyone to ignore red, so flakiness is treated as a bug and fixed, never retried away or skipped.

**Property tests run on a pinned seed in CI.** Every fast-check suite takes its options from one helper, `packages/core/test/reference/fuzz.ts`, which fixes the seed so CI tries the same cases on every run and a red build is always caused by the change. Random exploration happens only locally: `SHYLOG_FUZZ_SEED=random` explores new cases or replays a printed seed, and `SHYLOG_FUZZ_RUNS` raises the case count for a long soak.

| Property suite          | Cases per property in CI |
| ----------------------- | ------------------------ |
| Subsurface differential | 1,000                    |
| CSV round trip          | 500                      |
| UDDF round trip         | 60                       |

**Browser tests can't hide a flake.** In CI Playwright retries a failed test up to twice, but only to tell a flake from a real break: `failOnFlakyTests` fails the run when a test passes only on a retry, so it can't merge unseen. Each pull request repeats the spec files it changes five more times, and the whole suite is soaked five times over each night, with an issue opened for each test that fails (see [ci-cd.md](ci-cd.md)).

## Coverage

CI runs Vitest with coverage and adds the per-file table to the run's summary page. It counts `packages/core`, the server, and the web app's data, formatting, Log and dive logic; screens are left to Playwright, which isn't measured.

Two thresholds are enforced. `packages/core` must stay at 100 % of statements, branches, functions and lines, because it holds the schemas and the calculations every figure comes from, all pure functions with no excuse for an untested branch. The web app's data folder, where a regression silently loses a dive, has a floor a few points under its measured figures, since its React hooks are covered in the browser instead.
