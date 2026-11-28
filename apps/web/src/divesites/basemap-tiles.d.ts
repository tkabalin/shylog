// Written by the public site's build from the extract (scripts/divesites.ts).
declare module "virtual:basemap-tiles" {
  const tiles: {
    // The address of each tile, with {z}, {x} and {y} in it.
    path: string
    bounds: [number, number, number, number]
    minzoom: number
    maxzoom: number
  }
  export default tiles
}
