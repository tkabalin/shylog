import { cn } from "cn"

import { Skeleton } from "@/components/ui/skeleton"

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
} from "./layout"

// The chart's sections at their final heights (see profile.tsx), each
// sketched where its content will land: the readout, the chart with its
// gutter and time labels, the temperature lane and one row per alarm. Bare
// keeps the space but hides the sketch, for the failed state and a load's
// first 150 ms.
export function ProfilePlaceholder({
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
      <div className="mt-1 flex flex-col gap-3">
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
