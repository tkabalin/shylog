#!/usr/bin/env bash
# Checks the live public dive site map (SITE=https://…) serves this build's
# build.txt. With `live`, prints the build.txt it serves instead. Only that:
# checks of the page, tiles and images failed from the runner while passing
# from home, and what they checked is in _headers and wrangler.jsonc.
set -euo pipefail

site=${SITE:?}
get() { curl -fsS --retry 3 --max-time 20 "$site/build.txt"; }

if [[ ${1:-} = live ]]; then
  get || true
  exit 0
fi

built=$(cat apps/web/dist-divesites/build.txt)
# A new version takes a while to reach every edge.
for _ in $(seq 60); do
  live=$(get 2>/dev/null || true)
  [[ $live = "$built" ]] && break
  sleep 5
done
[[ $live = "$built" ]] || {
  echo "The site serves build ${live:-nothing}, not $built" >&2
  exit 1
}

echo "The site serves build \`$built\`." >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
