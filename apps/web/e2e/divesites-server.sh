#!/usr/bin/env bash
# The public dive site map as built, previewed on E2E_DIVESITES_PORT for the
# @divesites tests: a folder of its own per port, so it never rewrites
# apps/web/dist-divesites under another run. SIGTERM runs the trap.
set -euo pipefail
dir=${TMPDIR:-/tmp}/shylog-divesites-${E2E_DIVESITES_PORT:?}
# Another run on this port would have its folder removed under it.
exec 9>"$dir.lock"
flock -n 9 || { echo "Port $E2E_DIVESITES_PORT is in use by another run" >&2; exit 1; }
rm -rf "$dir"
trap 'rm -rf "$dir"' EXIT

cd "$(dirname "$0")/.."
pnpm exec vite build -c vite.divesites.config.ts \
  --logLevel warn --outDir "$dir" --emptyOutDir
# Not exec'd, so the trap runs once the preview has stopped.
pnpm exec vite preview -c vite.divesites.config.ts \
  --outDir "$dir" --port "$E2E_DIVESITES_PORT"
