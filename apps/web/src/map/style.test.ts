// @vitest-environment node
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec"
import { describe, expect, it } from "vitest"

import { basemapStyle, oklch, placesZoom } from "./style"

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

describe("basemapStyle", () => {
  it.each(["light", "dark"] as const)("is a valid %s style", (theme) => {
    expect(validateStyleMin(basemapStyle(theme, tiles))).toEqual([])
  })

  it("keeps the coastal names and adds OpenStreetMap's from one zoom", () => {
    const layers = basemapStyle("light", tiles).layers
    const coast = layers.find((layer) => layer.id === "coast-labels")
    const places = layers.find((layer) => layer.id === "places")
    expect(coast?.maxzoom).toBeUndefined()
    expect(places?.minzoom).toBe(placesZoom)
    // Never a town twice: OpenStreetMap's leave out the coastal names.
    expect(
      JSON.stringify(places && "filter" in places && places.filter)
    ).toContain("Simon's Town")
  })


  it("labels places in English where OpenStreetMap has it", () => {
    for (const id of ["places", "sea-labels"]) {
      const layer = basemapStyle("light", tiles).layers.find(
        (each) => each.id === id
      )
      expect(layer?.layout).toMatchObject({
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
      })
    }
  })
})
