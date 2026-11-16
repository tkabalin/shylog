import "maplibre-gl/dist/maplibre-gl.css"
import "./map.css"

import {
  addProtocol,
  Map as MapLibre,
  prewarm,
  setWorkerUrl,
  type LngLatLike,
} from "maplibre-gl"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import { Protocol } from "pmtiles"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { IconMinus, IconPlus } from "@tabler/icons-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { useDesk } from "@/hooks/use-desk"

import { extractUrl } from "./extract"
import { basemapStyle, type MapTheme } from "./style"

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

export default function Basemap({
  onState,
}: {
  onState?: (state: MapState) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const theme = useMapTheme()
  const drawn = useRef(theme)
  const [shown, setShown] = useState(false)
  const desk = useDesk()
  const report = useEffectEvent((state: MapState) => onState?.(state))

  useEffect(() => {
    if (!container.current) return
    const created = new MapLibre({
      container: container.current,
      style: basemapStyle(theme, tiles),
      attributionControl: { compact: true },
      // Fitted to the coast's dive sites, not the metro. Upright, as on a
      // phone, by height from Robben Island to Cape Point, False Bay's east
      // shore a swipe away; a wider screen takes in the coast to Betty's Bay.
      ...(camera ?? {
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
    // Hidden until the land has drawn, so it never shows half drawn. With
    // no signal the extract can't load, and pmtiles would keep that
    // failure, so it is dropped to be read again next time.
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
      created.remove()
      map.current = null
    }
    // The map is made once; theme changes swap its style below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!map.current || drawn.current === theme) return
    drawn.current = theme
    map.current.setStyle(basemapStyle(theme, tiles))
  }, [theme])

  // Hidden on a wrapper: React rewriting the container's classes would drop
  // the ones MapLibre adds to it.
  return (
    <div className={cn("relative size-full", !shown && "opacity-0")}>
      <div ref={container} className="size-full" />
      {/* A mouse has no pinch, so desktop gets buttons, bottom right as on
          most maps, just above the credit. */}
      {desk && (
        <div
          role="group"
          aria-label="Zoom"
          className="absolute right-2.5 bottom-13 flex flex-col overflow-hidden rounded-[10px] border bg-background shadow-xs"
        >
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none"
            aria-label="Zoom in"
            onClick={() => map.current?.zoomIn()}
          >
            <IconPlus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none border-t-border"
            aria-label="Zoom out"
            onClick={() => map.current?.zoomOut()}
          >
            <IconMinus />
          </Button>
        </div>
      )}
    </div>
  )
}
