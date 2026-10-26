import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { IconX } from "@tabler/icons-react"
import {
  createFileRoute,
  Link,
  Navigate,
  useRouter,
} from "@tanstack/react-router"

import { useAfter, useChartLoads } from "@/chart/load"
import { useSize } from "@/chart/size"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { Dive } from "@/data/db"
import { useLog, type LogView } from "@/data/log"
import { profileKey } from "@/data/samples"
import { diveFigures } from "@/dive/figures"
import { longDate } from "@/format/dates"

declare module "@tanstack/react-router" {
  interface HistoryState {
    // Set by the Profile card's expand button, so closing goes back to it.
    fromDive?: true
  }
}

// A dive's profile full screen, pushed from its Profile card (see Profile
// chart and Navigation history in the spec). The dive's own loader starts
// the samples and the chart, and tries them afresh after a failure.
export const Route = createFileRoute("/dive/$diveId/profile")({
  component: FullProfilePage,
})

// Browsers on a phone can't make a page full screen or turn the screen, so
// a phone held upright (not a tablet, where it fits) gets the view drawn a
// quarter turn round: turned, it shows in landscape, even when locked.
const portrait =
  "(orientation: portrait) and (pointer: coarse) and (max-width: 600px)"
const subscribe = (change: () => void) => {
  const query = matchMedia(portrait)
  query.addEventListener("change", change)
  return () => query.removeEventListener("change", change)
}
const useTurned = () =>
  useSyncExternalStore(subscribe, () => matchMedia(portrait).matches)

function FullProfilePage() {
  const { diveId } = Route.useParams()
  const { log } = useLog()
  // Only under a dive the detail found (see routes/dive/$diveId.tsx).
  const dive = log?.dive.get(diveId)
  if (!log || !dive) return null
  // A dive logged by hand has no profile: the dive takes this screen's place.
  if (!dive.sparkline) {
    return <Navigate to="/dive/$diveId" params={{ diveId }} replace />
  }
  // Remounted when a sync changes the profile, as the card's chart is.
  return <FullScreen key={profileKey(dive)} dive={dive} log={log} />
}

function FullScreen({ dive, log }: { dive: Dive; log: LogView }) {
  const router = useRouter()
  const frame = useRef<HTMLDivElement>(null)
  const size = useSize(frame)
  const turned = useTurned()
  const { profile, chart, retry } = useChartLoads(dive)
  const late = useAfter(150)
  const { mod } = diveFigures(dive, log)
  const site = log.sites.get(dive.siteId)

  // Back to the dive when it opened this, as a pushed screen pops;
  // otherwise the dive takes this screen's place.
  const close = (event: MouseEvent) => {
    if (router.state.location.state.fromDive && router.history.canGoBack()) {
      event.preventDefault()
      router.history.back()
    }
  }
  const bar = (
    <div className="flex min-w-0 flex-1 items-center gap-1 self-center">
      <Link
        to="/dive/$diveId"
        params={{ diveId: dive.id }}
        replace
        onClick={close}
        aria-label="Close"
        className="-ml-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary transition-opacity duration-150 active:opacity-50"
      >
        <IconX aria-hidden className="size-5.5 stroke-[2.25]" />
      </Link>
      <h1 className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[15px] font-semibold">{site?.name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {longDate(dive.startTime)}
          <span className="sr-only">, profile</span>
        </span>
      </h1>
    </div>
  )

  // Blank for 150 ms, as the card is, then the chart's space sketched.
  let state: ReactNode = late && <Skeleton className="flex-1" />
  if (profile.status === "rejected" || chart.status === "rejected") {
    state = (
      <div
        role="status"
        className="flex flex-1 flex-col items-center justify-center gap-3"
      >
        <p className="text-sm text-muted-foreground">
          The profile couldn&apos;t be loaded.
        </p>
        {/* 44 px in landscape too, past md:'s width. */}
        <Button variant="outline" className="h-11" onClick={retry}>
          Try again
        </Button>
      </div>
    )
  }
  let body = (
    <div className="flex h-full flex-col gap-3">
      <div className="flex h-11 items-end">{bar}</div>
      {state}
    </div>
  )
  if (profile.status === "fulfilled" && chart.status === "fulfilled") {
    const { FullProfile } = chart.value
    body = (
      <FullProfile
        dive={dive}
        mod={mod}
        profile={profile.value}
        turned={turned}
        bar={bar}
      />
    )
  }

  // Over the whole app, which it takes out of reach (and out of the
  // accessibility tree) while it's open.
  useEffect(() => {
    const app = document.getElementById("root")!
    app.inert = true
    return () => {
      app.inert = false
    }
  }, [])

  return createPortal(
    <div
      data-slot="full-profile"
      className="fixed inset-0 z-50 bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <div ref={frame} className="relative h-full w-full overflow-hidden">
        <div
          className="absolute top-0 left-0 px-4 pt-1 pb-3"
          style={
            turned
              ? {
                  width: size.height,
                  height: size.width,
                  transform: `translateX(${size.width}px) rotate(90deg)`,
                  transformOrigin: "0 0",
                }
              : { width: size.width, height: size.height }
          }
        >
          {size.width > 0 && body}
        </div>
      </div>
    </div>,
    document.body
  )
}
