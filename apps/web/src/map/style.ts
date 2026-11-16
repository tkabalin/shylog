import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  StyleSpecification,
} from "maplibre-gl"

import { sea } from "./sea"
import zones from "./zones.json"

export type MapTheme = "light" | "dark"

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
  },
} satisfies Record<MapTheme, Record<string, string>>

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

// A quiet basemap from Protomaps' OpenStreetMap layers, kept to the few
// that help find a dive site, with the marine protected areas over it.
export function mapStyle(theme: MapTheme, tiles: string): StyleSpecification {
  const p = palette[theme]
  return {
    version: 8,
    // A theme change swaps the colours at once, as the rest of the app does.
    transition: { duration: 0, delay: 0 },
    sources: {
      osm: { type: "vector", url: tiles, attribution },
      // The land again from the extract's zoom 9 tiles, a few of which
      // cover the whole coast, so they are in hand wherever the map moves
      // and stand in for the land while a closer tile is still loading.
      overview: { type: "vector", url: tiles, maxzoom: 9, attribution },
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
            "no-dive",
            p.noDive,
            "mpa",
            p.seaText,
            p.zoneText,
          ],
          "text-halo-color": p.sea,
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
        paint: { "text-color": p.seaText },
      },
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
          "text-anchor": ["get", "anchor"],
          "text-offset": [
            "case",
            ["==", ["get", "anchor"], "right"],
            ["literal", [-0.3, 0]],
            ["literal", [0.3, 0]],
          ],
        },
        paint: {
          "text-color": p.placeText,
          "text-halo-color": p.land,
          "text-halo-width": 1.2,
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
          "text-halo-color": p.land,
          "text-halo-width": 1.2,
        },
      },
    ],
  }
}
