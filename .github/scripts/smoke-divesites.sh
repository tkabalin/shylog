#!/usr/bin/env bash
# Checks the live public dive site map (SITE=https://…) serves this build:
# its page, a tile cached for good, a site image, and a 404 (not the page)
# for a missing tile. With `live`, prints the build.txt it serves instead.
set -euo pipefail

site=${SITE:?}
host=${site#https://}
dist=apps/web/dist-divesites

# From the zone's own nameserver, as the runner's resolver can keep a
# not-found answer from before the first deploy for half an hour. dig prints
# a failed lookup's errors among its answers, so awk keeps the first name or
# address, reading all of them so dig never ends on SIGPIPE.
address() {
  ns=$(dig +short NS "${host#*.}" | awk '/\.$/ && !n++') || return 1
  [[ $ns ]] && dig +short "@$ns" "$host" A | awk '/^[0-9.]+$/ && !n++'
}
# Retried, as this runs on every push to main, and a busy edge mustn't fail
# one that changed nothing. A 404 too, as an edge can serve the new build.txt
# a moment before the rest of the deploy (seen on 13bf53b).
get() {
  ip=$(address) && [[ $ip ]] || { echo "No address for $host" >&2; return 1; }
  curl -fsS --retry 3 --retry-all-errors --max-time 20 \
    --resolve "$host:443:$ip" "$@"
}
status() {
  ip=$(address) && [[ $ip ]] || { echo "No address for $host" >&2; return 1; }
  curl -sS --retry 3 --max-time 20 --resolve "$host:443:$ip" \
    -o /dev/null -w "%{http_code}" "$1"
}

if [[ ${1:-} = live ]]; then
  get "$site/build.txt" || true
  exit 0
fi

built=$(cat "$dist/build.txt")
# A new version, or the first deploy's new name, takes a while to reach
# every edge.
for _ in $(seq 60); do
  [[ $(get "$site/build.txt" 2>/dev/null || true) = "$built" ]] && break
  sleep 5
done
live=$(get "$site/build.txt")
[[ $live = "$built" ]] || {
  echo "The site still serves build $live, not $built" >&2
  exit 1
}

# Read whole before grep, as a grep that stops early would end curl with
# SIGPIPE, failing the script under pipefail.
page=$(get "$site/")
grep -q "<title>Cape Town Dive Sites</title>" <<<"$page"
tile=$(cd "$dist" && find tiles -name '*.pbf' -print -quit)
headers=$(get -I "$site/$tile")
grep -qi "^cache-control: public, max-age=31536000, immutable" <<<"$headers" || {
  echo "A tile isn't cached for good: $headers" >&2
  exit 1
}
image=$(cd "$dist" && find assets -name 'site-*.webp' -print -quit)
get -o /dev/null "$site/$image"
missing=$(status "$site/${tile%/*}/missing.pbf")
[[ $missing = 404 ]] || {
  echo "A missing tile answered $missing, not 404" >&2
  exit 1
}

echo "The site serves build \`$built\`." >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
