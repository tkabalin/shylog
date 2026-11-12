#!/usr/bin/env bash
# Gives the dives already in an instance's log the mandatory stops the
# watch on its cable holds, as they came in through Subsurface without
# them. Reads every dive on the watch; --dry-run lists what it would add.
# Usage: scripts/mandatory-stops.sh <instance> [--dry-run]
set -euo pipefail
cd "$(dirname "$0")/.."

instance=${1:?Usage: scripts/mandatory-stops.sh <instance> [--dry-run]}
shift
# shellcheck source=instance.sh
. scripts/instance.sh

compose exec app \
  node apps/server/dist/cli.js mandatory-stops "$@"
