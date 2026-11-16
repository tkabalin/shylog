// @vitest-environment node
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec"
import { describe, expect, it } from "vitest"

import { mapStyle, oklch, placesZoom } from "./style"

const tiles = "pmtiles:///assets/basemap-test.pmtiles"

describe("oklch", () => {
  it("converts the app's colours to sRGB", () => {
    expect(oklch(1, 0, 0)).toBe("rgb(255,255,255)")
    expect(oklch(0, 0, 0)).toBe("rgb(0,0,0)")
    // Tailwind's cyan-400 (#00d3f2), the dark theme's accent.
    expect(oklch(0.789, 0.154, 211.53)).toBe("rgb(0,211,242)")
    // Tailwind's orange-700 (#ca3500), faded.
    expect(oklch(0.553, 0.195, 38.402, 0.08)).toBe("rgba(202,53,0,0.08)")
  })
})

describe("mapStyle", () => {
  it.each(["light", "dark"] as const)("is a valid %s style", (theme) => {
    expect(validateStyleMin(mapStyle(theme, tiles))).toEqual([])
  })

  it("keeps the coastal names and adds OpenStreetMap's from one zoom", () => {
    const layers = mapStyle("light", tiles).layers
    const coast = layers.find((layer) => layer.id === "coast-labels")
    const places = layers.find((layer) => layer.id === "places")
    expect(coast?.maxzoom).toBeUndefined()
    expect(places?.minzoom).toBe(placesZoom)
    // Never a town twice: OpenStreetMap's leave out the coastal names.
    expect(
      JSON.stringify(places && "filter" in places && places.filter)
    ).toContain("Simon's Town")
  })

  // The land then ends every zone line at the coast as the map draws it.
  it("draws every zone's edge and fill under the land", () => {
    const layers = mapStyle("light", tiles).layers
    const earth = layers.findIndex((layer) => layer.id === "earth")
    for (const [index, layer] of layers.entries()) {
      if ("source" in layer && ["edges", "fills"].includes(layer.source)) {
        if (layer.type !== "symbol") expect(index, layer.id).toBeLessThan(earth)
      }
    }
  })

  it("labels places in English where OpenStreetMap has it", () => {
    for (const id of ["places", "sea-labels"]) {
      const layer = mapStyle("light", tiles).layers.find(
        (each) => each.id === id
      )
      expect(layer?.layout).toMatchObject({
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
      })
    }
  })
})
