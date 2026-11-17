// The dive site map's sites.ts, which the MCP site tools import, reads its
// GeoJSON as text through Vite's ?raw; tsx and the build read it the same
// way (scripts/raw-imports.mjs, tsup.config.ts).
declare module "*/sites.geojson?raw" {
  const text: string
  export default text
}
