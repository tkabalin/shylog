// Takes the open map back to where it opens, for a tap on the Explore tab
// while it shows. Set by the map, and here outside its chunk so the tab bar
// can call it without loading MapLibre.
export const exploreHome: { current?: () => void } = {}

// The same tap's other half, set by Explore: its screens and a picked site,
// a level deeper, close as their Back would, and its filters stay.
export const exploreRoot: { current?: () => void } = {}
