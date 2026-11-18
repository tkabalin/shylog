import { localValue } from "@/lib/local-value"

// The instance's ArcGIS key, which the server writes into the page. Empty
// where the instance has none, and the map then has no satellite.
const key =
  document
    .querySelector('meta[name="shylog-arcgis-key"]')
    ?.getAttribute("content") ?? ""

// Esri's World Imagery, in 256 px tiles, which sharpen as the map zooms.
const tile = (z: number | string, y: number | string, x: number | string) =>
  `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?token=${encodeURIComponent(key)}`
export const imageryTiles = key ? tile("{z}", "{y}", "{x}") : undefined

// One tile for the Satellite card's picture, Simon's Town's harbour, the
// ground the Map card's picture shows too.
export const imageryThumb = key ? tile(13, 4924, 4515) : undefined

// That picture fetched and decoded as Explore opens, and held, so Map
// options shows it at once: WebKit decodes again on mount unless a decoded
// image is still referenced. Dropped on a failure, to be tried again.
let thumb: HTMLImageElement | undefined
export function warmThumb() {
  if (!imageryThumb || thumb) return
  const image = new Image()
  image.src = imageryThumb
  thumb = image
  image.decode().catch(() => {
    if (thumb === image) thumb = undefined
  })
}

// Whether Esri refused the key, read from one tile, as the map's failed
// tiles carry no answer. Esri sends its refusals as 200s with a JSON body:
// 498 an invalid or expired key, 499 none, 403 the wrong address or rights.
const refusals = [401, 403, 498, 499]
export async function keyRefused(url = imageryThumb) {
  if (!url) return false
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (refusals.includes(res.status)) return true
    if (res.headers.get("Content-Type")?.startsWith("image/")) return false
    const body = (await res.json()) as { error?: { code?: unknown } }
    return refusals.includes(Number(body.error?.code))
  } catch {
    return false
  }
}

// Map or satellite, kept on this device.
export const satelliteChosen = localValue(
  "explore-satellite",
  (stored) => stored === "on",
  (on: boolean) => (on ? "on" : "off")
)

// Set when the imagery doesn't come (an expired key, a spent free tier, a
// signal with no internet behind it), so the map shows its own land until
// Satellite is chosen again or the signal comes back.
let failed = false
const listeners = new Set<() => void>()
export const imageryFailed = {
  get: () => failed,
  set(next: boolean) {
    if (failed === next) return
    failed = next
    for (const listener of listeners) listener()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },
}
window.addEventListener("online", () => imageryFailed.set(false))
