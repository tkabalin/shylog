import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { IconMapOff, IconRefresh } from "@tabler/icons-react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { searchText as text } from "@/log/filters"
import { exploreOn } from "@/map/enabled"
import { LazyExplore, preloadMap } from "@/map/lazy"
import { mpas, type ExploreSearch } from "@/map/search"
import { sea } from "@/map/sea"

export const Route = createFileRoute("/explore")({
  // The picked site, the filters and the phone's screen, so a reload or a
  // link opens them. The map's own code checks them against its data.
  validateSearch: (search: Record<string, unknown>): ExploreSearch => ({
    site: text(search.site),
    // An image only of a picked site.
    image:
      text(search.site) &&
      Number.isInteger(search.image) &&
      (search.image as number) >= 0
        ? (search.image as number)
        : undefined,
    types: text(search.types),
    depth: text(search.depth),
    access: text(search.access),
    wind: text(search.wind),
    swell: text(search.swell),
    season: text(search.season),
    skills: text(search.skills),
    good: text(search.good),
    view:
      search.view === "list" || search.view === "rules"
        ? search.view
        : undefined,
    mpa: mpas.find((mpa) => mpa === search.mpa),
  }),
  // An old link or bookmark on an instance with Explore off opens the Log.
  beforeLoad: () => {
    if (!exploreOn) throw redirect({ to: "/", replace: true })
  },
  // From the tap on the tab, as the router preloads routes on intent.
  loader: () => void preloadMap().catch(() => {}),
  component: ExplorePage,
})

const seaColour = {
  "--sea": `oklch(${sea.light.join(" ")})`,
  "--sea-dark": `oklch(${sea.dark.join(" ")})`,
} as CSSProperties

// The map fills the tab below the status bar's strip, with no header bar:
// its controls float over it. From desk: up it runs to the window's top.
function ExplorePage() {
  const [state, setState] = useState<"loading" | "drawn" | "failed">("loading")
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setState("loading")
    setAttempt((n) => n + 1)
  }, [])
  // The map's code, which the service worker keeps with the app; only a
  // first visit before it has can fail to load it.
  useEffect(() => {
    let live = true
    preloadMap().catch(() => live && setState("failed"))
    return () => {
      live = false
    }
  }, [attempt])
  // The phone keeps the extract once it has downloaded it, so this is a
  // device that never could; it tries again as soon as the signal is back.
  useEffect(() => {
    if (state !== "failed") return
    window.addEventListener("online", retry)
    return () => window.removeEventListener("online", retry)
  }, [state, retry])
  return (
    <div className="relative flex h-full flex-col pt-[max(0.75rem,env(safe-area-inset-top))] desk:pt-0">
      <h1 className="sr-only">Explore</h1>
      {state === "failed" ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="accent">
              <IconMapOff />
            </EmptyMedia>
            <EmptyTitle>The map isn't downloaded yet</EmptyTitle>
            <EmptyDescription>
              It downloads once this device can reach Shylog, and works with no
              signal from then on.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="link" size="lg" onClick={retry}>
              <IconRefresh data-icon="inline-start" />
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        // The map's sea, so the tab opens on water while MapLibre loads.
        <div
          style={seaColour}
          className="min-h-0 flex-1 bg-(--sea) dark:bg-(--sea-dark)"
        >
          <LazyExplore key={attempt} onState={setState} />
        </div>
      )}
    </div>
  )
}
