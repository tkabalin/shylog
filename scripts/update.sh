#!/usr/bin/env bash
# Updates one instance to the newest image of its tag: a snapshot, the pull,
# then the new server, rolled back to the old image if it doesn't turn
# healthy. Run it after `git pull`, so compose.yml matches the image.
# Usage: scripts/update.sh <instance>
# Exits 0 when updated or already current, 3 when rolled back to the old
# image, and 1 when the app is left stopped.
set -euo pipefail
cd "$(dirname "$0")/.."

instance=${1:?Usage: scripts/update.sh <instance>}
# shellcheck source=instance.sh
. scripts/instance.sh

# Long enough for the migrations a new server runs on startup.
wait=(--wait --wait-timeout 180)

# The app's images include the sidecar's, as it depends on it.
image=$(grep -vxF -f <(compose config --images tailscale) \
  <<<"$(compose config --images app)")
# Empty before the instance's first start.
old=$(compose images -q app)
compose pull --quiet
new=$(docker image inspect -f '{{.Id}}' "$image")
new=${new#sha256:}

if [[ $old == "$new" ]]; then
  # Still applied, in case compose.yml changed.
  compose up -d "${wait[@]}"
  echo "Already on the newest $image."
  exit 0
fi

# The server also snapshots before each migration, so a stopped app is
# updated without one.
snapshot=
if [[ -n $(compose ps --status running -q app) ]]; then
  wrote=$(compose exec -T app node apps/server/dist/cli.js snapshot)
  echo "$wrote"
  # Named by the container's TZ, which the host's date may not match.
  snapshot=${wrote##*/}
else
  echo "The app isn't running, so no snapshot was taken first." >&2
fi

if compose up -d "${wait[@]}"; then
  echo "Updated to $image ($new)."
  exit 0
fi
compose logs --tail 50 app >&2 || true

if [[ -z $old ]]; then
  compose stop app
  echo "The new instance didn't turn healthy, so it is left stopped." >&2
  exit 1
fi

# The old image takes the tag back locally, so a plain `up -d` keeps it until
# the next pull. A server older than the database's schema refuses to start,
# so this fails safely if the new one already migrated.
echo "$image ($new) didn't turn healthy; rolling back to $old." >&2
docker tag "$old" "$image"
if compose up -d "${wait[@]}"; then
  echo "Rolled back: running the previous image again." >&2
  exit 3
fi

compose stop app
echo "The previous image didn't start either, so the app is left stopped." >&2
if [[ -n $snapshot ]]; then
  echo "If the new server migrated the database, restore the snapshot taken first:" >&2
  echo "  scripts/restore.sh $instance $snapshot" >&2
fi
exit 1
