import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"

import "@/index.css"
import "./divesites.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { startPress } from "@/lib/press"
import { ExplorePage, exploreSearch } from "@/map/explore-page"
import { preloadMap } from "@/map/lazy"

// Cape Town Dive Sites: the app's Explore tab on its own, with no log, no
// sync and no service worker; the browser keeps only display choices.

function Shell() {
  return (
    <>
      <main className="h-full pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <Outlet />
      </main>
      {/* Opaque over the status bar, as in the app, so iOS never draws
          its top edge blur; a desktop has none, so the map runs to the top. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-20 h-[max(0.75rem,env(safe-area-inset-top))] bg-background desk:hidden"
      />
      <Toaster />
    </>
  )
}

const shell = createRootRoute({ component: Shell })
const explore = createRoute({
  getParentRoute: () => shell,
  path: "/explore",
  validateSearch: exploreSearch,
  loader: () => void preloadMap().catch(() => {}),
  component: ExplorePage,
})

const router = createRouter({
  routeTree: shell.addChildren([explore]),
  // A site's text starts at its top, and going back restores it.
  scrollRestoration: true,
  scrollToTopSelectors: ["[data-scroll-top]"],
  // The site is Explore alone, at the address's root, while the map's own
  // links name /explore as they do in the app.
  rewrite: {
    input: ({ url }) => {
      if (url.pathname !== "/") return undefined
      url.pathname = "/explore"
      return url
    },
    output: ({ url }) => {
      if (url.pathname !== "/explore") return undefined
      url.pathname = "/"
      return url
    },
  },
})

// Rows tint on a held press, not on a touch that turns into a scroll.
startPress()

// A deploy replaces every file, so a page left open across one asks for
// chunks that are gone: load the new page, at most every 10 s, so a chunk
// that's really missing can't reload it forever.
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem("reloaded")) < 10_000) return
    sessionStorage.setItem("reloaded", String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  location.reload()
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>
)
