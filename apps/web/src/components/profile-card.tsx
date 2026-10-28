import { CatchBoundary, Link } from "@tanstack/react-router"
import { IconArrowsMaximize, IconDeviceWatch } from "@tabler/icons-react"
import { cn } from "cn"

import { useAfter, useChartLoads } from "@/chart/load"
import {
  alarmRowHeight,
  alarmsHeaderHeight,
  chartHeight,
  laneBottom,
  laneHeaderHeight,
  laneHeight,
  laneTop,
  plotHeight,
  plotLeft,
  plotTop,
  readoutHeight,
} from "@/chart/layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Dive } from "@/data/db"
import { profileKey } from "@/data/samples"

// The Profile card. A dive with samples gets the chart, which holds its
// final height while its code and samples load, so nothing below moves.
// `expand` is off on the dev page, whose made-up dives the log can't open.
export function ProfileCard({
  dive,
  mod,
  expand = true,
}: {
  dive: Dive
  mod: number | null
  expand?: boolean
}) {
  return (
    <section aria-labelledby="profile-h">
      <Card className="gap-3 px-4">
        {/* The computer sits in the top-right corner, the one the chart
            leaves free (its axis and alarms take the bottom), so the
            heading reads as just "Profile". */}
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="profile-h"
            className="shrink-0 text-[15px] font-semibold tracking-[-0.01em]"
          >
            Profile
          </h2>
          <div className="flex min-w-0 items-center gap-1">
            {/* A long model and firmware string is cut short, not wrapped,
                so the heading stays on one line. */}
            {dive.computerModel && (
              <span
                title={dive.computerModel}
                className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground"
              >
                <IconDeviceWatch
                  aria-hidden
                  className="size-[1.15em] shrink-0 self-center"
                />
                <span className="truncate">{dive.computerModel}</span>
              </span>
            )}
            {/* Pushed, so closing it (or swiping back) returns here, with
                the dive left scrolled where it was. The 44 px target
                overhangs the card's padding, not the row. */}
            {expand && dive.sparkline && (
              <Link
                to="/dive/$diveId/profile"
                params={{ diveId: dive.id }}
                state={{ fromDive: true }}
                resetScroll={false}
                aria-label="Show the profile full screen"
                className="-my-3 -mr-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary transition-opacity duration-150 select-none hover:opacity-70 active:opacity-50 active:duration-0"
              >
                <IconArrowsMaximize aria-hidden className="size-4.5" />
              </Link>
            )}
          </div>
        </div>
        {dive.sparkline ? (
          // Anything thrown here is a profile that fails to draw, which
          // would fail again, so it offers no retry.
          <CatchBoundary
            getResetKey={() => profileKey(dive)}
            errorComponent={() => (
              <ProfileFailed alarms={dive.ascentAlarmCount} />
            )}
          >
            <ProfileBody key={profileKey(dive)} dive={dive} mod={mod} />
          </CatchBoundary>
        ) : (
          <p className="text-sm leading-[1.45] text-muted-foreground">
            No dive computer profile. Importing a Subsurface export attaches it.
          </p>
        )}
      </Card>
    </section>
  )
}

// The chart once its code and the dive's samples are in, which for a dive
// kept on the phone is within a few frames. Until then the card holds its
// final height, blank for 150 ms so a quick load shows no skeleton.
function ProfileBody({ dive, mod }: { dive: Dive; mod: number | null }) {
  const { profile, chart, retry } = useChartLoads(dive)
  const late = useAfter(150)
  if (profile.status === "rejected" || chart.status === "rejected") {
    return <ProfileFailed alarms={dive.ascentAlarmCount} retry={retry} />
  }
  if (profile.status === "fulfilled" && chart.status === "fulfilled") {
    const Chart = chart.value.default
    return <Chart dive={dive} mod={mod} profile={profile.value} />
  }
  return <ProfilePlaceholder alarms={dive.ascentAlarmCount} bare={!late} />
}

// The chart's sections at their final heights (see chart/profile.tsx), each
// sketched where its content will land: the readout, the chart with its
// gutter and time labels, the temperature lane and one row per alarm. Bare
// keeps the space but hides the sketch, for the failed state and a load's
// first 150 ms.
function ProfilePlaceholder({
  alarms,
  bare,
}: {
  alarms: number
  bare?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        // Faded in, as the Log's sketch is, once a load turns out slow.
        bare ? "invisible" : "animate-in duration-300 ease-linear fade-in-0"
      )}
    >
      <div
        className="flex items-end justify-between pb-1"
        style={{ height: readoutHeight }}
      >
        <div className="flex items-baseline gap-2">
          <Skeleton className="h-6.5 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="relative" style={{ height: chartHeight }}>
        {[0.25, 0.5, 0.75, 1].map((part) => (
          <Skeleton
            key={part}
            className="absolute right-[calc(100%-26px)] h-2 w-5"
            style={{ top: plotTop + plotHeight * part - 4 }}
          />
        ))}
        <Skeleton
          className="absolute right-0"
          style={{ left: plotLeft, top: plotTop, height: plotHeight }}
        />
        <div
          className="absolute right-0 flex justify-between"
          style={{ left: plotLeft, top: plotTop + plotHeight + 9 }}
        >
          {[0, 1, 2, 3, 4].map((tick) => (
            <Skeleton key={tick} className="h-2 w-4" />
          ))}
        </div>
      </div>
      <div className="-mt-1 flex flex-col gap-1.5">
        <div
          className="flex items-center justify-between"
          style={{ height: laneHeaderHeight }}
        >
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="relative" style={{ height: laneHeight }}>
          <Skeleton
            className="absolute right-0"
            style={{
              left: plotLeft,
              top: laneTop,
              height: laneHeight - laneTop - laneBottom,
            }}
          />
        </div>
      </div>
      {alarms > 0 && (
        <div className="-mx-4 mt-1 -mb-4 flex flex-col border-t pb-1.5">
          <div
            className="flex items-center justify-between px-4 pt-3 pb-1"
            style={{ height: alarmsHeaderHeight }}
          >
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-3" />
          </div>
          {Array.from({ length: alarms }, (_, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2"
              style={{ height: alarmRowHeight }}
            >
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Offline before the profile was ever fetched, the server unreachable, or
// a profile that fails to draw (no retry then). The card keeps its height,
// so nothing below moves, and the message sits where the chart would be.
function ProfileFailed({
  alarms,
  retry,
}: {
  alarms: number
  retry?: () => void
}) {
  return (
    <div className="relative">
      <ProfilePlaceholder alarms={alarms} bare />
      <div
        role="status"
        className="absolute inset-x-0 flex flex-col items-center justify-center gap-3 text-center"
        style={{ top: readoutHeight + 12, height: chartHeight }}
      >
        <p className="text-sm text-muted-foreground">
          {retry
            ? "The profile couldn't be loaded."
            : "The profile couldn't be drawn."}
        </p>
        {retry && (
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}
