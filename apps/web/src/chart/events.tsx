import { memo } from "react"
import { IconAlertTriangle, IconStairsUp } from "@tabler/icons-react"
import { cn } from "cn"

import { depth } from "@/format/figures"

import { eventRowHeight, eventsHeaderHeight } from "./layout"
import { clock } from "./format"
import { stopLabel, stopTone, type Alarm, type StopMark } from "./model"

// The tint comes on at once and fades on release.
const row =
  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 text-left transition-colors duration-150 outline-none select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] hover:bg-muted/60 focus-visible:bg-muted active:bg-muted active:duration-0"

// Minutes and seconds in words, for the spoken labels.
const spokenTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return [
    minutes && `${minutes} minute${minutes === 1 ? "" : "s"}`,
    rest && `${rest} second${rest === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" ")
}

// The computer's alarms and the safety stop under the chart, in time
// order; each moves the crosshair to its point. Memoised, so scrubbing the
// chart doesn't redraw it.
export const Events = memo(function Events({
  alarms,
  stop,
  onShow,
}: {
  alarms: Alarm[]
  stop: StopMark | null
  onShow: (index: number) => void
}) {
  const count = alarms.length + (stop ? 1 : 0)
  if (!count) return null
  // In time order: an ascent from the stop can raise an alarm after it.
  const before = stop
    ? alarms.filter((alarm) => alarm.event.start < stop.start).length
    : alarms.length
  const alarmRow = (alarm: Alarm) => {
    const { from, to, event, peak } = alarm
    // An alarm the computer never closed has no span to give.
    const seconds = event.end == null ? null : event.end - event.start
    const spoken =
      seconds == null
        ? `${depth(from.depth / 1000)} metres`
        : `for ${seconds} seconds, ${depth(from.depth / 1000)} to ${depth(to.depth / 1000)} metres`
    return (
      <li key={event.start}>
        <button
          type="button"
          onClick={() => onShow(alarm.peakIndex)}
          aria-label={`Ascent rate alarm at ${clock(event.start)} ${spoken}, peak ascent ${peak.toFixed(1)} metres per minute. Show on profile.`}
          className={row}
          style={{ height: eventRowHeight }}
        >
          <span className="flex min-w-0 flex-col gap-px">
            <span className="inline-flex items-center gap-1.5 text-[15px] font-medium">
              <IconAlertTriangle
                aria-hidden
                className="size-4 shrink-0 text-warn"
              />
              Ascent rate
            </span>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {depth(from.depth / 1000)}
              {seconds != null && (
                <>
                  {/* Geist's tabular arrow is small and low. */}
                  <span className="normal-nums"> → </span>
                  {depth(to.depth / 1000)}
                </>
              )}{" "}
              m{seconds != null && ` in ${seconds} s`}
            </span>
          </span>
          <span className="flex flex-col items-end gap-px tabular-nums">
            <span className="text-[15px] font-semibold text-warn">
              {peak.toFixed(1)} m/min
            </span>
            <span className="text-xs text-muted-foreground">peak ascent</span>
          </span>
        </button>
      </li>
    )
  }
  return (
    <section
      aria-labelledby="events-h"
      className="-mx-4 mt-1 -mb-4 flex flex-col border-t pb-1.5"
    >
      <div
        className="flex items-baseline justify-between px-4 pt-3 pb-1"
        style={{ height: eventsHeaderHeight }}
      >
        <h3
          id="events-h"
          className="text-[13px] font-semibold text-muted-foreground"
        >
          Events
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
      <ul>
        {alarms.slice(0, before).map(alarmRow)}
        {stop && (
          <li>
            <button
              type="button"
              onClick={() => onShow(stop.index)}
              aria-label={`${stopLabel(stop)} from ${clock(stop.start)}, held ${spokenTime(stop.held)} at an average of ${depth(stop.depth / 1000)} metres. Show on profile.`}
              className={row}
              style={{ height: eventRowHeight }}
            >
              <span className="flex min-w-0 flex-col gap-px">
                <span className="inline-flex items-center gap-1.5 text-[15px] font-medium">
                  {/* A step on the way up, as the stop draws on the
                      profile, and no clock beside the surface interval's. */}
                  <IconStairsUp
                    aria-hidden
                    className={cn("size-4 shrink-0", stopTone(stop))}
                  />
                  {stopLabel(stop)}
                </span>
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  at an average of {depth(stop.depth / 1000)} m from{" "}
                  {clock(stop.start)}
                </span>
              </span>
              <span className="flex flex-col items-end gap-px tabular-nums">
                <span
                  className={cn("text-[15px] font-semibold", stopTone(stop))}
                >
                  {clock(stop.held)}
                </span>
                <span className="text-xs text-muted-foreground">held</span>
              </span>
            </button>
          </li>
        )}
        {alarms.slice(before).map(alarmRow)}
      </ul>
    </section>
  )
})
