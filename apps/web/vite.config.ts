import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  // The router plugin must come before the React plugin.
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
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
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The first install takes the open page, so it works offline
        // without a reload; an update still waits, as nothing else is open.
        clientsClaim: true,
        // Client-side routes get the precached page, which the server wrote
        // with the instance's title when the worker fetched it.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/manifest\.webmanifest$/],
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
  // The Hono server, which listens on 127.0.0.1 only. It writes the
  // manifest too, with the instance's name, so Vite mustn't answer it with
  // the app's HTML.
  server: {
    // The browser tests take the network away, and Vite's client reloads
    // the page once its socket is back, so their servers run without one.
    ws: process.env.E2E_NO_HMR ? false : undefined,
    proxy: Object.fromEntries(
      ["/api", "/manifest.webmanifest"].map((path) => [
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
