import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
  VectorSourceSpecification,
} from "maplibre-gl"

import { sea } from "./sea"
import { areas, isPage, sites, type Area, type Page, type Site } from "./sites"
import zones from "./zones.json"

export type MapTheme = "light" | "dark"

// Where the basemap's tiles come from: the app's extract through pmtiles,
// or the public site's tile files (map/tiles.ts, divesites/tiles.ts).
export type BasemapSource = Omit<VectorSourceSpecification, "type">

// MapLibre can't parse oklch, so the app's colours are converted here
// rather than copied as hex.
export function oklch(l: number, c: number, h: number, alpha?: number) {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((linear) => {
    const x = Math.min(1, Math.max(0, linear))
    const encoded = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
    return Math.round(255 * encoded)
  })
  return alpha === undefined
    ? `rgb(${rgb.join(",")})`
    : `rgba(${rgb.join(",")},${alpha})`
}

// The land is the page's off-white or card grey, the sea a cyan-tinted step
// darker, and place names the muted foreground, so the map reads as part of
// the app and leaves the accent to the sites.
const palette = {
  light: {
    sea: oklch(...sea.light),
    land: oklch(0.985, 0.002, 197),
    park: oklch(0.962, 0.012, 165),
    sand: oklch(0.965, 0.012, 85),
    roadMinor: oklch(0.925, 0.005, 214),
    roadMajor: oklch(0.88, 0.006, 214),
    roadHighway: oklch(0.83, 0.008, 214),
    placeText: oklch(0.56, 0.021, 213.5),
    seaText: oklch(0.58, 0.06, 225),
    mpaEdge: oklch(0.6, 0.05, 222, 0.6),
    noTakeEdge: oklch(0.42, 0.02, 222, 0.7),
    zoneText: oklch(0.42, 0.02, 222),
    // Orange is the app's warning colour: 700 on light, 400 on dark.
    noDive: oklch(0.553, 0.195, 38.402),
    business: oklch(0.553, 0.195, 38.402, 0.08),
    hatch: oklch(0.553, 0.195, 38.402, 0.26),
    // Pins in the foreground's slate, ringed in white so they stand off
    // the sea; the picked one in the accent.
    pin: oklch(0.42, 0.02, 222),
    pinRing: oklch(1, 0, 0),
    pinText: oklch(0.3, 0.012, 222),
    cluster: oklch(1, 0, 0),
    clusterRing: oklch(0.86, 0.008, 214),
    clusterText: oklch(0.148, 0.004, 228.8),
    picked: oklch(0.52, 0.105, 223.128),
    pickedRing: oklch(1, 0, 0),
  },
  dark: {
    sea: oklch(...sea.dark),
    land: oklch(0.255, 0.006, 224),
    park: oklch(0.255, 0.014, 170),
    sand: oklch(0.275, 0.007, 85),
    roadMinor: oklch(0.31, 0.007, 220),
    roadMajor: oklch(0.36, 0.008, 220),
    roadHighway: oklch(0.42, 0.01, 220),
    placeText: oklch(0.723, 0.014, 214.4),
    seaText: oklch(0.6, 0.05, 222),
    mpaEdge: oklch(0.6, 0.05, 222, 0.5),
    noTakeEdge: oklch(0.8, 0.02, 214, 0.6),
    zoneText: oklch(0.8, 0.012, 214),
    noDive: oklch(0.75, 0.183, 55.934),
    // A darker orange than the others, so the tinted sea stays darker
    // than the land and Robben Island still stands out of it.
    business: oklch(0.47, 0.157, 37.304, 0.12),
    hatch: oklch(0.75, 0.183, 55.934, 0.24),
    pin: oklch(0.88, 0.01, 214),
    pinRing: oklch(0.2, 0.022, 232),
    pinText: oklch(0.9, 0.006, 214),
    cluster: oklch(0.218, 0.008, 223.9),
    clusterRing: oklch(0.38, 0.01, 220),
    clusterText: oklch(0.987, 0.002, 197.1),
    picked: oklch(0.789, 0.154, 211.53),
    pickedRing: oklch(0.148, 0.004, 228.8),
  },
} satisfies Record<MapTheme, Record<string, string>>

// Over the imagery, words and edges go white on a dark halo, as the land
// and sea are no longer flat colours to set them off, and the pins and
// clusters take the dark theme's, which stand off a photo in either theme.
const halo = "rgba(0,0,0,0.6)"
const overImagery = {
  ...palette.dark,
  placeText: "rgba(255,255,255,0.92)",
  seaText: "rgba(255,255,255,0.8)",
  mpaEdge: "rgba(255,255,255,0.6)",
  noTakeEdge: "rgba(255,255,255,0.85)",
  zoneText: "rgba(255,255,255,0.95)",
  pinText: "rgb(255,255,255)",
  landHalo: halo,
  seaHalo: halo,
}

// The map's own land, water and roads, and the zones' shading, which close
// across the land and so can't be trimmed to the sea over a photo. The Cape
// Point bands are drawn only by their shading's outline, which runs inland
// to close, and words along it, so they go too.
const mapOnly = new Set([
  "overview",
  "ocean",
  "zone-business",
  "zone-no-dive",
  "zone-outline-no-dive",
  "shore-only-end",
  "band-labels",
  "shore-labels",
  "earth",
  "water",
  "park",
  "beach",
  "road-minor",
  "road-major",
  "road-highway",
])

// Esri asks for its name and the imagery's sources: the main ones here, as
// the whole list ran the credit under the desktop's card, and every one in
// Map options' Sources.
const imageryAttribution =
  'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>: Vantor, Airbus and others'

// The diagonal hatching over the no-diving zones, one image per theme,
// drawn at twice its size so it stays crisp.
export const hatchImage = (theme: MapTheme) => `hatch-${theme}`
export function drawHatch(theme: MapTheme) {
  const size = 24
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const context = canvas.getContext("2d")!
  context.strokeStyle = palette[theme].hatch
  context.lineWidth = 2.4
  // Three strokes, so the stripes run on across the tile's edges.
  for (const offset of [-size, 0, size]) {
    context.beginPath()
    context.moveTo(offset, size)
    context.lineTo(offset + size, 0)
    context.stroke()
  }
  return context.getImageData(0, 0, size, size)
}

// A site's pin, a dot for a reef or fresh water and a diamond for a wreck,
// ringed, drawn at twice its size; the picked one bigger, in the accent.
type Shape = "dot" | "diamond"
export const pinImage = (theme: MapTheme, shape: Shape, picked: boolean) =>
  `${shape}${picked ? "-picked" : ""}-${theme}`
export function drawPin(theme: MapTheme, shape: Shape, picked: boolean) {
  const p = palette[theme]
  const size = picked ? 44 : 26
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const context = canvas.getContext("2d")!
  context.translate(size / 2, size / 2)
  const reach = size / 2 - 3.2
  context.beginPath()
  if (shape === "diamond") {
    const d = reach * 1.12
    context.moveTo(0, -d)
    context.lineTo(d, 0)
    context.lineTo(0, d)
    context.lineTo(-d, 0)
    context.closePath()
  } else context.arc(0, 0, reach * 0.92, 0, Math.PI * 2)
  context.lineWidth = 3.2
  // A mitred diamond's points reach past the image and are cut flat.
  context.lineJoin = "round"
  context.strokeStyle = picked ? p.pickedRing : p.pinRing
  context.fillStyle = picked ? p.picked : p.pin
  context.fill()
  context.stroke()
  return context.getImageData(0, 0, size, size)
}
export const pinImages = (["dot", "diamond"] as const).flatMap((shape) =>
  [false, true].map((picked) => ({ shape, picked }))
)

// Each area's sites, which cluster among themselves, so a bubble never
// mixes the Atlantic with False Bay and the first view shows the spread.
const siteFeatures = (list: readonly Site[], page = false) => ({
  type: "FeatureCollection" as const,
  features: list.map(({ id, name, type, lon, lat }) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [lon, lat] },
    properties: page ? { id, name, type, page } : { id, name, type },
  })),
})
export const areaSource = (area: Area) => `sites-${area}`
export const pinLayers = Object.keys(areas).map((area) => `pins-${area}`)
export const nameLayers = Object.keys(areas).map((area) => `names-${area}`)
export const clusterLayers = Object.keys(areas).map(
  (area) => `clusters-${area}`
)
export const pickedSource = "picked"
// A picked page shows the sites it shares that the filters leave, flagged
// for a layer that lets their names give way to each other.
export const pickedData = (link?: Site | Page, shown?: readonly Site[]) =>
  !link
    ? siteFeatures([])
    : isPage(link)
      ? siteFeatures(
          shown
            ? link.sites.filter((site) => shown.includes(site))
            : link.sites,
          true
        )
      : siteFeatures([link])
export const pickedLayers = ["picked", "picked-page"]
// The pin of the list row under the mouse, ringed on the desktop.
export const hoveredSource = "hovered"
// Each area's sites that pass the filters, less a picked page's, which its
// own layer shows: fitted wider than the clusters' last zoom, they'd be
// counted in a bubble under their own pins.
export const areaData = (
  area: Area,
  shown: readonly Site[],
  picked?: Site | Page
) =>
  siteFeatures(
    shown.filter(
      (site) =>
        site.area === area &&
        !(picked && isPage(picked) && picked.sites.includes(site))
    )
  )
const zoneSources = ["fills", "edges"]
const unclustered: ExpressionSpecification = ["!", ["has", "point_count"]]
// A cluster's bubble grows with its count.
const clusterRadius: ExpressionSpecification = [
  "step",
  ["get", "point_count"],
  13,
  10,
  16,
  40,
  19,
]
// The picked site shows again in a layer of its own, bigger, with its name
// always there. Its name here is hidden by feature state, which needs no new
// layout, and its pin stays under the picked one, so a tap finds it at once.
const unlessPicked: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "picked"], false],
  0,
  1,
]

// Coastal names at every zoom, in priority order: OpenStreetMap's places
// zoomed out are mostly inland suburbs, which don't help a diver.
const coast: [name: string, lon: number, lat: number][] = [
  ["Simon's Town", 18.434, -34.192],
  ["Hout Bay", 18.356, -34.046],
  ["Cape Point", 18.497, -34.357],
  ["Gordon's Bay", 18.866, -34.159],
  ["Sea Point", 18.386, -33.915],
  ["Kalk Bay", 18.449, -34.128],
  ["Kommetjie", 18.329, -34.139],
  ["Pringle Bay", 18.829, -34.347],
  ["Strand", 18.826, -34.112],
  ["Llandudno", 18.342, -34.007],
  ["Muizenberg", 18.469, -34.106],
  ["Robben Island", 18.372, -33.806],
  ["Rooi-Els", 18.817, -34.298],
  ["Scarborough", 18.374, -34.199],
  ["Fish Hoek", 18.432, -34.137],
  ["Camps Bay", 18.382, -33.955],
  ["St James", 18.457, -34.119],
  ["Glencairn", 18.431, -34.16],
  ["Miller's Point", 18.477, -34.23],
  ["Smitswinkel Bay", 18.468, -34.263],
  ["Betty's Bay", 18.905, -34.362],
  ["Olifantsbos", 18.379, -34.273],
  ["Oudekraal", 18.35, -33.987],
  ["Cape Town", 18.423, -33.924],
]
// Names on the map's east side sit west of their point, out over the
// water, or the screen's edge cuts them off.
const eastShore = new Set([
  "Gordon's Bay",
  "Strand",
  "Pringle Bay",
  "Rooi-Els",
  "Betty's Bay",
])
// From this zoom OpenStreetMap's places join them, less those already named.
export const placesZoom = 11

// No glyphs URL, so MapLibre draws every label with the page's own fonts.
// It reads the weight from the first name, which no font has, so the text
// falls through to Geist at that weight.
const font = {
  regular: ["Geist Regular", "Geist Variable"],
  medium: ["Geist Medium", "Geist Variable"],
}

const englishName: ExpressionSpecification = [
  "coalesce",
  ["get", "name:en"],
  ["get", "name"],
]

type GeoJSONData = GeoJSONSourceSpecification["data"]

const kind = (value: string): ExpressionSpecification => [
  "==",
  ["get", "kind"],
  value,
]

// Small caps-like words along a zone's line, as on a chart.
const zoneLabel = {
  "symbol-placement": "line",
  "text-font": font.medium,
  "text-size": 10.5,
  "text-transform": "uppercase",
  "text-letter-spacing": 0.12,
  "symbol-spacing": 320,
  "text-keep-upright": true,
} as const

// In a new tab, so the installed app on a desktop isn't replaced.
const attribution =
  '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> © <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
const sitesAttribution =
  'Sites: <a href="https://en.wikivoyage.org/wiki/Diving_the_Cape_Peninsula_and_False_Bay/Dive_sites" target="_blank" rel="noopener">Wikivoyage</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC&nbsp;BY&#8209;SA</a>'

// A quiet basemap from Protomaps' OpenStreetMap layers, kept to the few
// that help find a dive site, with the marine protected areas over it.
export function mapStyle(
  theme: MapTheme,
  basemap: BasemapSource,
  {
    picked,
    shown = sites,
    showZones = true,
    hovered,
    imagery,
  }: {
    picked?: Site | Page
    shown?: readonly Site[]
    showZones?: boolean
    hovered?: Site
    // The satellite imagery's tile address, which replaces the map's own
    // land, water and roads.
    imagery?: string
  } = {}
): StyleSpecification {
  const p = imagery
    ? overImagery
    : {
        ...palette[theme],
        landHalo: palette[theme].land,
        seaHalo: palette[theme].sea,
      }
  const pins = imagery ? "dark" : theme
  const shape = (isPicked: boolean): ExpressionSpecification => [
    "case",
    ["==", ["get", "type"], "wreck"],
    pinImage(pins, "diamond", isPicked),
    pinImage(pins, "dot", isPicked),
  ]
  // Names in the land's colour as their halo, so a name over the shore has
  // no blue rim.
  const siteName = { "text-color": p.pinText, "text-halo-color": p.landHalo }
  const pickedLayout = (overlap: boolean) =>
    ({
      "icon-image": shape(true),
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": ["get", "name"],
      "text-font": font.medium,
      "text-size": 12.5,
      "text-allow-overlap": overlap,
      "text-variable-anchor": ["left", "right", "top", "bottom"],
      "text-radial-offset": 1.1,
      "text-justify": "auto",
      "text-max-width": 10,
    }) satisfies SymbolLayerSpecification["layout"]
  const style: StyleSpecification = {
    version: 8,
    // A theme change swaps the colours at once, as the rest of the app does.
    transition: { duration: 0, delay: 0 },
    sources: {
      osm: { type: "vector", ...basemap, attribution },
      // The land again from the extract's zoom 9 tiles, a few of which
      // cover the whole coast, so they are in hand wherever the map moves
      // and stand in for the land while a closer tile is still loading.
      overview: { type: "vector", ...basemap, maxzoom: 9, attribution },
      fills: { type: "geojson", data: zones.fills as GeoJSONData },
      edges: { type: "geojson", data: zones.edges as GeoJSONData },
      coast: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: coast.map(([name, lon, lat], rank) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: {
              name,
              rank,
              anchor: eastShore.has(name) ? "right" : "left",
            },
          })),
        },
      },
      ...Object.fromEntries(
        (Object.keys(areas) as Area[]).map((area) => [
          areaSource(area),
          {
            type: "geojson",
            data: areaData(area, shown, picked),
            cluster: true,
            clusterMaxZoom: 11,
            clusterRadius: 34,
            promoteId: "id",
            attribution: sitesAttribution,
          } satisfies GeoJSONSourceSpecification,
        ])
      ),
      [pickedSource]: { type: "geojson", data: pickedData(picked, shown) },
      [hoveredSource]: { type: "geojson", data: pickedData(hovered) },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": p.sea } },
      // Under the zones, so they show over it only until the closer tile
      // arrives, and its ocean then covers the overview's rough coast.
      {
        id: "overview",
        type: "fill",
        source: "overview",
        "source-layer": "earth",
        paint: { "fill-color": p.land },
      },
      {
        id: "ocean",
        type: "fill",
        source: "osm",
        "source-layer": "water",
        filter: kind("ocean"),
        paint: { "fill-color": p.sea },
      },
      // Shading follows the diving rules alone: a faint tint where you dive
      // only with a business, hatching where you can't dive at all. The
      // zones close across the land, which is drawn over them.
      {
        id: "zone-business",
        type: "fill",
        source: "fills",
        filter: ["has", "business"],
        paint: { "fill-color": p.business },
      },
      {
        id: "zone-no-dive",
        type: "fill",
        source: "fills",
        filter: kind("no-dive"),
        paint: { "fill-pattern": hatchImage(theme) },
      },
      // Off Cape Point the abalone bands are measured from the coast, so
      // their outlines are drawn here, where the land hides the parts ashore.
      {
        id: "zone-outline-no-dive",
        type: "line",
        source: "fills",
        filter: ["all", ["has", "outline"], kind("no-dive")],
        paint: {
          "line-color": p.noDive,
          "line-width": 1.3,
          "line-opacity": 0.75,
        },
      },
      // MPA edges are long pale dashes; a no-take or no-diving zone's edge
      // is solid, so the two read apart at a glance. Under the land too,
      // which ends each at the coast as the map draws it.
      {
        id: "mpa-edge",
        type: "line",
        source: "edges",
        filter: kind("mpa"),
        paint: {
          "line-color": p.mpaEdge,
          "line-width": 1.2,
          "line-dasharray": [3, 3],
        },
      },
      {
        id: "no-take-edge",
        type: "line",
        source: "edges",
        filter: kind("no-take"),
        paint: { "line-color": p.noTakeEdge, "line-width": 1.4 },
      },
      {
        id: "no-dive-edge",
        type: "line",
        source: "edges",
        filter: kind("no-dive"),
        paint: {
          "line-color": p.noDive,
          "line-width": 1.3,
          "line-opacity": 0.75,
        },
      },
      // Round Robben Island the abalone area bans snorkelling, not diving:
      // the same orange, in dashes, over the MPA's tint.
      {
        id: "no-snorkel-edge",
        type: "line",
        source: "edges",
        filter: kind("no-snorkel"),
        paint: {
          "line-color": p.noDive,
          "line-width": 1.3,
          "line-opacity": 0.75,
          "line-dasharray": [4, 3],
        },
      },
      // The inner Cape Point band's ends, dotted from the shore out to the
      // hatching, so the shore dives' area reads as closed.
      {
        id: "shore-only-end",
        type: "line",
        source: "edges",
        filter: kind("shore-only-end"),
        layout: { "line-cap": "round" },
        paint: {
          "line-color": p.noDive,
          "line-width": 1.6,
          "line-opacity": 0.75,
          "line-dasharray": [0, 2.5],
        },
      },
      // Off Cape Point the words follow lines that also run ashore, so they
      // sit under the land too: "No diving" along the outer band's edges,
      // "Shore dives only" half a mile out, in the gap the inner band leaves.
      {
        id: "band-labels",
        type: "symbol",
        source: "fills",
        minzoom: 9,
        filter: ["all", ["has", "outline"], kind("no-dive")],
        layout: {
          ...zoneLabel,
          "text-field": "No diving",
          "text-offset": [0, -0.8],
        },
        paint: {
          "text-color": p.noDive,
          "text-halo-color": p.seaHalo,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "shore-labels",
        type: "symbol",
        source: "edges",
        // The gap is too thin for words further out; closer, its line
        // curves, so they repeat often and may bend.
        minzoom: 11,
        filter: kind("shore-only"),
        layout: {
          ...zoneLabel,
          "text-field": ["get", "label"],
          "symbol-spacing": 120,
          "text-max-angle": 60,
        },
        paint: {
          "text-color": p.noDive,
          "text-halo-color": p.seaHalo,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "earth",
        type: "fill",
        source: "osm",
        "source-layer": "earth",
        paint: { "fill-color": p.land },
      },
      // Lakes and dams; the ocean has its own layer, under the zones.
      {
        id: "water",
        type: "fill",
        source: "osm",
        "source-layer": "water",
        filter: [
          "all",
          ["==", ["geometry-type"], "Polygon"],
          ["!=", ["get", "kind"], "ocean"],
        ],
        paint: { "fill-color": p.sea },
      },
      {
        id: "park",
        type: "fill",
        source: "osm",
        "source-layer": "landuse",
        filter: [
          "in",
          ["get", "kind"],
          [
            "literal",
            [
              "national_park",
              "park",
              "protected_area",
              "nature_reserve",
              "forest",
              "wood",
              "scrub",
              "grassland",
            ],
          ],
        ],
        paint: {
          "fill-color": p.park,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 10, 1],
        },
      },
      {
        id: "beach",
        type: "fill",
        source: "osm",
        "source-layer": "landuse",
        filter: ["in", ["get", "kind"], ["literal", ["beach", "sand"]]],
        paint: { "fill-color": p.sand },
      },
      {
        id: "road-minor",
        type: "line",
        source: "osm",
        "source-layer": "roads",
        minzoom: 11.5,
        filter: [
          "all",
          ["==", ["get", "kind"], "minor_road"],
          ["!=", ["get", "kind_detail"], "service"],
        ],
        paint: {
          "line-color": p.roadMinor,
          "line-width": [
            "interpolate",
            ["exponential", 1.6],
            ["zoom"],
            12,
            0.5,
            15,
            2.5,
          ],
        },
      },
      {
        id: "road-major",
        type: "line",
        source: "osm",
        "source-layer": "roads",
        filter: ["==", ["get", "kind"], "major_road"],
        paint: {
          "line-color": p.roadMajor,
          "line-width": [
            "interpolate",
            ["exponential", 1.6],
            ["zoom"],
            8,
            0.4,
            12,
            1.2,
            15,
            3.5,
          ],
        },
      },
      {
        id: "road-highway",
        type: "line",
        source: "osm",
        "source-layer": "roads",
        filter: ["==", ["get", "kind"], "highway"],
        paint: {
          "line-color": p.roadHighway,
          "line-width": [
            "interpolate",
            ["exponential", 1.6],
            ["zoom"],
            7,
            0.6,
            12,
            1.6,
            15,
            4.5,
          ],
        },
      },
      // Each zone says what it means along its edge, so the map reads with
      // no key: "No diving", "Boulders · no-take", "Table Mountain MPA".
      {
        id: "zone-labels",
        type: "symbol",
        source: "edges",
        minzoom: 9,
        filter: ["all", ["has", "label"], ["!", kind("shore-only")]],
        layout: {
          ...zoneLabel,
          "text-field": [
            "match",
            ["get", "kind"],
            "no-dive",
            "No diving",
            "no-snorkel",
            "No snorkelling",
            "no-take",
            ["concat", ["get", "label"], " · no-take"],
            ["concat", ["get", "label"], " MPA"],
          ],
          "text-offset": [0, -0.8],
        },
        paint: {
          "text-color": [
            "match",
            ["get", "kind"],
            ["no-dive", "no-snorkel"],
            p.noDive,
            "mpa",
            p.seaText,
            p.zoneText,
          ],
          "text-halo-color": p.seaHalo,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "sea-labels",
        type: "symbol",
        source: "osm",
        "source-layer": "water",
        filter: [
          "in",
          ["get", "kind"],
          ["literal", ["sea", "ocean", "bay", "strait"]],
        ],
        layout: {
          "text-field": englishName,
          "text-font": font.regular,
          "text-transform": "uppercase",
          "text-letter-spacing": 0.14,
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 12],
          "text-max-width": 8,
        },
        paint: {
          "text-color": p.seaText,
          ...(imagery && { "text-halo-color": halo, "text-halo-width": 1 }),
        },
      },
      {
        id: "places",
        type: "symbol",
        source: "osm",
        "source-layer": "places",
        minzoom: placesZoom,
        filter: [
          "all",
          ["==", ["get", "kind"], "locality"],
          ["!", ["in", englishName, ["literal", coast.map(([name]) => name)]]],
        ],
        layout: {
          "text-field": englishName,
          "text-font": font.medium,
          "text-max-width": 7,
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 13, 12.5],
          "symbol-sort-key": ["get", "min_zoom"],
          "text-padding": 6,
        },
        paint: {
          "text-color": p.placeText,
          "text-halo-color": p.landHalo,
          "text-halo-width": 1.2,
        },
      },
      // Names under the pins and the coast's names: MapLibre places the top
      // layer first, so every pin and Simon's Town is down before a site's
      // name looks for room. From zoom 12, where they fit.
      ...(Object.keys(areas) as Area[]).map(
        (area): StyleSpecification["layers"][number] => ({
          id: `names-${area}`,
          type: "symbol",
          source: areaSource(area),
          minzoom: 12,
          filter: unclustered,
          layout: {
            "text-field": ["get", "name"],
            "text-font": font.regular,
            "text-size": 11.5,
            "text-max-width": 9,
            "text-variable-anchor": ["left", "right", "top", "bottom"],
            "text-radial-offset": 0.75,
            "text-justify": "auto",
          },
          paint: {
            ...siteName,
            "text-halo-width": 1.2,
            "text-opacity": unlessPicked,
          },
        })
      ),
      ...(Object.keys(areas) as Area[]).map(
        (area): StyleSpecification["layers"][number] => ({
          id: `pins-${area}`,
          type: "symbol",
          source: areaSource(area),
          filter: unclustered,
          layout: {
            "icon-image": shape(false),
            "icon-allow-overlap": true,
          },
        })
      ),
      // The coast's towns over the pins, so none hides a town, but under the
      // clusters and their counts, which a town steps aside from.
      {
        id: "coast-labels",
        type: "symbol",
        source: "coast",
        layout: {
          "text-field": ["get", "name"],
          "text-font": font.medium,
          "text-size": 11,
          "symbol-sort-key": ["get", "rank"],
          "text-padding": 4,
          // Its own side first, else the other.
          "text-variable-anchor-offset": [
            "case",
            ["==", ["get", "anchor"], "right"],
            ["literal", ["right", [-0.3, 0], "left", [0.3, 0]]],
            ["literal", ["left", [0.3, 0], "right", [-0.3, 0]]],
          ],
        },
        paint: {
          "text-color": p.placeText,
          "text-halo-color": p.landHalo,
          "text-halo-width": 1.2,
        },
      },
      ...(Object.keys(areas) as Area[]).flatMap(
        (area): StyleSpecification["layers"] => [
          {
            id: `clusters-${area}`,
            type: "circle",
            source: areaSource(area),
            filter: ["has", "point_count"],
            paint: {
              "circle-color": p.cluster,
              "circle-stroke-color": p.clusterRing,
              "circle-stroke-width": 1,
              "circle-radius": clusterRadius,
            },
          },
          {
            id: `count-${area}`,
            type: "symbol",
            source: areaSource(area),
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": font.medium,
              "text-size": 12,
              "text-allow-overlap": true,
              // Its room as wide as the bubble, which takes no part in
              // placing labels, so a town's name clears it whole.
              "text-padding": 10,
            },
            paint: { "text-color": p.clusterText },
          },
        ]
      ),
      // The pin of the list row under the mouse, ringed and drawn over any
      // cluster it's in, so the row shows where the site is at any zoom.
      {
        id: "hovered",
        type: "circle",
        source: hoveredSource,
        // Round a cluster's bubble, 4 px out, leaving its count clear.
        paint: {
          "circle-radius": [
            "case",
            ["has", "point_count"],
            ["+", clusterRadius, 4],
            10,
          ],
          "circle-color": [
            "case",
            ["has", "point_count"],
            "rgba(0,0,0,0)",
            p.cluster,
          ],
          "circle-stroke-color": p.picked,
          "circle-stroke-width": 2,
        },
      },
      {
        id: "hovered-pin",
        type: "symbol",
        source: hoveredSource,
        filter: unclustered,
        layout: {
          "icon-image": shape(false),
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      },
      {
        id: "picked",
        type: "symbol",
        source: pickedSource,
        filter: ["!", ["has", "page"]],
        layout: pickedLayout(true),
        paint: { ...siteName, "text-halo-width": 1.6 },
      },
      // A page's sites, every pin there and each name where it fits, as
      // Whittle Rock's 33 would otherwise pile up.
      {
        id: "picked-page",
        type: "symbol",
        source: pickedSource,
        filter: ["has", "page"],
        // Its pins also keep the names off each other's dots.
        layout: {
          ...pickedLayout(false),
          "icon-ignore-placement": false,
          "text-optional": true,
        },
        paint: { ...siteName, "text-halo-width": 1.6 },
      },
    ],
  }
  if (imagery) {
    style.sources.imagery = {
      type: "raster",
      tiles: [imagery],
      // Esri's tiles are 256 px, but MapLibre picks the level for CSS
      // pixels, so a phone's 3x screen stretched each one up to 4 times
      // over. Called 128, they come a level closer, for 3 times the tiles.
      tileSize: globalThis.devicePixelRatio >= 2 ? 128 : 256,
      // The City of Cape Town's aerial photos go to 21, 8 cm a pixel; where
      // a level is missing (Rooi-Els stops at 18), the one above shows.
      maxzoom: 21,
      attribution: imageryAttribution,
    }
    style.layers = [
      style.layers[0],
      {
        id: "imagery",
        type: "raster",
        source: "imagery",
        // Each level snaps in sharp as it comes: MapLibre's 0.3 s fade
        // doubled the blur on every level a pinch went through.
        paint: { "raster-fade-duration": 0 },
      },
      ...style.layers.slice(1).filter((layer) => !mapOnly.has(layer.id)),
    ]
  }
  if (!showZones) {
    for (const layer of style.layers.filter(isZoneLayer)) {
      layer.layout = { ...layer.layout, visibility: "none" } as never
    }
  }
  return style
}

// The zones and their words, which the Map options switch hides.
export const isZoneLayer = (layer?: object) =>
  !!layer && "source" in layer && zoneSources.includes(layer.source as string)
