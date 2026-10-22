import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createRouter, RouterProvider } from "@tanstack/react-router"

import "./index.css"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { loadLog, startSync } from "@/data/log"
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
await loadLog()
startSync()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>
)
