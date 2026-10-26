import { useCallback, useMemo, useRef } from "react"

import type { Profile as ProfileData } from "@/api/client"
import type { Dive } from "@/data/db"

import { Alarms } from "./alarms"
import { plotLeft } from "./layout"
import { profileModel, type Alarm } from "./model"
import { ProfileTable } from "./profile-table"
import { useSize } from "./size"
import { DepthView, LaneView, Readout, useCrosshair } from "./view"

export { FullProfile } from "./full-profile"

// The Profile card's body, the chart's lazy chunk: the crosshair readout,
// the depth chart, the temperature lane, the alarms and the table
// alternative, drawn once the card has the dive's samples.
export default function Profile({
  dive,
  mod,
  profile,
}: {
  dive: Dive
  mod: number | null
  profile: ProfileData
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { width } = useSize(ref)
  const model = useMemo(
    () =>
      width
        ? profileModel(
            profile,
            { maxDepth: dive.maxDepth, mod },
            width - plotLeft
          )
        : null,
    [profile, dive.maxDepth, mod, width]
  )
  const { index, setChosen, handlers } = useCrosshair(model)
  const show = useCallback(
    (alarm: Alarm) => setChosen(alarm.peakIndex),
    [setChosen]
  )

  return (
    <div
      ref={ref}
      data-slot="profile"
      // Fades in from @starting-style, opacity only. A long press while
      // scrubbing selects nothing and shows no callout.
      className="flex flex-col gap-3 select-none [-webkit-touch-callout:none] motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out motion-safe:starting:opacity-0"
    >
      <Readout model={model} index={index} />
      {model && (
        <DepthView
          model={model}
          index={index}
          width={width}
          handlers={handlers}
        />
      )}
      <LaneView model={model} index={index} width={width} handlers={handlers} />
      {model && (
        <>
          <Alarms alarms={model.alarms} onShow={show} />
          <ProfileTable model={model} />
        </>
      )}
    </div>
  )
}
