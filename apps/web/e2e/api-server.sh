#!/usr/bin/env bash
# The browser tests' API: a fresh folder per port seeded from the D4i fixture,
# with the dev login standing in for Tailscale, behind Vite's proxy (with
# E2E_BUILD, serving a production build itself). SIGTERM runs the trap; a run
# killed outright leaves at most one folder behind.
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
# Downloading from the dive computer, against a stand-in for dctool that
# plays back the D4i's raw fixtures; the "cable" is a file in the folder.
server=$(cd "$(dirname "$0")/../../server" && pwd)
export SHYLOG_DCTOOL=$server/test/fake-dctool.mjs
export SHYLOG_DC_DEVICE=$dir/suunto
touch "$SHYLOG_DC_DEVICE"
export FAKE_DCTOOL_SHIFT_EACH=1
# About two seconds a read, so the card's progress shows between its asks.
export FAKE_DCTOOL_DELAY=30

# The built-app stack serves a production build of its own, in this run's
# folder, so it never rewrites apps/web/dist under another run.
if [[ -n ${E2E_BUILD:-} ]]; then
  (cd "$(dirname "$0")/.." &&
    NODE_ENV=production pnpm exec vite build --logLevel warn --outDir "$dir/web" --emptyOutDir)
  export SHYLOG_WEB_ROOT=$dir/web
fi

cd "$(dirname "$0")/../../server"
pnpm exec tsx scripts/seed.ts >/dev/null
# Not exec'd, so the trap runs once the server has stopped.
pnpm exec tsx src/index.ts
