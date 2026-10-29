#!/usr/bin/env bash
# Starts the built image as Compose runs it (read-only, as the node user, on
# a bind-mounted data folder) and checks the server, the web app, the time
# zone and the backup CLI work inside it.
# Usage: .github/scripts/smoke-image.sh <image> [commit]
set -euo pipefail

image=${1:?Usage: smoke-image.sh <image> [commit]}
# The commit the image was built from, which the You tab shows as its version.
revision=${2:-}
data=$(mktemp -d)
# The container's node user is not the runner's user.
chmod 777 "$data"
container=$(docker run -d --read-only --tmpfs /tmp --cap-drop ALL \
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
get /manifest.webmanifest | jq -e '.name == "Shylog CI"'
# The built web app, with its title from SHYLOG_APP_NAME and its assets.
page=$(get /)
grep -q '<title>Shylog CI</title>' <<<"$page"
asset=$(grep -o '/assets/[^"]*\.js' <<<"$page" | head -n 1)
get "$asset" >/dev/null
# The build argument reached the bundle, so About doesn't say "dev".
if [[ -n $revision ]]; then
  docker exec "$container" grep -rqF "${revision:0:7}" apps/web/dist/assets
fi
# Node's own ICU data answers TZ, so the slim image needs no tzdata.
docker exec "$container" node -e \
  'process.exit(new Date(2026, 0, 1).getTimezoneOffset() === -120 ? 0 : 1)'
docker exec "$container" node apps/server/dist/cli.js snapshot
docker exec "$container" node apps/server/dist/cli.js drill
