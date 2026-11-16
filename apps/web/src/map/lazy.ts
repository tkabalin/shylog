import { preloadable } from "@/lib/preloadable"

// MapLibre is a megabyte and a half with its worker, so it is parsed only
// when Explore opens, as its own chunk.
export const { Component: LazyMap, preload: preloadMap } = preloadable(() =>
  import("./basemap").then((module) => module.default)
)
