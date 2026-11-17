import { extractKept } from "./extract"
import { keepTrying } from "./keep-trying"

// The service worker keeps the site images in this cache as they pass
// (vite.config.ts names it too), so every site map shows with no signal.
const cacheName = "map-images"

// Downloads every site image ahead of any visit to Explore, as the
// extract is and once it's kept, thumbnails first so the sheets' strips
// fill soonest.
async function keep() {
  if (!("caches" in window) || !navigator.serviceWorker) return
  await navigator.serviceWorker.ready
  if (!navigator.serviceWorker.controller) return
  await extractKept
  const { imageUrls } = await import("./image-urls")
  const path = (url: string) => new URL(url, location.href).pathname
  const urls = Object.entries(imageUrls)
    .sort(
      ([a], [b]) =>
        Number(!a.endsWith("-thumb")) - Number(!b.endsWith("-thumb"))
    )
    .map(([, url]) => url)
  const wanted = new Set(urls.map(path))
  const cache = await caches.open(cacheName)
  const held = new Set((await cache.keys()).map(({ url }) => path(url)))
  const left = urls.filter((url) => !held.has(path(url)))
  // A few at a time: quicker than one, and gentle on a weak signal. One
  // that fails doesn't stop the rest, and the run fails once they're done,
  // so the next try is the only one running.
  let failed = false
  const next = async (): Promise<void> => {
    const url = left.shift()
    if (!url) return
    try {
      // Past the browser's own cache: the worker's copy is the one kept,
      // and 48 MB twice would crowd the phone.
      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) throw new Error(`${response.status} for ${url}`)
      // Read to the end, so the worker's copy is whole.
      await response.body?.pipeTo(new WritableStream())
    } catch {
      failed = true
    }
    return next()
  }
  await Promise.all(Array.from({ length: 4 }, next))
  if (failed) throw new Error("Some site images didn't download")
  // Ones left from an earlier version go, only once this one has all of
  // its own: a window still on an older version, whose files the server
  // no longer has, never gets this far to drop a newer one's.
  for (const request of await cache.keys()) {
    if (!wanted.has(path(request.url))) await cache.delete(request)
  }
}

export const keepImages = () => keepTrying(keep)

// An instance that turned Explore off frees what a phone kept from before.
export function dropImages() {
  if ("caches" in window) void caches.delete(cacheName).catch(() => {})
}
