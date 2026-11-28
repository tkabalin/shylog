// @vitest-environment node
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec"
import { describe, expect, it, vi } from "vitest"

import { pageById, siteById, sites } from "./sites"
import { areaData, mapStyle, oklch, pickedData, placesZoom } from "./style"

const tiles = { url: "pmtiles:///assets/basemap-test.pmtiles" }

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

  it("is valid with a whole page picked", () => {
    const picked = pageById.get("page:castor-rock")
    expect(validateStyleMin(mapStyle("light", tiles, { picked }))).toEqual([])
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

  describe("over satellite imagery", () => {
    const imagery = "https://imagery.example/tile/{z}/{y}/{x}?token=k"
    const ids = (style: ReturnType<typeof mapStyle>) =>
      style.layers.map((layer) => layer.id)

    it.each(["light", "dark"] as const)("is a valid %s style", (theme) => {
      expect(validateStyleMin(mapStyle(theme, tiles, { imagery }))).toEqual([])
    })

    it("draws the imagery under everything but the sea", () => {
      const style = mapStyle("light", tiles, { imagery })
      expect(ids(style).slice(0, 2)).toEqual(["sea", "imagery"])
      expect(style.sources.imagery).toMatchObject({ tiles: [imagery] })
    })

    // A level closer on a sharp screen, or a phone shows each pixel 2 to 4
    // times over, where a desktop's screen shows it about once.
    it.each([
      [1, 256],
      [1.5, 256],
      [2, 128],
      [3, 128],
    ])("asks for tiles to suit a %sx screen", (ratio, tileSize) => {
      vi.stubGlobal("devicePixelRatio", ratio)
      const style = mapStyle("light", tiles, { imagery })
      vi.unstubAllGlobals()
      expect(style.sources.imagery).toMatchObject({ tileSize })
    })

    // The shading closes across the land, which no longer hides it.
    it("leaves out the map's own land and the zones' shading", () => {
      const layers = ids(mapStyle("light", tiles, { imagery }))
      const onMap = ids(mapStyle("light", tiles))
      for (const id of ["earth", "ocean", "road-major", "zone-no-dive"]) {
        expect(onMap).toContain(id)
        expect(layers).not.toContain(id)
      }
      expect(layers).toEqual(
        expect.arrayContaining(["mpa-edge", "zone-labels", "places"])
      )
      expect(ids(mapStyle("light", tiles))).not.toContain("imagery")
    })

    it("hides the zones' edges and words with the switch", () => {
      const style = mapStyle("light", tiles, { imagery, showZones: false })
      const edge = style.layers.find((layer) => layer.id === "mpa-edge")
      expect(edge?.layout).toMatchObject({ visibility: "none" })
    })

    it("draws the same pins in either theme", () => {
      const pins = (theme: "light" | "dark") =>
        mapStyle(theme, tiles, { imagery }).layers.find(
          (layer) => layer.id === "picked"
        )
      expect(pins("light")).toBeDefined()
      expect(pins("light")).toEqual(pins("dark"))
    })
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

describe("pickedData", () => {
  it("has a site's pin, or every pin a picked page shares, flagged", () => {
    const one = pickedData(siteById.get("a-frame"))
    expect(one.features.map((f) => f.properties)).toEqual([
      { id: "a-frame", name: "A-Frame", type: "reef" },
    ])
    const page = pageById.get("page:castle-rocks")!
    const all = pickedData(page)
    expect(all.features.map((f) => f.properties.id)).toEqual(
      page.sites.map(({ id }) => id)
    )
    expect(all.features.every((f) => "page" in f.properties)).toBe(true)
    expect(pickedData().features).toEqual([])
  })

  it("shows only the sites of a picked page the filters leave", () => {
    const page = pageById.get("page:castle-rocks")!
    const [kept] = page.sites
    expect(
      pickedData(page, [kept!]).features.map((f) => f.properties.id)
    ).toEqual([kept!.id])
  })
})

describe("areaData", () => {
  it("leaves a picked page's sites to its own layer, out of the clusters", () => {
    const page = pageById.get("page:castle-rocks")!
    const ids = (picked?: Parameters<typeof areaData>[2]) =>
      areaData("false-bay", sites, picked).features.map((f) => f.properties.id)
    for (const { id } of page.sites) {
      expect(ids()).toContain(id)
      expect(ids(page)).not.toContain(id)
      // A single site picked stays in its area, under its picked pin.
      expect(ids(siteById.get(id))).toContain(id)
    }
  })
})
