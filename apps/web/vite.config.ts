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
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
