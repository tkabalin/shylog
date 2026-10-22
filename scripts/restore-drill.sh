#!/usr/bin/env bash
# Restores last night's snapshot of one instance to a scratch folder,
# replays the live journal onto it and reports any difference from the live
# database. Read-only for the instance, so it runs with the app up.
# Usage: scripts/restore-drill.sh <instance>
set -euo pipefail
cd "$(dirname "$0")/.."

instance=${1:?Usage: scripts/restore-drill.sh <instance>}
# shellcheck source=instance.sh
. scripts/instance.sh

compose exec app \
  node apps/server/dist/cli.js drill
