#!/usr/bin/env bash
# Restores one instance from a nightly snapshot (see Restores in
# docs/SPEC.md and the README). With --replay-to, the moved-aside journal is
# replayed up to that sequence number, or all of it.
# Usage: scripts/restore.sh <instance> <snapshot> [--replay-to <seq>|all]
set -euo pipefail
cd "$(dirname "$0")/.."

usage="Usage: scripts/restore.sh <instance> <snapshot> [--replay-to <seq>|all]"
instance=${1:?$usage}
snapshot=${2:?$usage}
shift 2
# The options are checked before the app stops.
if [[ $# -ne 0 && ! ($# -eq 2 && $1 == --replay-to && $2 =~ ^([0-9]+|all)$) ]]; then
  echo "$usage" >&2
  exit 2
fi
# shellcheck source=instance.sh
. scripts/instance.sh

# The one-off container below joins the sidecar's network, so the sidecar
# comes up first, while the app still runs.
compose up -d tailscale
compose stop app
# With the app stopped, nothing else has the database open.
status=0
compose run --rm --no-deps app \
  node apps/server/dist/cli.js restore "$snapshot" "$@" || status=$?
case $status in
  0) compose up -d app ;;
  3)
    # The snapshot was refused before anything moved.
    compose up -d app
    echo "Nothing was restored; the app is running on its database as before." >&2
    exit 1
    ;;
  *)
    # The replay failed, leaving the restored database partly replayed.
    echo "The app is left stopped. Check the output above, then run:" >&2
    echo "  docker compose --env-file $env_file up -d app" >&2
    exit 1
    ;;
esac
