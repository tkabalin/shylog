import { preloadable } from "@/lib/preloadable"

// MapLibre is a megabyte and a half with its worker, so it is parsed only
// when Explore opens, as its own chunk.
export const { Component: LazyExplore, preload: preloadMap } = preloadable(() =>
  import("./explore-map").then((module) => module.default)
)
