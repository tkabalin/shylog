// The values a page tag takes, kept free of imports so the refresh script,
// which can't load the map's ?raw data, checks the tags file against them.

export type Compass = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw"
export type Season = "summer" | "autumn" | "winter" | "spring"
export type Need = "navigation" | "dsmb" | "fitness" | "buoyancy"
export type GoodFor = "night" | "snorkelling" | "training" | "swim-throughs"

export const compass: Compass[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"]
export const seasons: Season[] = ["summer", "autumn", "winter", "spring"]
export const needs: Need[] = ["navigation", "dsmb", "fitness", "buoyancy"]
export const goodFors: GoodFor[] = [
  "night",
  "snorkelling",
  "training",
  "swim-throughs",
]
