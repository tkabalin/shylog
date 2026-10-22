import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  // The router plugin must come before the React plugin.
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
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
