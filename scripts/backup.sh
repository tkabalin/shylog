#!/usr/bin/env bash
# Takes a snapshot of one instance now, through the nightly job's code, such
# as before an upgrade. It replaces that day's snapshot.
# Usage: scripts/backup.sh <instance>
set -euo pipefail
cd "$(dirname "$0")/.."

instance=${1:?Usage: scripts/backup.sh <instance>}
# shellcheck source=instance.sh
. scripts/instance.sh

compose exec app \
  node apps/server/dist/cli.js snapshot
