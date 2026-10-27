import { useMemo, useRef, type ReactNode } from "react"

import type { Profile as ProfileData } from "@/api/client"
import type { Dive } from "@/data/db"
import { useLog } from "@/data/log"
import { profileMaxDepth } from "@/dive/figures"

import { plotTop, timeAxisHeight } from "./layout"
import { profileGutter, profileModel } from "./model"
import { ProfileTable } from "./profile-table"
import { useSize } from "./size"
import { DepthView, LaneView, Readout, useCrosshair } from "./view"

// The full-screen chart (routes/dive/$diveId.profile.tsx): the screen's
// `bar` beside the readout, the depth chart as tall as fits, then the lane,
// laid out upright; `turned` when the screen shows it a quarter turn round.
export function FullProfile({
  dive,
  mod,
  profile,
  turned,
  bar,
}: {
  dive: Dive
  mod: number | null
  profile: ProfileData
  turned: boolean
  bar: ReactNode
}) {
  // The depth chart fills the space the readout and lane leave.
  const ref = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(ref)
  const plotHeight = Math.max(80, height - plotTop - timeAxisHeight)
  // Subscribed, so using the computer's value redraws the axis.
  const { log } = useLog()
  const depth = profileMaxDepth(dive, log?.fieldMeta.get(dive.id))
  const model = useMemo(
    () =>
      width && height
        ? profileModel(
            profile,
            { maxDepth: depth, mod },
            width - profileGutter(profile, depth),
            plotHeight
          )
        : null,
    [profile, depth, mod, width, height, plotHeight]
  )
  const { index, handlers } = useCrosshair(model, { free: true, turned })

  return (
    <div
      data-slot="profile"
      // On the screen's background, not a card's: the labels' halos and
      // the dot's centre match it.
      className="flex h-full flex-col gap-3 select-none [--card:var(--background)] [-webkit-touch-callout:none]"
    >
      <div className="flex items-end gap-4">
        {bar}
        {/* Whole, as on the card; a long site name in the bar gives way. */}
        <Readout model={model} index={index} className="shrink-0" />
      </div>
      <div ref={ref} className="min-h-0 flex-1">
        {model && (
          <DepthView
            model={model}
            index={index}
            width={width}
            handlers={handlers}
            free
          />
        )}
      </div>
      <LaneView
        model={model}
        index={index}
        width={width}
        handlers={handlers}
        free
      />
      {model && <ProfileTable model={model} />}
    </div>
  )
}
