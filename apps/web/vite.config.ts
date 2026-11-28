import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

import { arcgisKey } from "./scripts/arcgis-key.ts"

// https://vite.dev/config/
export default defineConfig({
  // The router plugin must come before the React plugin.
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // The server writes the key into a built page.
    arcgisKey("serve"),
    // Precaches the shell and every lazy chunk, so the app opens with no
    // signal and a cold launch downloads nothing. The server writes the
    // manifest, with the instance's name, so the plugin makes none.
    VitePWA({
      // No skipWaiting: a new version takes over once every window has
      // closed, never under an open form, until the reload offer exists.
      registerType: "prompt",
      injectRegister: false,
      manifest: false,
      workbox: {
        // The dive sites' page text is the JSON, and webp the dive computers'
        // pictures. The sites' own images are far too big, so they're left
        // to the runtime cache below.
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2,json}"],
        globIgnores: ["**/assets/site-*.webp"],
        // The first install takes the open page, so it works offline
        // without a reload; an update still waits, as nothing else is open.
        clientsClaim: true,
        // Client-side routes get the precached page, which the server wrote
        // with the instance's title when the worker fetched it.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/manifest\.webmanifest$/],
        // The map's extract, too big to precache: kept whole once the app
        // downloads it (src/map/extract.ts, which names the cache too), and
        // every range the map asks for is cut from that copy. Ranges from
        // the network aren't kept, and a new extract replaces the old.
        runtimeCaching: [
          {
            urlPattern: /\/assets\/basemap-[\w-]+\.pmtiles$/,
            handler: "CacheFirst",
            options: {
              cacheName: "map-extract",
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 1 },
            },
          },
          // The dive sites' maps and images, about 48 MB, kept once the
          // app downloads them (src/map/keep-images.ts, which also drops
          // the ones a new version no longer has).
          {
            urlPattern: /\/assets\/site-[\w-]+\.webp$/,
            handler: "CacheFirst",
            options: {
              cacheName: "map-images",
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  // Routes are code-split, so Vite would otherwise find their dependencies
  // on first visit and reload the page.
  optimizeDeps: {
    entries: ["index.html", "src/routes/**/*.tsx"],
  },
  // The browser tests give each of their dev servers a cache of its own.
  cacheDir: process.env.VITE_CACHE_DIR,
  // A little above the map's chunk, about 1.47 MB with MapLibre, the dive
  // sites and the Markdown renderer, so a change that grows it warns and
  // raises this on purpose. A precached file over 2 MiB fails the build.
  build: {
    chunkSizeWarningLimit: 1550,
    // Every site image a file of its own, however small, as the service
    // worker keeps them by their addresses.
    assetsInlineLimit: (file) =>
      file.includes("/src/map/images/") ? false : undefined,
  },
  // The Hono server, which listens on 127.0.0.1 only. It writes the
  // manifest too, with the instance's name, so Vite mustn't answer it with
  // the app's HTML, and serves /mcp, which Claude Desktop on Windows reaches
  // in development through Vite's --host.
  server: {
    // The browser tests take the network away, and Vite's client reloads
    // the page once its socket is back, so their servers run without one.
    ws: process.env.E2E_NO_HMR ? false : undefined,
    proxy: Object.fromEntries(
      ["/api", "/manifest.webmanifest", "/mcp"].map((path) => [
        path,
        process.env.SHYLOG_API_ORIGIN ?? "http://127.0.0.1:3000",
      ])
    ),
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
