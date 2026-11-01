<h1><img src="apps/web/public/favicon.svg" alt="" width="40" align="top"> Shylog</h1>

[![CI](https://github.com/tkabalin/shylog/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tkabalin/shylog/actions/workflows/ci.yml)
[![Licence: GPL-3.0-or-later](https://img.shields.io/badge/licence-GPL--3.0--or--later-blue)](LICENSE)
[![Node 24](https://img.shields.io/badge/node-24-339933?logo=nodedotjs&logoColor=white)](.nvmrc)
[![pnpm 12](https://img.shields.io/badge/pnpm-12-F69220?logo=pnpm&logoColor=white)](package.json)

A self-hosted, mobile-first web app for logging scuba dives. It runs on a home server, is reached only over Tailscale, and keeps its data in SQLite, with a plain UDDF export so the log is never locked in. Dive computer data arrives as Subsurface UDDF exports and is attached to the dives logged by hand.

[Subsurface](https://github.com/subsurface/subsurface) is the open-source dive log many divers rely on for the numbers, but it is a desktop app. Shylog is built to be filled in on a phone on the boat, with wet hands and no signal, while giving the same figures Subsurface would.

- **Calculations checked against Subsurface's own code**: Subsurface's functions are copied into [one small C++ program](packages/core/test/reference/subsurface.cpp) and run side by side with Shylog's TypeScript on thousands of random dives from [fast-check](https://fast-check.dev), aimed at the boundaries where bugs hide. Every rounded figure must match exactly, on every CI run.
- **UDDF that other apps can open**: the UDDF Shylog writes is checked in CI against the official [UDDF 3.2.1 schema](fixtures/uddf/uddf_v321.xsd), with each departure from it listed in the spec. CI also opens it with Subsurface's own import and checks that each dive comes out the same, gas and cylinders included, so a log moved to Subsurface arrives intact.
- **Data that is hard to lose**: SQLite in WAL mode with `STRICT` tables, every write one journalled transaction, a snapshot before each migration, and an integrity check that pauses writes if it fails.
- **Hand beats computer**: each field records whether it was typed or read from the dive computer, so an import never overwrites a hand-entered value and keeps the computer's reading beside it.
- **Private by design**: no accounts or passwords. The app is reachable only over Tailscale and trusts its identity header for an allow-listed login.
- **Designed for wet hands**: phone first, with 44 px touch targets, bottom navigation, 16 px inputs so iOS doesn't zoom, and native date and number keyboards.

## What it does

> **Status**: in early development. When v1 is done, Shylog will:

- Log, edit and delete dives from a phone, with new dives saved offline as drafts that sync when there is signal.
- Show the log, each dive's details and a profile chart of depth, temperature, vertical speed and the computer's alarms.
- Import a Subsurface export and pair each computer dive with the dive logged by hand.
  - The import rules are written and tested for the Suunto D4i and Zoop Novo; other computers' exports go through generic rules that are untested.
- Work out SAC rate, MOD, max PO₂, CNS and OTU, surface intervals and statistics across the whole log.
- Keep sites, people, dive centres, trips and certification cards, with the cards viewable offline.
- Install to the home screen, with one instance per diver.

## Tech stack

| Area    | Tools                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------- |
| Web app | React 19, Vite, TanStack Router, Tailwind CSS 4, shadcn/ui, Recharts, Dexie, vite-plugin-pwa    |
| Server  | Node 24, Hono with its typed RPC client, better-sqlite3, @xmldom/xmldom, tsup                   |
| Shared  | TypeScript, Zod schemas used by both the app and the server                                     |
| Testing | Vitest, fast-check, Playwright on Chromium and WebKit, `xmllint` and `xsltproc` for UDDF checks |
| Deploy  | Docker Compose with a Tailscale sidecar, HTTPS through Tailscale Serve                          |

## Development

Needs Node 24 (see `.nvmrc`), pnpm (which Corepack provides), a C++ compiler (`c++`, as from `build-essential` or Xcode's command line tools) and `xsltproc` and `xmllint` (`apt install xsltproc libxml2-utils`; macOS has both) for the Subsurface reference and UDDF schema tests.

```bash
corepack enable
pnpm install
cp .env.example .env    # then set the values below
pnpm dev                # web on http://localhost:5173, server on PORT (3000)
pnpm seed               # optional: load the fixture's dives into an empty log
pnpm test               # unit and integration tests
```

`.env.example` is written for a deployment. For local development, set:

```bash
SHYLOG_ALLOWED_LOGINS=you@example.com
SHYLOG_DEV_LOGIN=you@example.com       # stands in for the Tailscale login
SHYLOG_ORIGIN=http://localhost:5173
SHYLOG_DATA_DIR=/absolute/path/to/shylog-data   # any folder outside the repo
```

`pnpm dev` runs the server with `NODE_ENV=development`. Without it the server counts as production and refuses to start with `SHYLOG_DEV_LOGIN` set.

## Deploying

Each diver gets an instance: the app and a Tailscale sidecar, run as one Compose project from the image CI publishes to `ghcr.io/tkabalin/shylog`. The app listens only inside the sidecar's network, so Tailscale Serve is the only way in, and everything an instance keeps is under its `SHYLOG_DATA_DIR`.

Once, in the Tailscale admin console, turn on MagicDNS and HTTPS certificates. Then, for each instance on the home server:

```bash
git clone https://github.com/tkabalin/shylog.git && cd shylog   # once
sudo install -d -o 1000 -g 1000 /srv/shylog/<instance>            # the image runs as uid 1000
mkdir -p instances && cp .env.example instances/<instance>.env    # git ignores instances/
```

Edit `instances/<instance>.env`, where comments explain each value. Each instance needs its own `COMPOSE_PROJECT_NAME`, `TS_HOSTNAME` and `SHYLOG_DATA_DIR`, all under one parent folder for the off-site backup. Then start it:

```bash
docker compose --env-file instances/<instance>.env up -d
```

Once the node has joined, clear `TS_AUTHKEY` and disable key expiry for the node in the admin console.

If you set up an instance for another diver, share its node with their Tailscale account and restrict each node to its diver's devices in the tailnet policy.

### Smoke test

Every `/api` request needs an `X-Shylog` header, and Tailscale Serve sends the caller's login, which must be in `SHYLOG_ALLOWED_LOGINS`. From a device on the tailnet:

```bash
curl -H 'X-Shylog: 1' https://<TS_HOSTNAME>.<tailnet>.ts.net/api/health
```

If the host doesn't use MagicDNS, add `--resolve <TS_HOSTNAME>.<tailnet>.ts.net:443:<node IP>`, with the node IP from `docker compose --env-file instances/<instance>.env exec tailscale tailscale ip -4`. A request without the header gets `403 Missing X-Shylog`, and one from a login that isn't allowed gets `403 Login not allowed`. To check the refusal, take your login out of `SHYLOG_ALLOWED_LOGINS`, run `up -d --wait app`, repeat the request, then put it back. For the second diver, install the app on their phone through the shared node: the app sends the header on every call, so it loading proves their login passes.

### Updating

```bash
git pull && scripts/update.sh <instance>
```

The image comes from GHCR. `git pull` updates the clone's `compose.yml`, `tailscale/` and `scripts/` so they match it. `update.sh` does nothing if the image hasn't changed. Otherwise it takes a snapshot, starts the new image and rolls back to the old one if it isn't healthy within three minutes. After a migration a rollback isn't possible, so the app is left stopped with the restore command to run. It exits 0 when updated or current, 3 when rolled back and 1 when stopped, so a systemd timer can run it and alert on failure.

If Docker restarts the sidecar on its own and the app stops answering, run `up -d` again.

## Backups and restores

Each night at midnight in `TZ`, an instance writes `snapshots/shylog-<date>.db.gz` to its data folder, keeping dailies for 90 days, weeklies for two years and monthlies forever. The off-site backup must cover `/srv/shylog/`, which holds every instance's snapshots, export and card images.

- `scripts/backup.sh <instance>` takes a snapshot now.
- `scripts/restore-drill.sh <instance>` restores last night's snapshot to a scratch folder, replays the journal and reports any difference. It never writes to the live database.
- `scripts/restore.sh <instance> <snapshot> [--replay-to <seq>|all]` restores a snapshot, moving the current database to `restore-aside/`. It takes a nightly snapshot or one of the `pre-migration-*.db` copies the server makes before each migration.

### Restoring

1. Pick a snapshot from `/srv/shylog/<instance>/snapshots`: the latest, or for bad data the last one before it.
2. For bad data, find the last good journal entry (times are UTC):

   ```bash
   docker compose --env-file instances/<instance>.env exec app node apps/server/dist/cli.js journal --since 2026-10-22
   ```

3. Restore, replaying up to that entry, everything (`all`) or nothing (no option):

   ```bash
   scripts/restore.sh <instance> shylog-2026-10-22.db.gz --replay-to 1234
   ```

If the replay fails, the app is left stopped with the old database in `restore-aside/`. If every snapshot is lost, import the UDDF export in `export/` into a new instance.

## Licence

Licensed under [GPL-3.0-or-later](LICENSE).
