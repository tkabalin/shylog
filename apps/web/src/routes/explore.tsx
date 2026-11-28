import { createFileRoute, redirect } from "@tanstack/react-router"

import { exploreOn } from "@/map/enabled"
import { ExplorePage, exploreSearch } from "@/map/explore-page"
import { preloadMap } from "@/map/lazy"

export const Route = createFileRoute("/explore")({
  validateSearch: exploreSearch,
  // An old link or bookmark on an instance with Explore off opens the Log.
  beforeLoad: () => {
    if (!exploreOn) throw redirect({ to: "/", replace: true })
  },
  // From the tap on the tab, as the router preloads routes on intent.
  loader: () => void preloadMap().catch(() => {}),
  component: ExplorePage,
})
