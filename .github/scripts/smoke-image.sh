#!/usr/bin/env bash
# Starts the built image as Compose runs it (read-only, as the node user, on
# a bind-mounted data folder, with the host's /dev as the dive computer's
# override mounts it) and checks the server,
# the web app, the time zone, the backup CLI and dctool work inside it.
# Usage: .github/scripts/smoke-image.sh <image> [commit]
set -euo pipefail

image=${1:?Usage: smoke-image.sh <image> [commit]}
# The commit the image was built from, which the You tab shows as its version.
revision=${2:-}
fixtures=$(cd "$(dirname "$0")/../../fixtures/dctool" && pwd)
data=$(mktemp -d)
# The container's node user is not the runner's user.
chmod 777 "$data"
container=$(docker run -d --read-only --tmpfs /tmp --cap-drop ALL \
  --mount type=bind,src=/dev,dst=/host/dev,readonly,bind-recursive=disabled \
  --device-cgroup-rule 'c 188:* rw' --group-add 2000 \
  -v "$fixtures:/fixtures:ro" \
  -v "$data:$data" -e SHYLOG_DATA_DIR="$data" \
  -e SHYLOG_ALLOWED_LOGINS=ci@example.com \
  -e SHYLOG_ORIGIN=https://shylog.example.ts.net \
  -e SHYLOG_APP_NAME="Shylog CI" -e TZ=Africa/Johannesburg "$image")
trap 'docker logs "$container"; docker rm -f "$container" >/dev/null' EXIT

# The server listens on the container's loopback, as behind the sidecar.
get() {
  docker exec "$container" node -e "
    fetch('http://127.0.0.1:3000$1', {
      headers: { 'X-Shylog': '1', 'Tailscale-User-Login': 'ci@example.com' },
    }).then(async (res) => {
      if (!res.ok) process.exit(1)
      process.stdout.write(await res.text())
    }, () => process.exit(1))"
}

# The image's own healthcheck, which scripts/update.sh waits on.
for _ in $(seq 30); do
  [[ $(docker inspect -f '{{.State.Health.Status}}' "$container") == healthy ]] && break
  sleep 1
done
[[ $(docker inspect -f '{{.State.Health.Status}}' "$container") == healthy ]]
get /api/health | jq -e '.integrity == "ok" and .diveCount == 0'
# The log is JSON lines, each naming the instance, and startup's carries
# the commit the image was built from.
docker logs "$container" 2>/dev/null | jq -se --arg rev "${revision:-dev}" '
  (map(select(.event == "listening")) | length == 1 and .[0].version == $rev)
  and all(.[]; .instance == "shylog")'
get /manifest.webmanifest | jq -e '.name == "Shylog CI"'
# The built web app, with its title from SHYLOG_APP_NAME and its assets.
page=$(get /)
grep -q '<title>Shylog CI</title>' <<<"$page"
asset=$(grep -o '/assets/[^"]*\.js' <<<"$page" | head -n 1)
get "$asset" >/dev/null
# The service worker precaches the app, so it opens with no signal.
get /sw.js | grep -q 'assets/'
# The build argument reached the bundle, so About doesn't say "dev".
if [[ -n $revision ]]; then
  docker exec "$container" grep -rqF "${revision:0:7}" apps/web/dist/assets
fi
# Node's own ICU data answers TZ, so the slim image needs no tzdata.
docker exec "$container" node -e \
  'process.exit(new Date(2026, 0, 1).getTimezoneOffset() === -120 ? 0 : 1)'
docker exec "$container" node apps/server/dist/cli.js snapshot
docker exec "$container" node apps/server/dist/cli.js drill
# dctool parses a raw download from each watch to exactly the committed XML.
# The D4i dive has mandatory safety stops, which only the patched parser
# reports.
# Without the host's submounts, so none of its terminals; assigned first,
# so a failing exec stops the script.
pts=$(docker exec "$container" ls -A /host/dev/pts)
[[ -z $pts ]]
parse() {
  docker exec "$container" dctool -q -d "$1" parse -o /dev/stdout \
    "/fixtures/$2/raw/$3.bin" | cmp - "$fixtures/$2/xml/$3.xml"
}
parse "Suunto D4i" d4i 20260721T074742-EA070715072F2A
grep -q 'safety stop (mandatory)' \
  "$fixtures/d4i/xml/20260721T074742-EA070715072F2A.xml"
parse "Suunto Zoop Novo" zoop-novo 20251129T153458-E9070B1D0F223A
docker exec "$container" test -f /usr/share/doc/libdivecomputer/COPYING
docker exec "$container" test -f /usr/share/doc/libdivecomputer/libdivecomputer.tar.gz
# The LGPL's point for a changed build: the change itself, and where it's from.
docker exec "$container" test -f /usr/share/doc/libdivecomputer/stop-events.patch
docker exec "$container" test -f /usr/share/doc/libdivecomputer/SOURCE
