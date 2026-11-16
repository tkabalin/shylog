# Tech stack

What Shylog is built with, layer by layer, and why each piece was chosen. How the pieces work together is covered elsewhere: [offline-sync.md](offline-sync.md) for the phone's copy of the log and its drafts, [server.md](server.md) for how the server keeps data safe, [security.md](security.md) for access, [testing.md](testing.md) and [ci-cd.md](ci-cd.md) for checks and delivery. The full list of choices is in the [spec](planning/SPEC.md).

## Shape of the system

Shylog is a progressive web app for one diver, served by a small Node server on a home server and reached only over Tailscale. The phone keeps a read-only copy of the log and any new dives not yet uploaded, so it opens and logs dives with no signal. The server owns the data: it is the only thing that writes the SQLite database, it journals every write, and it exports the whole log as UDDF and CSV each night. The [README](../README.md#architecture) has a diagram.

Everything is TypeScript, in a pnpm workspace of four packages:

| Package               | Holds                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/web`            | The React PWA                                                                                             |
| `apps/server`         | The Hono server, the database, imports, exports, backups and the dive computer download                   |
| `apps/claude-desktop` | The Claude Desktop extension, a small bridge from Desktop to an instance's MCP server                     |
| `packages/core`       | Zod schemas, name normalisation, unit conversion and every dive calculation, shared by the app and server |

**One language, one core.** A dive's SAC rate, CNS or surface interval has to come out the same on the phone as in the server's export and statistics. Writing those calculations once, in `packages/core`, and importing them on both sides is what guarantees it. The same goes for validation: a draft is checked against the same schema on the phone before it is queued and on the server before it is applied.

## Web app

| Category       | Choice                                                          |
| -------------- | --------------------------------------------------------------- |
| UI framework   | React 19                                                        |
| Bundler        | Vite 8, with vite-plugin-pwa 2                                  |
| Routing        | TanStack Router 1, file-based                                   |
| Components     | shadcn/ui 4 on Base UI, preset `b1sAmWaNW`, with Tabler icons   |
| CSS            | Tailwind CSS 4, Geist and Geist Mono                            |
| Charts         | Recharts 3, through shadcn's chart component                    |
| Map            | MapLibre GL JS 6, with a Protomaps extract read through PMTiles |
| Local storage  | Dexie 4 over IndexedDB                                          |
| API client     | Hono's typed RPC client (`hono/client`)                         |
| Motion, toasts | Motion 14, Sonner 2                                             |

**A PWA rather than a native app.** Each instance serves one diver, installed from the Home Screen and updated whenever a change is merged. A PWA needs no app store review, runs the same code on an iPhone and a laptop, and with a service worker it opens and works with no signal, which is the case that matters at a dive site.

**Vite and vite-plugin-pwa.** The built app is static files, so the same Node process that serves the API serves the app, and there is no second server to run. vite-plugin-pwa generates the service worker that precaches the app shell and every lazy chunk, so the app cold-starts offline, and it drives the update offer that waits until the diver's drafts have synced.

**TanStack Router.** Routes are files, with typed links and typed search parameters, so a broken link or a misspelt filter is a type error. Its automatic code splitting keeps the statistics screens and the profile chart out of the first load: they are the heaviest code in the app and the least needed at the moment of logging a dive.

**shadcn/ui on Base UI.** shadcn's components are copied into the repo, so they are edited in place to fit the app: larger touch targets on phones, iOS-style sheets, and compact desktop sizes. Base UI provides the accessible primitives underneath (dialogs, menus, selects) that would otherwise be rebuilt by hand. The preset sets the cyan accent, which is also the chart colour, and the Geist typeface.

**Recharts through shadcn's chart component.** The profile chart and the statistics share shadcn's container, tooltip and theming, so charts match the rest of the app in both themes without a second colour system. Recharts costs bundle size, which is why the chart code is in lazy chunks.

**MapLibre with a PMTiles extract.** The dive site map needs vector tiles of one small region, styled to match the app, and nothing else. A Protomaps extract of OpenStreetMap covers the Cape Peninsula and False Bay in one 10 MB file, which the server hands out as a static file, a range at a time, so there is no tile server or map service to run or pay for. The app downloads the whole file ahead, and the service worker cuts each range from that copy, so the map works with no signal, as on a boat. MapLibre draws it, and with no font files named in the style it draws the labels in the app's own Geist. It is the heaviest library in the app, so it is a chunk of its own that runs only when the map opens, though the service worker downloads it with the rest of the app.

**Dexie for the phone's copy.** The phone keeps a read-only mirror of the log, one table per collection, plus the queue of draft dives, each profile's samples and each certification card's images. Dexie is the standard typed wrapper over IndexedDB, and its transactions let a draft and the operations that upload it be written together, so neither can exist without the other. The mechanism is in [offline-sync.md](offline-sync.md).

**Hono's typed RPC client.** The web app imports the server's route types (`AppType`) and calls the API through `hc`, so a renamed field or a changed response is a compile error in the app rather than a bug found on a phone. Installed copies still running older code are covered by versioned operations instead, as described in [offline-sync.md](offline-sync.md).

## Server

| Category      | Choice                                        |
| ------------- | --------------------------------------------- |
| Runtime       | Node 24 (LTS)                                 |
| Framework     | Hono 4, on `@hono/node-server`                |
| Database      | SQLite in WAL mode, through better-sqlite3 13 |
| Validation    | Zod 4, schemas from `packages/core`           |
| UDDF          | @xmldom/xmldom 0.9                            |
| CSV           | csv-parse 7, to check each export             |
| Logging       | pino 10                                       |
| MCP           | The MCP TypeScript SDK 2, stateless over HTTP |
| Build         | tsup 9                                        |
| Dive computer | `dctool` from libdivecomputer 0.9.0           |

**Hono.** A small, standards-based framework whose routes carry their types through to a client. That typed client is the reason it was chosen over Express or Fastify: the app and server share one contract with no code generation step. Routes are chained off one app in `app.ts` so the type keeps inferring every route.

**SQLite, one file per diver.** A dive log is small (hundreds of dives, a few hundred samples each) and has one writer, so a database server would add a service to run and back up for no gain. SQLite keeps the whole log in `shylog.db`, which any SQLite tool can open, and `VACUUM INTO` takes a consistent copy of it in moments for the nightly snapshot. Tables are `STRICT`, so a value of the wrong type is refused rather than stored. How the server uses it is in [server.md](server.md).

**better-sqlite3, not `node:sqlite`.** Node 24 has a built-in SQLite module, but it is still marked as under active development, and better-sqlite3 is the mature, widely used binding. Its synchronous API suits a single-writer server: a whole write, its journal entry and the recalculation of derived figures run in one `db.transaction()` with no awaits in between, so nothing else can interleave.

**Zod schemas in `packages/core`.** Every draft upload and every edit is described once, as a Zod schema. The app uses it to build requests and to show errors under the field; the server uses it to refuse malformed requests before they reach the database. Limits that guard the statistics (a depth past 350 m, a cylinder past 20 litres) live in the same schemas, so a typed value, a new-dive default and an imported value all meet the same rules.

**@xmldom/xmldom for UDDF.** UDDF is XML, and Node has no DOM parser of its own. UDDF is read and written only on the server, so the app's bundle carries no XML code at all. The details of reading Subsurface's files and writing an export Subsurface reads back are in [import.md](import.md) and [export.md](export.md).

**pino.** One JSON object per line on stdout, which any Docker log shipper picks up with no configuration in Shylog. See [server.md](server.md) for what each line carries.

**tsup.** The server and `packages/core` are bundled into one JavaScript file during the Docker build, so the runtime image needs only the server's production dependencies and runs plain `node`.

**libdivecomputer's `dctool`.** Downloading straight from the Suunto D4i and Zoop Novo on a USB cable uses libdivecomputer, the library Subsurface uses. No distribution packages its command-line tool, so the Dockerfile builds it from the pinned 0.9.0 release, statically linked, with one small patch.

## Shared core

`packages/core` has one dependency, Zod. It holds the request schemas, the ids, the units table, the fixed lists (tags, countries, choice fields), name normalisation for deduplicating sites and people, and every calculation: SAC, MOD, max PO₂, CNS, OTU, surface interval, average depth and the safety stop. The calculations follow Subsurface's code, including its rounding, and are checked against it on every CI run; see [calculations.md](calculations.md).

## Tooling and testing

| Category        | Choice                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| Language        | TypeScript 6.0                                                               |
| Package manager | pnpm 12                                                                      |
| Lint, format    | ESLint 10, Prettier 3                                                        |
| Unit tests      | Vitest 5, with `fake-indexeddb` for Dexie and jsdom                          |
| Property tests  | fast-check 4                                                                 |
| Browser tests   | Playwright 1, on Chromium and WebKit                                         |
| UDDF checks     | `xmllint` against the UDDF 3.2.1 schema, `xsltproc` with Subsurface's import |

**WebKit as well as Chromium.** The app lives on iPhones, where every browser is WebKit underneath, so the browser suite runs on both engines. The rest of the testing approach is in [testing.md](testing.md).

**A supply-chain floor.** pnpm refuses any release younger than three days (`minimumReleaseAge`), so a hijacked release has time to be caught before it is installed, and refuses a package whose provenance has been downgraded (`trustPolicy`). Dependency versions are the newest that pass both.

## Deployment

| Category  | Choice                                                                |
| --------- | --------------------------------------------------------------------- |
| Container | Docker Compose: the app and a Tailscale sidecar per instance          |
| Image     | `node:24.22.0-trixie-slim`, pinned by digest, published to GHCR by CI |
| Network   | Tailscale 1.104, with HTTPS through Tailscale Serve                   |

**Tailscale only, no app login.** The app is never on the public internet. Tailscale puts it on a private network that only the diver's devices can join, and Tailscale Serve terminates HTTPS with a real certificate and tells the server which Tailscale user is calling. That identity is the login, so the app has no accounts, passwords or sessions to get wrong. The reasoning and the remaining risks are in [security.md](security.md).

**A sidecar, two containers in all.** The app container shares the Tailscale container's network and listens on 127.0.0.1 inside it, with no published ports, so Serve is the only way in. Each instance is its own Compose project with its own data directory and its own tailnet node.

**One instance per diver.** Rather than one server holding several divers' logs, each diver gets a separate instance: the same image, its own database, its own exports and its own hostname. That removes users, ownership checks and per-row permissions from the code entirely, keeps one diver's data out of reach of a bug in another's, and gives each app its own origin, so two installed apps on one phone never share an offline store. The cost is a second Compose project, which is a copied env file.

**Instance configuration from the environment.** Nothing in the code or `compose.yml` assumes a single deployment: no hard-coded paths, ports, container names or named volumes. Everything that differs between instances is an env var, validated with Zod when the server starts:

| Variable                | Sets                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SHYLOG_ALLOWED_LOGINS` | The Tailscale logins allowed to use this instance, comma-separated                                             |
| `TS_HOSTNAME`           | The tailnet hostname, which also names the instance in every log line                                          |
| `SHYLOG_ORIGIN`         | The origin the browser sees, which every write's `Origin` must match                                           |
| `SHYLOG_DATA_DIR`       | The one folder holding `shylog.db`, `export/`, `snapshots/`, `cards/` and the sidecar's state                  |
| `SHYLOG_APP_NAME`       | The page title, Home Screen name and manifest name, served at run time so two installed apps can be told apart |
| `COMPOSE_PROJECT_NAME`  | The Compose project, required so a copied env file can't take over another instance's containers               |
| `SHYLOG_DC_DEVICE`      | The dive computer cable, set by an optional Compose override; unset, Import only uploads files                 |
| `SHYLOG_DEV_LOGIN`      | Development only: stands in for the Tailscale login, and the server refuses to start with it in production     |

**One image for every instance.** CI builds and publishes the image once the checks pass on `main`, tagged with the commit, so one pull updates every instance and each runs its own migrations when it starts. The commit is also the version the You tab shows and every log line carries. Deployment steps are in the [README](../README.md#deploying), and the pipeline in [ci-cd.md](ci-cd.md).
