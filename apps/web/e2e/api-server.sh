#!/usr/bin/env bash
# The browser tests' API: a fresh folder per port seeded from the D4i fixture,
# with the dev login standing in for Tailscale, behind Vite's proxy. SIGTERM
# runs the trap; a run killed outright leaves at most one folder behind.
set -euo pipefail
dir=${TMPDIR:-/tmp}/shylog-e2e-${E2E_API_PORT:?}
# Another run on this port would have its live folder removed under it.
exec 9>"$dir.lock"
flock -n 9 || { echo "Port $E2E_API_PORT is in use by another run" >&2; exit 1; }
rm -rf "$dir"
mkdir -p "$dir"
trap 'rm -rf "$dir"' EXIT

export NODE_ENV=development
export SHYLOG_DATA_DIR=$dir
export SHYLOG_DEV_LOGIN=diver@example.com
export SHYLOG_ALLOWED_LOGINS=diver@example.com
export SHYLOG_ORIGIN=${E2E_ORIGIN:?}
export PORT=$E2E_API_PORT

cd "$(dirname "$0")/../../server"
pnpm exec tsx scripts/seed.ts >/dev/null
# Not exec'd, so the trap runs once the server has stopped.
pnpm exec tsx src/index.ts
