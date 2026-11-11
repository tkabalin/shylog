import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createRouter, RouterProvider } from "@tanstack/react-router"

import "./index.css"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import {
  isChunkFailure,
  reportError,
  startErrorReports,
} from "@/data/client-log"
import { loadDiveComputer } from "@/data/dive-computer"
import { loadLog, startSync } from "@/data/log"
import { protectOnFirstLaunch } from "@/data/storage"
import { startWorker } from "@/pwa"
import { routeTree } from "./routeTree.gen.ts"

// Content scrolls in <main>, not the window, so reset that on navigation.
// Going back restores it, so the Log returns to the card that was opened.
const router = createRouter({
  routeTree,
  scrollRestoration: true,
  // A card's route chunk starts loading on touchstart, before the tap ends.
  defaultPreload: "intent",
  scrollToTopSelectors: ["#main"],
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// The mirror is read before the first render, so a cold launch shows the
// log at once and the restored scroll position has its content to land on.
// A browser that refuses IndexedDB (a private window) still opens the app.
startErrorReports()
await loadLog()
startSync()
void loadDiveComputer()
// Asks the browser to keep the drafts and the log's copy (see storage.ts).
void protectOnFirstLaunch()
startWorker()

createRoot(document.getElementById("root")!, {
  // A screen that failed to render or whose code didn't load, caught by the
  // router's boundary or a card's own; uncaught ones reach window's error.
  onCaughtError: (error, info) => {
    console.error(error, info.componentStack)
    void reportError(isChunkFailure(error) ? "chunk" : "error", error)
  },
}).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>
)
