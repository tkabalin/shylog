import "maplibre-gl/dist/maplibre-gl.css"
import "./map.css"

import {
  GeoJSONSource,
  Map as MapLibre,
  prewarm,
  setWorkerUrl,
  type LngLat,
  type LngLatBoundsLike,
  type LngLatLike,
  type MapGeoJSONFeature,
  type MapSourceDataEvent,
  type PointLike,
  type StyleSpecification,
} from "maplibre-gl"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
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
import { reportError } from "@/data/client-log"
import { useDesk } from "@/hooks/use-desk"
import { reduced } from "@/lib/motion"

import { aerialAt } from "./aerial"
import { exploreHome } from "./home"
import { publicSite } from "./host"
import { keyRefused } from "./imagery"
import { cardWidth } from "./card-width"
import {
  areas,
  isPage,
  mapLink,
  siteById,
  sites,
  type Area,
  type Page,
  type Site,
} from "./sites"
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
  pickedLayers,
  pickedSource,
  pinImage,
  pinImages,
  pinLayers,
  type MapTheme,
} from "./style"
import { basemap, forgetFailure } from "./tiles"

// MapLibre looks for its worker beside its own file, which bundling moves,
// so Vite builds the worker and hands over its URL. Started now and kept,
// so leaving the tab and coming back doesn't start them again.
setWorkerUrl(workerUrl)
prewarm()

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
export const listCard = { inset: 12 }

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
// The satellite imagery's tiles, while it shows, and how its tiles have
// fared since it was switched on: replaced on a switch, so a key check
// still running for the last one can tell it's stale.
let imageryOn: string | undefined
type ImageryLoad = { came: boolean; failed: number; refused?: boolean }
let imageryLoad: ImageryLoad = { came: false, failed: 0 }
// The list row's site the map rings, kept so a new style rings it too.
let hoveredSite: Site | undefined
// What the current style was built with: a change made before it loaded
// had no source or layer to go to, so it is applied once it has.
const built = { shown: sites as readonly Site[], zones: true }
function styleNow(theme: MapTheme, picked?: Site | Page) {
  built.shown = shownSites
  built.zones = zonesOn
  return mapStyle(theme, basemap, {
    picked,
    shown: shownSites,
    showZones: zonesOn,
    hovered: hoveredSite,
    imagery: imageryOn,
  })
}

// The imagery is sharp enough for a reef's rocks and kelp, about 0.3 m a
// pixel, where the map's own extract has nothing more to show past 16. The
// City's aerial photos, at 8 cm, take a middle of the map on them one closer.
const satelliteZoom = 18
const maxZoom = (center?: LngLat) =>
  !imageryOn
    ? 16
    : center && aerialAt([center.lng, center.lat])
      ? satelliteZoom + 1
      : satelliteZoom

// Map or satellite, swapped live; the style's diff keeps the tiles and the
// picked site's mark it shares.
function applyImagery(
  map: MapLibre,
  imagery: string | undefined,
  style: () => StyleSpecification
) {
  imageryOn = imagery
  imageryLoad = { came: false, failed: 0 }
  map.setMaxZoom(maxZoom(map.getCenter()))
  map.setStyle(style())
}

function applyShown(map: MapLibre) {
  if (!map.getSource(areaSource("atlantic"))) return
  built.shown = shownSites
  const picked = shownPick.current ? mapLink(shownPick.current) : undefined
  for (const area of Object.keys(areas) as Area[]) {
    void map
      .getSource<GeoJSONSource>(areaSource(area))
      ?.setData(areaData(area, shownSites, picked))
      .then(() => mark(map, marked.current, true))
      .catch(() => {})
  }
  // A picked page shows only the sites the filters leave.
  if (picked && isPage(picked)) {
    void map
      .getSource<GeoJSONSource>(pickedSource)
      ?.setData(pickedData(picked, shownSites))
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

// The sites a pick shows: the one, or every site a picked page shares.
const sitesOf = (link: Site | Page) => (isPage(link) ? link.sites : [link])
// The middle of what a pick shows.
function centreOf(link: Site | Page): [number, number] {
  const shown = sitesOf(link)
  const lons = shown.map(({ lon }) => lon)
  const lats = shown.map(({ lat }) => lat)
  return [
    (Math.min(...lons) + Math.max(...lons)) / 2,
    (Math.min(...lats) + Math.max(...lats)) / 2,
  ]
}

// A site's name shown as picked, or not, by feature state: a page's every
// site's, as the picked layer shows them.
function mark(map: MapLibre, id: string | undefined, picked: boolean) {
  const link = id ? mapLink(id) : undefined
  for (const site of link ? sitesOf(link) : []) {
    if (!map.getSource(areaSource(site.area))) continue
    map.setFeatureState(
      { source: areaSource(site.area), id: site.id },
      { picked }
    )
  }
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
// A curve from the theme, such as the sheet's --ease-drawer over about its
// 450 ms, so the map and the sheet move as one.
const easings = new Map<string, (t: number) => number>()
const themeEasing = (token: string) => {
  const known = easings.get(token)
  if (known) return known
  const [a, b, c, d] =
    getComputedStyle(document.documentElement)
      .getPropertyValue(token)
      .match(/-?[\d.]+/g)
      ?.map(Number) ?? []
  if (d === undefined) return undefined
  const easing = cubicBezier(a, b, c, d)
  easings.set(token, easing)
  return easing
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
  imageryFailed: (refused: boolean) => void
}
let kept: Kept | undefined
const away = () => {}

// The site the camera aimed at, until the map is moved by hand, and the
// picked site the map shows and the one whose pin it has marked, which
// waits for the picked layer to have the site. Kept with the map.
const held: { current?: Site | Page } = {}
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
    // Beside the desktop's list card, 12 px in and as wide as it was left.
    fitBoundsOptions: {
      padding: desk
        ? {
            left:
              Math.min(
                listCard.inset + cardWidth.get(),
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
  picked: Site | Page | undefined,
  desk: boolean
) {
  // A new map's imagery hasn't come yet, whatever the last one's did.
  imageryLoad = { came: false, failed: 0 }
  const created = new MapLibre({
    container: element,
    style: styleNow(theme, picked),
    attributionControl: { compact: true },
    // Where it was left, or at a site in the address, or the coast.
    ...(camera ??
      (picked && {
        center: centreOf(picked) as LngLatLike,
        zoom: siteZoom,
      }) ??
      homeView(element, desk)),
    maxBounds: [
      [17.9, -34.75],
      [19.3, -33.3],
    ],
    minZoom: 8.5,
    maxZoom: maxZoom(),
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
  // The limit follows the middle of the map, changed only from the
  // satellite's own closest zoom out, so it never jumps under a finger.
  // Dragged off the aerial photos closer in, the map eases back once let go.
  created.on("move", () => {
    if (created.getZoom() > satelliteZoom) return
    const limit = maxZoom(created.getCenter())
    if (limit !== created.getMaxZoom()) created.setMaxZoom(limit)
  })
  created.on("moveend", () => {
    if (created.getZoom() <= satelliteZoom) return
    if (maxZoom(created.getCenter()) > satelliteZoom) return
    created.easeTo({
      zoom: satelliteZoom,
      duration: 300,
      easing: themeEasing("--ease-out"),
    })
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
  // The public site leaves it open until a drag, as OpenStreetMap asks a
  // public map to show its credit.
  if (!publicSite) {
    created.on("styledata", fold)
    created.on("sourcedata", fold)
  }
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
      layers: [...pinLayers, ...clusterLayers, ...pickedLayers],
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
  const pointable = [
    ...pinLayers,
    ...nameLayers,
    ...clusterLayers,
    ...pickedLayers,
  ]
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
  // without it they show shapes ashore. With no signal the basemap can't
  // load, and that failure is forgotten so it is read again next time.
  let settled = false
  const fail = () => {
    if (settled) return
    settled = true
    forgetFailure()
    kept?.report("failed")
  }
  created.on("error", (event) => {
    // A source's errors carry its id, and a single tile's the tile.
    const { sourceId, tile } = event as { sourceId?: string; tile?: unknown }
    if (sourceId === "osm" && !tile) fail()
    // A few of the imagery's tiles failing before any has come means none
    // will, and the map is only pins over the sea's colour without them.
    // Not when the signal has gone, which takes the map back on its own.
    if (
      sourceId === "imagery" &&
      tile &&
      !imageryLoad.came &&
      navigator.onLine
    ) {
      imageryLoad.failed += 1
      if (imageryLoad.failed !== 3) return
      const load = imageryLoad
      void keyRefused().then((refused) => {
        if (load !== imageryLoad) return
        load.refused = refused
        kept?.imageryFailed(refused)
        // Without the tile's address, which holds the key.
        const { status } = (event.error ?? {}) as { status?: number }
        void reportError(
          "error",
          new Error(
            `Satellite imagery didn't load (${refused ? "key refused" : (status ?? "no answer")})`
          )
        )
      })
    }
  })
  created.on("sourcedata", (event) => {
    if (event.sourceId === "imagery" && event.tile) imageryLoad.came = true
  })
  const drawn = () => {
    if (settled) return
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
  }
  created.once("idle", drawn)
  // Over the imagery the map shows once the extract's tiles are in, which
  // the words and zones need, as the imagery fades in on its own and a
  // slow Esri would otherwise keep the whole map hidden.
  const extractIn = (event: MapSourceDataEvent) => {
    if (settled) return void created.off("sourcedata", extractIn)
    if (!imageryOn || event.sourceId !== "osm") return
    if (!created.isSourceLoaded("osm")) return
    created.off("sourcedata", extractIn)
    drawn()
  }
  created.on("sourcedata", extractIn)
  return created
}

export default function Basemap({
  onState,
  site,
  onPick,
  filtered = sites,
  zones = true,
  imagery,
  onImageryFailed,
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
  // The satellite imagery's tiles, in place of the map's own land, and
  // what to do if they don't come.
  imagery?: string
  onImageryFailed?: (refused: boolean) => void
  hovered?: string
  // The controls, sheet and cards over the map.
  children?: ReactNode
}) {
  const picked = site ? mapLink(site) : undefined
  const map = useRef<MapLibre | null>(null)
  const theme = useMapTheme()
  // A map kept in another theme is made again rather than shown wrong.
  const [shown, setShown] = useState(
    () => !!kept?.drawn && kept.theme === theme
  )
  const desk = useDesk()
  const report = useEffectEvent((state: MapState) => onState?.(state))
  const pick = useEffectEvent((id: string | undefined) => onPick?.(id))
  const imageryFailed = useEffectEvent((refused: boolean) =>
    onImageryFailed?.(refused)
  )
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
      imageryOn = imagery
      kept = {
        map: create(element, theme, picked, desk),
        theme,
        drawn: false,
        pick: away,
        report: away,
        reveal: away,
        imageryFailed: away,
      }
    }
    const current = kept
    const element = current.map.getContainer()
    wrapper.append(element)
    current.pick = (id) => pick(id)
    current.report = (state) => report(state)
    current.reveal = () => setShown(true)
    current.imageryFailed = (refused) => imageryFailed(refused)
    map.current = current.map
    // The signal may have come or gone while away: the right look before
    // the frame paints, not one frame late.
    if (imagery !== imageryOn) {
      applyImagery(current.map, imagery, () => styleFor(theme))
    } else if (
      imagery &&
      !imageryLoad.came &&
      imageryLoad.refused !== undefined
    ) {
      // It failed while away, with no page to go back to the Map.
      current.imageryFailed(imageryLoad.refused)
    }
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
      current.imageryFailed = away
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
  const waiting = useRef<{ site: Site | Page; jump: boolean }>(undefined)
  const aim = useCallback(
    (link: Site | Page, jump: boolean) => {
      const current = map.current
      const { left, bottom } = cover.current
      held.current = link
      const move = {
        duration: jump ? 0 : 450,
        easing: themeEasing("--ease-drawer"),
      }
      // A page fits all its sites into what the sheet or card leaves, clear
      // of the phone's pill row, but no closer than a site's own look.
      if (isPage(link) && current) {
        const lons = link.sites.map(({ lon }) => lon)
        const lats = link.sites.map(({ lat }) => lat)
        const box = current.getContainer()
        const top = desk ? 40 : 88
        // Room past the outer pins for their names, which sit beside them
        // on either side, less where the map has little to spare.
        const across = Math.min(112, (box.clientWidth - left - 120) / 2)
        const down = Math.min(40, (box.clientHeight - bottom - top - 80) / 2)
        const camera = current.cameraForBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          {
            padding: {
              left: left + Math.max(8, across),
              right: Math.max(8, across),
              top,
              bottom: bottom + Math.max(8, down),
            },
            maxZoom: 16,
          }
        )
        if (camera) return current.easeTo({ ...camera, ...move })
      }
      current?.easeTo({
        center: centreOf(link),
        // A page, too big to fit, keeps the zoom it has.
        zoom: isPage(link)
          ? current.getZoom()
          : Math.max(current.getZoom(), siteZoom),
        offset: [left / 2, -bottom / 2],
        ...move,
      })
    },
    [desk]
  )
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
    const current = map.current
    if (!current || imagery === imageryOn) return
    applyImagery(current, imagery, () => styleFor(theme))
    // The theme is read when the imagery changes, not watched here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagery])
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
    const before = shownPick.current ? mapLink(shownPick.current) : undefined
    shownPick.current = picked?.id
    // A page's sites leave their areas' clusters while it's picked.
    if ((before && isPage(before)) || (picked && isPage(picked))) {
      applyShown(current)
    }
    // The old pin's mark goes and the new one's comes once the picked layer
    // has the site, so its name never shows twice or not at all.
    void current
      .getSource<GeoJSONSource>(pickedSource)
      ?.setData(pickedData(picked, shownSites))
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
