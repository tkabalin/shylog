<h1><img src="apps/web/public/favicon.svg" alt="" width="40" align="top"> Shylog</h1>

[![CI](https://github.com/tkabalin/shylog/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tkabalin/shylog/actions/workflows/ci.yml)
[![Licence: GPL-3.0-or-later](https://img.shields.io/badge/licence-GPL--3.0--or--later-blue)](LICENSE)
[![Node 24](https://img.shields.io/badge/node-24-339933?logo=nodedotjs&logoColor=white)](.nvmrc)

A self-hosted, mobile-first web app for logging scuba dives. It runs on a home server, is reached only over Tailscale, and keeps its data in SQLite, with a plain UDDF export so the log is never locked in. Dive computer data arrives as Subsurface UDDF exports.

Shylog is in early development: the workspace and app shell are in place, and the rest is being built step by step from [the build plan](docs/PLAN.md).

## Docs

- [docs/SPEC.md](docs/SPEC.md): what Shylog does and how, and the source of truth for behaviour
- [docs/PLAN.md](docs/PLAN.md): the build plan, step by step
- [docs/design/](docs/design/): the hi-fi wireframes, the source of truth for layout

## Layout

| Path            | What                                             |
| --------------- | ------------------------------------------------ |
| `apps/web`      | The app: React, Vite, TanStack Router, shadcn/ui |
| `apps/server`   | The API and static host: Node, Hono, SQLite      |
| `packages/core` | Schemas, units and calculations shared by both   |

## Development

Needs Node 24 (see `.nvmrc`) and pnpm, which Corepack provides.

```bash
corepack enable
pnpm install
cp .env.example .env    # then set the values below
pnpm dev                # web on http://localhost:5173, server on PORT (3000)
```

`.env.example` is written for a deployment. For local development, set:

```bash
SHYLOG_ALLOWED_LOGINS=you@example.com
SHYLOG_DEV_LOGIN=you@example.com       # stands in for the Tailscale login
SHYLOG_ORIGIN=http://localhost:5173
SHYLOG_DATA_DIR=/absolute/path/to/shylog-data   # any folder outside the repo
```

`pnpm dev` runs the server with `NODE_ENV=development`. Without it the server counts as production and refuses to start with `SHYLOG_DEV_LOGIN` set.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm vitest run <paths>   # the tests you touched; CI runs the whole suite
pnpm test:e2e             # Playwright; first run `pnpm exec playwright install chromium webkit`
pnpm build
```

## Licence

[GPL-3.0-or-later](LICENSE).
