import "maplibre-gl/dist/maplibre-gl.css"
import "./map.css"

import {
  addProtocol,
  GeoJSONSource,
  Map as MapLibre,
  prewarm,
  setWorkerUrl,
  type LngLatLike,
  type MapGeoJSONFeature,
  type PointLike,
} from "maplibre-gl"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import { Protocol } from "pmtiles"
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import { IconMinus, IconPlus } from "@tabler/icons-react"
import { cn } from "cn"
import { cubicBezier } from "motion"

import { Button } from "@/components/ui/button"
import { useDesk } from "@/hooks/use-desk"

import { extractUrl } from "./extract"
import { SiteSheet, type Cover } from "./site-sheet"
import { siteById, type Site } from "./sites"
import {
  areaSource,
  clusterLayers,
  drawHatch,
  drawPin,
  hatchImage,
  mapStyle,
  nameLayers,
  pickedData,
  pickedSource,
  pinImage,
  pinImages,
  pinLayers,
  type MapTheme,
} from "./style"

// MapLibre looks for its worker beside its own file, which bundling moves,
// so Vite builds the worker and hands over its URL. Started now and kept,
// so leaving the tab and coming back doesn't start them again.
setWorkerUrl(workerUrl)
prewarm()

// The extract is one file the map reads by range requests, a tile at a time.
const tiles = `pmtiles://${extractUrl}`
const protocol = new Protocol()
addProtocol("pmtiles", protocol.tile)

// Where the map was left, so coming back to the tab finds it there.
let camera: { center: LngLatLike; zoom: number } | undefined

// The theme class on <html>, which the theme provider sets, so the map
// follows the app's choice rather than only the system's.
const readTheme = (): MapTheme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light"
function useMapTheme() {
  const [theme, setTheme] = useState(readTheme)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [])
  return theme
}

export type MapState = "drawn" | "failed"

// A site's name shown as picked, or not, by feature state.
function mark(map: MapLibre, id: string | undefined, picked: boolean) {
  const site = id ? siteById.get(id) : undefined
  if (!site || !map.getSource(areaSource(site.area))) return
  map.setFeatureState(
    { source: areaSource(site.area), id: site.id },
    { picked }
  )
}

// A finger's reach around a tap, in pixels, so wet hands still hit a pin.
const reach = 18
const pointOf = (feature: MapGeoJSONFeature) =>
  (feature.geometry as { coordinates: [number, number] }).coordinates
// Close enough to tell a site's neighbours apart, opening one.
const siteZoom = 12.5
// The sheet's slide, its --ease-drawer over about its 450 ms, read from the
// theme, so the map and the sheet move as one.
let slide: ((t: number) => number) | undefined
const sheetEasing = () => {
  if (slide) return slide
  const [a, b, c, d] =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--ease-drawer")
      .match(/-?[\d.]+/g)
      ?.map(Number) ?? []
  if (d !== undefined) slide = cubicBezier(a, b, c, d)
  return slide
}

export default function Basemap({
  onState,
  site,
  onPick,
}: {
  onState?: (state: MapState) => void
  // The picked site's id, from the address, and a tap's choice.
  site?: string
  onPick?: (id: string | undefined) => void
}) {
  const picked = site ? siteById.get(site) : undefined
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const theme = useMapTheme()
  const drawn = useRef(theme)
  const [shown, setShown] = useState(false)
  const desk = useDesk()
  const report = useEffectEvent((state: MapState) => onState?.(state))
  const pick = useEffectEvent((id: string | undefined) => onPick?.(id))
  // The site the map shows as picked, and the one whose pin it has marked,
  // which waits for the picked layer to have the site.
  const shownPick = useRef<string>(undefined)
  const marked = useRef<string>(undefined)
  // The site the camera aimed at, until the map is moved by hand.
  const held = useRef<Site>(undefined)
  // A theme change redraws the style with the pick as it stands.
  const styleFor = useEffectEvent((look: MapTheme) =>
    mapStyle(look, tiles, picked)
  )

  useEffect(() => {
    if (!container.current) return
    const created = new MapLibre({
      container: container.current,
      style: mapStyle(theme, tiles, picked),
      attributionControl: { compact: true },
      // Fitted to the coast's dive sites, not the metro. Upright, as on a
      // phone, by height from Robben Island to Cape Point, False Bay's east
      // shore a swipe away; a wider screen takes in the coast to Betty's Bay.
      // A site in the address opens there instead.
      ...(camera ??
        (picked && {
          center: [picked.lon, picked.lat] as LngLatLike,
          zoom: siteZoom,
        }) ?? {
          bounds:
            container.current.clientHeight > container.current.clientWidth
              ? [
                  [18.3, -34.38],
                  [18.6, -33.765],
                ]
              : [
                  [18.3, -34.43],
                  [18.93, -33.78],
                ],
          fitBoundsOptions: { padding: 8 },
        }),
      maxBounds: [
        [17.9, -34.75],
        [19.3, -33.3],
      ],
      minZoom: 8.5,
      maxZoom: 16,
      // Past a source's last zoom its tiles are stretched, never split, so
      // the overview's few tiles go on covering the coast as the map moves.
      zoomLevelsToOverscale: undefined,
      // Labels swap at once: a count fading out beside a bubble that changed
      // in a frame (circles don't fade) hung on as a stray second number.
      fadeDuration: 0,
      // A flick glides on at the finger's speed, as in the phone's own
      // maps, where MapLibre's own drops to half and glides a fifth as far.
      dragPan: { linearity: 0.6, deceleration: 1000, maxSpeed: 1500 },
      // A flat chart: north stays up, as on a dive slate.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      // Resized below on every frame, so the sidebar folding doesn't step.
      trackResize: false,
    })
    created.touchZoomRotate.disableRotation()
    created.keyboard.disableRotation()
    created.on("moveend", () => {
      camera = { center: created.getCenter(), zoom: created.getZoom() }
    })
    // Resizing clears the canvas, so it is drawn again before the frame
    // paints, or the sidebar folding flashes it blank.
    const resize = new ResizeObserver(() => created.resize().redraw())
    resize.observe(container.current)
    // MapLibre opens the compact credit the first time it draws it, once
    // the style names its sources, and folds it only on a drag. It starts
    // folded to its (i) button here, in the same event, so it never shows.
    const credit = container.current.querySelector(".maplibregl-ctrl-attrib")
    const fold = () => {
      if (!credit?.classList.contains("maplibregl-compact-show")) return
      credit.classList.remove("maplibregl-compact-show")
      created.off("styledata", fold).off("sourcedata", fold)
    }
    created.on("styledata", fold)
    created.on("sourcedata", fold)
    // The no-diving hatch is drawn here, as a style can only name images.
    // Both themes' go in as the style loads: one added when a tile first
    // asks for it reached only some tiles.
    created.on("style.load", () => {
      for (const look of ["light", "dark"] as const) {
        if (!created.hasImage(hatchImage(look))) {
          created.addImage(hatchImage(look), drawHatch(look), {
            pixelRatio: 2,
          })
        }
        for (const { shape, picked: isPicked } of pinImages) {
          const name = pinImage(look, shape, isPicked)
          if (created.hasImage(name)) continue
          created.addImage(name, drawPin(look, shape, isPicked), {
            pixelRatio: 2,
          })
        }
      }
      // A new style starts with no feature state, and with the pick as it
      // stood in its picked layer, which a pick before the first had no
      // layer to wait for.
      marked.current = shownPick.current
      mark(created, marked.current, true)
    })
    // A tap opens the nearest pin within a finger's reach, else the site
    // whose name it lands on, or zooms into a cluster; one on open water puts
    // the site down, unless a second tap follows it to zoom in.
    let putDown: number | undefined
    created.on("click", async ({ point }) => {
      const second = putDown !== undefined
      clearTimeout(putDown)
      putDown = undefined
      const box: [PointLike, PointLike] = [
        [point.x - reach, point.y - reach],
        [point.x + reach, point.y + reach],
      ]
      const hits = created.queryRenderedFeatures(box, {
        layers: [...pinLayers, ...clusterLayers, "picked"],
      })
      const distance = (hit: MapGeoJSONFeature) => {
        const at = created.project(pointOf(hit))
        return Math.hypot(at.x - point.x, at.y - point.y)
      }
      const pins = hits.filter((hit) => !hit.properties.cluster)
      if (pins.length) {
        pins.sort((a, b) => distance(a) - distance(b))
        return pick(pins[0].properties.id as string)
      }
      // A name, placed clear of every pin, is a bigger target than its dot.
      const [name] = created.queryRenderedFeatures(point, {
        layers: nameLayers,
      })
      if (name) return pick(name.properties.id as string)
      const cluster = hits.find((hit) => hit.properties.cluster)
      if (!cluster) {
        if (second) return
        putDown = window.setTimeout(() => {
          putDown = undefined
          pick(undefined)
        }, 300)
        return
      }
      const source = created.getSource<GeoJSONSource>(cluster.source)
      const zoom = await source?.getClusterExpansionZoom(
        cluster.properties.cluster_id as number
      )
      // Left unanswered if Explore closed meanwhile, as the map is gone.
      if (zoom === undefined || map.current !== created) return
      held.current = undefined
      created.easeTo({
        center: pointOf(cluster),
        zoom: zoom + 0.3,
      })
    })
    // One target for every layer, so moving from a name onto its pin
    // doesn't fire the name's leave after the pin's enter.
    const pointable = [...pinLayers, ...nameLayers, ...clusterLayers, "picked"]
    created.on("mouseenter", pointable, () => {
      created.getCanvas().style.cursor = "pointer"
    })
    created.on("mouseleave", pointable, () => {
      created.getCanvas().style.cursor = ""
    })
    // Busy while the camera moves, which tests wait out before a tap.
    created.on("movestart", (event) => {
      container.current?.parentElement?.setAttribute("aria-busy", "true")
      if (event.originalEvent) held.current = undefined
    })
    created.on("moveend", () => {
      container.current?.parentElement?.setAttribute("aria-busy", "false")
    })
    // Hidden until the land has drawn: the zones close across it, so
    // without it they show shapes ashore. With no signal the extract can't
    // load, and pmtiles would keep that failure, so it is dropped to be
    // read again next time.
    let settled = false
    const fail = () => {
      if (settled) return
      settled = true
      protocol.tiles.delete(extractUrl)
      report("failed")
    }
    created.on("error", (event) => {
      // A source's errors carry its id, and a single tile's the tile.
      const { sourceId, tile } = event as { sourceId?: string; tile?: unknown }
      if (sourceId === "osm" && !tile) fail()
    })
    created.once("idle", () => {
      // Tiles that failed still let the map go idle, with nothing in them.
      const land = ["earth", "water"].some(
        (layer) =>
          created.querySourceFeatures("osm", { sourceLayer: layer }).length
      )
      if (!land) return fail()
      settled = true
      setShown(true)
      report("drawn")
    })
    map.current = created
    return () => {
      resize.disconnect()
      clearTimeout(putDown)
      created.remove()
      map.current = null
    }
    // The map is made once; theme changes swap its style below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!map.current || drawn.current === theme) return
    drawn.current = theme
    map.current.setStyle(styleFor(theme))
  }, [theme])

  // The picked pin moves to its own layer, and the map to it, aimed at the
  // middle of what the sheet or card leaves showing. A site in the address
  // when the map opens is placed there at once.
  const [sheetBox, setSheetBox] = useState<HTMLDivElement | null>(null)
  const cover = useRef<Cover & { site?: string }>({ left: 0, bottom: 0 })
  const waiting = useRef<{ site: Site; jump: boolean }>(undefined)
  const aim = useCallback((site: Site, jump: boolean) => {
    const current = map.current
    const { left, bottom } = cover.current
    held.current = site
    current?.easeTo({
      center: [site.lon, site.lat],
      zoom: Math.max(current.getZoom(), siteZoom),
      offset: [left / 2, -bottom / 2],
      duration: jump ? 0 : 450,
      easing: sheetEasing(),
    })
  }, [])
  // The move waits for the sheet to say what it covers, a render after a
  // first pick, and until the map is moved by hand keeps the site in the
  // middle of what's left as that changes (a peek rewrapped, a wider card).
  const onCover = useCallback(
    (covered: Cover, site: string) => {
      const before = cover.current
      cover.current = { ...covered, site }
      const next = waiting.current
      if (next?.site.id === site) {
        waiting.current = undefined
        return aim(next.site, next.jump)
      }
      const moved =
        before.left !== covered.left || before.bottom !== covered.bottom
      if (moved && held.current?.id === site) aim(held.current, false)
    },
    [aim]
  )
  const placed = useRef(false)
  useEffect(() => {
    const current = map.current
    if (!current || (placed.current && shownPick.current === picked?.id)) {
      return
    }
    const jump = !placed.current
    placed.current = true
    shownPick.current = picked?.id
    // The old pin's mark goes and the new one's comes once the picked layer
    // has the site, so its name never shows twice or not at all.
    void current
      .getSource<GeoJSONSource>(pickedSource)
      ?.setData(pickedData(picked))
      .then(() => {
        if (map.current !== current || shownPick.current !== picked?.id) {
          return
        }
        mark(current, marked.current, false)
        marked.current = picked?.id
        mark(current, picked?.id, true)
      })
      .catch(() => {})
    waiting.current = undefined
    held.current = undefined
    if (!picked) return
    if (cover.current.site === picked.id) aim(picked, jump)
    else waiting.current = { site: picked, jump }
    // The camera follows the pick alone, not the layout's width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked])

  // Hidden on a wrapper: React rewriting the container's classes would drop
  // the ones MapLibre adds to it.
  return (
    <div
      ref={setSheetBox}
      className={cn("relative size-full", !shown && "opacity-0")}
    >
      <div ref={container} className="size-full" />
      {/* A mouse has no pinch, so desktop gets buttons, bottom right as on
          most maps, just above the credit. */}
      {desk && (
        <div
          role="group"
          aria-label="Zoom"
          className="absolute right-2.5 bottom-13 flex flex-col overflow-hidden rounded-[10px] border bg-background shadow-xs select-none"
        >
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none"
            aria-label="Zoom in"
            onClick={() => {
              // Moved by hand, as a pinch is, so the camera stops following.
              held.current = undefined
              map.current?.zoomIn()
            }}
          >
            <IconPlus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none border-t-border"
            aria-label="Zoom out"
            onClick={() => {
              held.current = undefined
              map.current?.zoomOut()
            }}
          >
            <IconMinus />
          </Button>
        </div>
      )}
      <SiteSheet
        site={picked}
        container={sheetBox}
        onCover={onCover}
        onClose={() => onPick?.(undefined)}
      />
    </div>
  )
}
