import url from "./basemap.pmtiles?url"

// The basemap extract, named by its contents like the app's other assets,
// so a new extract is a new file and a phone never mixes the two.
export const extractUrl = url
// The Protomaps build it was cut from, which Sources names; set by hand
// when scripts/map/basemap.ts writes a new one.
export const extractBuilt = "2026-11-16"

// The service worker keeps the whole extract in this cache and cuts the
// map's range requests from it (vite.config.ts names it too), so the map
// works with no signal.
const cacheName = "map-extract"

// Downloads the extract ahead of any visit to Explore, once the worker
// controls the page: fetched whole, the worker stores it as it passes.
// Checked at every launch and whenever the signal comes back.
async function keep() {
  if (!("caches" in window) || !navigator.serviceWorker) return
  await navigator.serviceWorker.ready
  if (!navigator.serviceWorker.controller) return
  const cache = await caches.open(cacheName)
  if (await cache.match(extractUrl)) return
  const response = await fetch(extractUrl)
  // Read to the end, so the worker's copy is whole; nothing else needs it.
  await response.body?.pipeTo(new WritableStream())
}

export function keepExtract() {
  // One download at a time, however many reasons to try arrive together.
  let running: Promise<void> | undefined
  const attempt = () => {
    running ??= keep()
      .catch(() => {})
      .finally(() => (running = undefined))
  }
  attempt()
  window.addEventListener("online", attempt)
  navigator.serviceWorker?.addEventListener("controllerchange", attempt)
}

// An instance that turned Explore off frees the 10 MB a phone kept from
// before.
export function dropExtract() {
  if ("caches" in window) void caches.delete(cacheName).catch(() => {})
}
