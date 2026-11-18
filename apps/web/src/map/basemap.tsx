import "maplibre-gl/dist/maplibre-gl.css"
import "./map.css"

import {
  addProtocol,
  GeoJSONSource,
  Map as MapLibre,
  prewarm,
  setWorkerUrl,
  type LngLatBoundsLike,
  type LngLatLike,
  type MapGeoJSONFeature,
  type PointLike,
} from "maplibre-gl"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import { Protocol } from "pmtiles"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { IconMinus, IconPlus } from "@tabler/icons-react"
import { cn } from "cn"
import { cubicBezier } from "motion"

import { Button } from "@/components/ui/button"
import { useDesk } from "@/hooks/use-desk"
import { reduced } from "@/lib/motion"

import { extractUrl } from "./extract"
import { exploreHome } from "./home"
import { areas, siteById, sites, type Area, type Site } from "./sites"
import {
  areaData,
  areaSource,
  clusterLayers,
  drawHatch,
  drawPin,
  hatchImage,
  hoveredSource,
  isZoneLayer,
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

// The desktop's list card, which the first fit aims beside: its inset from
// the map's edge and its width.
export const listCard = { inset: 12, width: 360 }

// How much of the map the sheet or card hides, which camera moves aim
// beside: the phone's sheet from the bottom, the desktop card from the left.
export type Cover = { left: number; bottom: number }

// What the sheet and cards over the map need from it: the map's box, which
// the phone's sheet stays inside, and a way to say what they cover, for the
// site they show (none for the desktop's list).
type Frame = {
  container: HTMLElement | null
  onCover: (cover: Cover, site?: string) => void
}
const FrameContext = createContext<Frame>({
  container: null,
  onCover: () => {},
})
export const useMapFrame = () => useContext(FrameContext)

// The sites the filters leave and whether the zones show, kept with the map
// so a new style (a theme change) draws them as they were.
let shownSites: readonly Site[] = sites
let zonesOn = true
// The list row's site the map rings, kept so a new style rings it too.
let hoveredSite: Site | undefined
// What the current style was built with: a change made before it loaded
// had no source or layer to go to, so it is applied once it has.
const built = { shown: sites as readonly Site[], zones: true }
function styleNow(theme: MapTheme, picked?: Site) {
  built.shown = shownSites
  built.zones = zonesOn
  return mapStyle(theme, tiles, {
    picked,
    shown: shownSites,
    showZones: zonesOn,
    hovered: hoveredSite,
  })
}

function applyShown(map: MapLibre) {
  if (!map.getSource(areaSource("atlantic"))) return
  built.shown = shownSites
  for (const area of Object.keys(areas) as Area[]) {
    void map
      .getSource<GeoJSONSource>(areaSource(area))
      ?.setData(areaData(area, shownSites))
      .then(() => mark(map, marked.current, true))
      .catch(() => {})
  }
}

function applyZones(map: MapLibre) {
  if (!map.getSource(areaSource("atlantic"))) return
  built.zones = zonesOn
  // By id, as getStyle() would copy every source's data to list them.
  for (const id of map.getLayersOrder()) {
    if (!isZoneLayer(map.getLayer(id))) continue
    map.setLayoutProperty(id, "visibility", zonesOn ? "visible" : "none")
  }
}
const sameSites = (a: readonly Site[], b: readonly Site[]) =>
  a === b || (a.length === b.length && a.every((site, i) => site === b[i]))

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
// The list row's site, ringed: its pin over everything, or, while it's in
// a cluster, the cluster's bubble, so the ring never cuts a count in half.
async function ringHovered(map: MapLibre) {
  const site = hoveredSite
  const source = map.getSource<GeoJSONSource>(hoveredSource)
  if (!source) return
  let data = pickedData(site)
  if (site) {
    const area = map.getSource<GeoJSONSource>(areaSource(site.area))
    const clusters = map.queryRenderedFeatures({
      layers: [`clusters-${site.area}`],
    })
    for (const cluster of clusters) {
      const leaves = await area
        ?.getClusterLeaves(cluster.properties.cluster_id as number, Infinity, 0)
        .catch(() => [])
      if (!leaves?.some((leaf) => leaf.properties?.id === site.id)) continue
      data = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: pointOf(cluster) },
            properties: { point_count: cluster.properties.point_count },
          },
        ],
      } as unknown as typeof data
      break
    }
  }
  // Moved on meanwhile.
  if (site !== hoveredSite) return
  await source.setData(data).catch(() => {})
}

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

// The map is made once and kept while the app runs: leaving the tab only
// takes its element out of the page, and coming back puts it in, drawn
// before the frame paints, rather than over plain sea while it is rebuilt.
type Kept = {
  map: MapLibre
  theme: MapTheme
  // Drawn once with land in it, so it shows at once from then on.
  drawn: boolean
  // The page showing it, which taps and the first draw report to.
  pick: (id: string | undefined) => void
  report: (state: MapState) => void
  reveal: () => void
}
let kept: Kept | undefined
const away = () => {}

// The site the camera aimed at, until the map is moved by hand, and the
// picked site the map shows and the one whose pin it has marked, which
// waits for the picked layer to have the site. Kept with the map.
const held: { current?: Site } = {}
// How far the desktop's card reaches over the map, which a cluster's zoom
// aims beside.
let coverLeft = 0
const shownPick: { current?: string } = {}
const marked: { current?: string } = {}

// Fitted to the coast's dive sites, not the metro. Upright, as on a phone,
// by height from Robben Island to Cape Point, False Bay's east shore a swipe
// away; a wider screen takes in the coast to Betty's Bay.
function homeView(element: HTMLElement, desk: boolean) {
  return {
    bounds: (element.clientHeight > element.clientWidth
      ? [
          [18.3, -34.38],
          [18.6, -33.765],
        ]
      : [
          [18.3, -34.43],
          [18.93, -33.78],
        ]) as LngLatBoundsLike,
    // Beside the desktop's list card, 12 px in and 360 px wide.
    fitBoundsOptions: {
      padding: desk
        ? {
            left:
              Math.min(
                listCard.inset + listCard.width,
                element.clientWidth * 0.6
              ) + 8,
            top: 8,
            right: 8,
            bottom: 8,
          }
        : 8,
    },
  }
}

function create(
  element: HTMLDivElement,
  theme: MapTheme,
  picked: Site | undefined,
  desk: boolean
) {
  const created = new MapLibre({
    container: element,
    style: styleNow(theme, picked),
    attributionControl: { compact: true },
    // Where it was left, or at a site in the address, or the coast.
    ...(camera ??
      (picked && {
        center: [picked.lon, picked.lat] as LngLatLike,
        zoom: siteZoom,
      }) ??
      homeView(element, desk)),
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
  // MapLibre opens the compact credit the first time it draws it, once
  // the style names its sources, and folds it only on a drag. It starts
  // folded to its (i) button here, in the same event, so it never shows.
  const credit = element.querySelector(".maplibregl-ctrl-attrib")
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
    if (built.shown !== shownSites) applyShown(created)
    if (built.zones !== zonesOn) applyZones(created)
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
      return kept?.pick(pins[0].properties.id as string)
    }
    // A name, placed clear of every pin, is a bigger target than its dot.
    const [name] = created.queryRenderedFeatures(point, {
      layers: nameLayers,
    })
    if (name) return kept?.pick(name.properties.id as string)
    const cluster = hits.find((hit) => hit.properties.cluster)
    if (!cluster) {
      if (second) return
      putDown = window.setTimeout(() => {
        putDown = undefined
        kept?.pick(undefined)
      }, 300)
      return
    }
    const source = created.getSource<GeoJSONSource>(cluster.source)
    const zoom = await source?.getClusterExpansionZoom(
      cluster.properties.cluster_id as number
    )
    // Left unanswered if the map was dropped meanwhile.
    if (zoom === undefined || kept?.map !== created) return
    held.current = undefined
    // Aimed at the middle of the map beside the desktop's card.
    created.easeTo({
      center: pointOf(cluster),
      zoom: zoom + 0.3,
      offset: [coverLeft / 2, 0],
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
    element.parentElement?.setAttribute("aria-busy", "true")
    if (event.originalEvent) held.current = undefined
  })
  created.on("moveend", () => {
    element.parentElement?.setAttribute("aria-busy", "false")
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
    kept?.report("failed")
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
    if (kept?.map !== created) return
    kept.drawn = true
    kept.reveal()
    kept.report("drawn")
  })
  return created
}

export default function Basemap({
  onState,
  site,
  onPick,
  filtered = sites,
  zones = true,
  hovered,
  children,
}: {
  onState?: (state: MapState) => void
  // The picked site's id, from the address, and a tap's choice.
  site?: string
  onPick?: (id: string | undefined) => void
  // The sites the filters leave, whether the zones show, and the site whose
  // list row is under the mouse, ringed.
  filtered?: readonly Site[]
  zones?: boolean
  hovered?: string
  // The controls, sheet and cards over the map.
  children?: ReactNode
}) {
  const picked = site ? siteById.get(site) : undefined
  const map = useRef<MapLibre | null>(null)
  const theme = useMapTheme()
  // A map kept in another theme is made again rather than shown wrong.
  const [shown, setShown] = useState(
    () => !!kept?.drawn && kept.theme === theme
  )
  const desk = useDesk()
  const report = useEffectEvent((state: MapState) => onState?.(state))
  const pick = useEffectEvent((id: string | undefined) => onPick?.(id))
  // A theme change redraws the style with the pick as it stands.
  const styleFor = useEffectEvent((look: MapTheme) => styleNow(look, picked))
  // The map's box, which the phone's sheet also stays inside: a ref too,
  // so the map is there on the first commit, before the pick's effect.
  const box = useRef<HTMLDivElement>(null)
  const [sheetBox, setSheetBox] = useState<HTMLDivElement | null>(null)
  const setBox = useCallback((element: HTMLDivElement | null) => {
    box.current = element
    setSheetBox(element)
  }, [])

  useLayoutEffect(() => {
    const wrapper = box.current
    if (!wrapper) return
    if (kept && kept.theme !== theme) {
      kept.map.remove()
      kept = undefined
    }
    if (!kept) {
      const element = document.createElement("div")
      element.className = "size-full"
      wrapper.append(element)
      shownSites = filtered
      zonesOn = zones
      kept = {
        map: create(element, theme, picked, desk),
        theme,
        drawn: false,
        pick: away,
        report: away,
        reveal: away,
      }
    }
    const current = kept
    const element = current.map.getContainer()
    wrapper.append(element)
    current.pick = (id) => pick(id)
    current.report = (state) => report(state)
    current.reveal = () => setShown(true)
    map.current = current.map
    // Resizing clears the canvas, so it is drawn again before the frame
    // paints, or the sidebar folding (or coming back) flashes it blank.
    const redraw = () => current.map.resize().redraw()
    if (current.drawn) {
      redraw()
      current.report("drawn")
    }
    const resize = new ResizeObserver(redraw)
    resize.observe(element)
    return () => {
      resize.disconnect()
      current.pick = current.report = current.reveal = away
      map.current = null
      // One not drawn yet (no signal, or left at once) starts again.
      element.remove()
      if (!current.drawn) {
        current.map.remove()
        kept = undefined
      }
    }
    // Put in once a visit; a theme change swaps its style below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A tap on the Explore tab while it shows: back to the coast, the tab
  // itself putting a picked site down.
  useEffect(() => {
    exploreHome.current = () => {
      const current = map.current
      if (!current) return
      held.current = undefined
      const { bounds, fitBoundsOptions } = homeView(
        current.getContainer(),
        desk
      )
      current.fitBounds(bounds, { ...fitBoundsOptions, animate: !reduced() })
    }
    return () => {
      exploreHome.current = undefined
    }
  }, [desk])

  useEffect(() => {
    if (!kept || !map.current || kept.theme === theme) return
    kept.theme = theme
    map.current.setStyle(styleFor(theme))
  }, [theme])

  // The picked pin moves to its own layer, and the map to it, aimed at the
  // middle of what the sheet or card leaves showing. A site in the address
  // when the map opens is placed there at once.
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
    (covered: Cover, site?: string) => {
      const before = cover.current
      cover.current = { ...covered, site }
      coverLeft = covered.left
      const next = waiting.current
      if (site && next?.site.id === site) {
        waiting.current = undefined
        return aim(next.site, next.jump)
      }
      const moved =
        before.left !== covered.left || before.bottom !== covered.bottom
      if (site && moved && held.current?.id === site) aim(held.current, false)
    },
    [aim]
  )
  // Below desk: no card covers the map's side, so a cluster's zoom aims at
  // the middle again after the window narrows.
  useEffect(() => {
    if (desk) return
    coverLeft = 0
    cover.current = { ...cover.current, left: 0 }
  }, [desk])
  // The filters' sites, each area's clusters counted again. Kept with the
  // map, so coming back with the same filters (a new array) changes nothing.
  useEffect(() => {
    const current = map.current
    if (!current || sameSites(filtered, shownSites)) return
    shownSites = filtered
    applyShown(current)
  }, [filtered])
  useEffect(() => {
    const current = map.current
    if (!current || zones === zonesOn) return
    zonesOn = zones
    applyZones(current)
  }, [zones])
  useEffect(() => {
    hoveredSite = hovered ? siteById.get(hovered) : undefined
    const current = map.current
    if (!current) return
    void ringHovered(current)
    // A zoom can take the site into a cluster or out of one.
    const follow = () => void ringHovered(current)
    current.on("moveend", follow)
    return () => void current.off("moveend", follow)
  }, [hovered])
  const frame = useMemo(
    () => ({ container: sheetBox, onCover }),
    [sheetBox, onCover]
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

  // Hidden on a wrapper, which the map's own element goes into after what
  // floats over it, so the controls and cards come first in the tab order:
  // React never draws that element, so it can't drop the classes MapLibre
  // adds, and draws only into the one box before it.
  return (
    <div
      ref={setBox}
      className={cn("relative size-full", !shown && "opacity-0")}
    >
      <div className="contents">
        <FrameContext value={frame}>{children}</FrameContext>
        {/* A mouse has no pinch, so desktop gets buttons, bottom right as
            on most maps, just above the credit, and after the card in the
            tab order. */}
        {desk && (
          <div
            role="group"
            aria-label="Zoom"
            className="absolute right-2.5 bottom-13 z-10 flex flex-col overflow-hidden rounded-[10px] border bg-background shadow-xs select-none"
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
      </div>
    </div>
  )
}
