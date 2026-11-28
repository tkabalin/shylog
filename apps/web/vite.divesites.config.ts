import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import { arcgisKey } from "./scripts/arcgis-key.ts"
import { basemapTiles, buildStamp, hostFiles } from "./scripts/divesites.ts"

// Cape Town Dive Sites, the public dive site map: the app's Explore alone,
// built from divesites.html into dist-divesites for Cloudflare.

const src = resolve(import.meta.dirname, "src")

// The app's modules the public site replaces with its own: the map's host
// and tiles, and the error reports, which have no server to go to.
const swaps = new Map([
  [`${src}/map/host.ts`, `${src}/divesites/host.ts`],
  [`${src}/map/tiles.ts`, `${src}/divesites/tiles.ts`],
  [`${src}/data/client-log.ts`, `${src}/divesites/client-log.ts`],
])

// What must never reach a visitor: the log, its sync and the server's API,
// and the extract, whose tiles the site serves as files instead.
const appOnly = [
  /\/src\/data\//,
  /\/src\/api\//,
  /\/src\/map\/(extract|keep-images)\.ts$/,
  /\.pmtiles(\?|$)/,
  /\/node_modules\/(dexie|pmtiles)\//,
]

const publicOnly: Plugin = {
  name: "public-only",
  enforce: "pre",
  async resolveId(source, importer, options) {
    if (!importer || source.startsWith("\0")) return
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    })
    if (!resolved) return
    const path = resolved.id.split("?")[0]
    const swap = swaps.get(path)
    if (swap) return swap
    if (appOnly.some((pattern) => pattern.test(path)))
      this.error(
        `${source} (from ${importer}) is the app's, not the public site's`
      )
    return resolved
  },
}

// The page is divesites.html in the source and index.html on the site.
const page: Plugin = {
  name: "divesites-page",
  // After Vite's own HTML step, which emits the page.
  enforce: "post",
  configureServer(server) {
    server.middlewares.use((request, _, next) => {
      if (request.url === "/" || request.url?.startsWith("/?"))
        request.url = `/divesites.html${request.url.slice(1)}`
      next()
    })
  },
  generateBundle(_, bundle) {
    const html = bundle["divesites.html"]
    if (html?.type !== "asset") return
    delete bundle["divesites.html"]
    this.emitFile({
      type: "asset",
      fileName: "index.html",
      source: html.source,
    })
  },
}

export default defineConfig({
  plugins: [
    publicOnly,
    react(),
    tailwindcss(),
    arcgisKey(),
    basemapTiles(resolve(src, "map/basemap.pmtiles")),
    hostFiles(),
    buildStamp(resolve(import.meta.dirname, "wrangler.jsonc")),
    page,
  ],
  cacheDir: process.env.VITE_CACHE_DIR ?? "node_modules/.vite-divesites",
  // No page for a path that isn't a file, as on Cloudflare (wrangler.jsonc),
  // so a missing tile is a 404 in a preview too.
  appType: "mpa",
  // The only local address the public site's Esri key accepts besides its
  // own, so the satellite shows in a local preview too.
  preview: { port: 5173, strictPort: true },
  build: {
    outDir: "dist-divesites",
    rolldownOptions: { input: resolve(import.meta.dirname, "divesites.html") },
    // A little above the map's chunk, about 2 MB: the app's 1.47 MB plus
    // the UI and dive sites its own first chunk holds, which nothing here
    // loads before the map. Kept close, so growth warns, as in the app.
    chunkSizeWarningLimit: 2050,
    // Every site image a file of its own, as in the app.
    assetsInlineLimit: (file) =>
      file.includes("/src/map/images/") ? false : undefined,
  },
  resolve: {
    alias: {
      "@": src,
    },
  },
})
