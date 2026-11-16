import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { IconMapOff, IconRefresh } from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { LazyMap, preloadMap } from "@/map/lazy"
import { sea } from "@/map/sea"

type ExploreSearch = { site?: string }

export const Route = createFileRoute("/explore")({
  // The picked site, so a reload or a link opens it.
  validateSearch: (search: Record<string, unknown>): ExploreSearch => ({
    site: typeof search.site === "string" ? search.site : undefined,
  }),
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
  const { site } = Route.useSearch()
  const navigate = Route.useNavigate()
  // In place, as a picker is: Back leaves Explore rather than stepping
  // through every site looked at.
  const pick = useCallback(
    (id: string | undefined) =>
      void navigate({ search: { site: id }, replace: true }),
    [navigate]
  )
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
    <div className="flex h-full flex-col pt-[max(0.75rem,env(safe-area-inset-top))] desk:pt-0">
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
          <LazyMap key={attempt} onState={setState} site={site} onPick={pick} />
        </div>
      )}
    </div>
  )
}
