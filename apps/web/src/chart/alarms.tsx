import { memo } from "react"
import { IconAlertTriangle } from "@tabler/icons-react"

import { depth } from "@/format/figures"

import { alarmRowHeight, alarmsHeaderHeight } from "./layout"
import { clock } from "./format"
import type { Alarm } from "./model"

// The computer's alarms under the chart, each moving the crosshair to its
// fastest ascent. Memoised, so scrubbing the chart doesn't redraw it.
export const Alarms = memo(function Alarms({
  alarms,
  onShow,
}: {
  alarms: Alarm[]
  onShow: (alarm: Alarm) => void
}) {
  if (!alarms.length) return null
  return (
    <section
      aria-labelledby="alarms-h"
      className="-mx-4 mt-1 -mb-4 flex flex-col border-t pb-1.5"
    >
      <div
        className="flex items-baseline justify-between px-4 pt-3 pb-1"
        style={{ height: alarmsHeaderHeight }}
      >
        <h3
          id="alarms-h"
          className="text-[13px] font-semibold text-muted-foreground"
        >
          Alarms
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {alarms.length}
        </span>
      </div>
      <ul>
        {alarms.map((alarm) => {
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
                onClick={() => onShow(alarm)}
                aria-label={`Ascent rate alarm at ${clock(event.start)} ${spoken}, peak ascent ${peak.toFixed(1)} metres per minute. Show on profile.`}
                // The tint comes on at once and fades on release.
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 text-left transition-colors duration-150 outline-none select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] hover:bg-muted/60 focus-visible:bg-muted active:bg-muted active:duration-0"
                style={{ height: alarmRowHeight }}
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
                  <span className="text-xs text-muted-foreground">
                    peak ascent
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
})
