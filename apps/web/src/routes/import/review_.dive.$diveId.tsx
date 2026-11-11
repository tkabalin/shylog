import { useEffect, useState } from "react"
import type { DiveId } from "@shylog/core"
import {
  IconDeviceWatch,
  IconMapPin,
  IconPlayerSkipForward,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"

import { Card } from "@/components/ui/card"
import { loadPending, setOverrides, useImport } from "@/data/import"
import { useLog } from "@/data/log"
import { computerName } from "@/dive/form/values"
import { clockTime } from "@/format/dates"
import { depth, minutes } from "@/format/figures"
import {
  Compare,
  OptionCard,
  OtherDays,
  PairingFrame,
  useToReview,
  type PairOption,
} from "@/import/pairing"
import { dayAndTime, ImportSection, shortDay } from "@/import/parts"
import {
  chooseFor,
  choicesOf,
  entries,
  handDays,
  leftOutLabels,
  capital,
  pairedWith,
  type Entry,
} from "@/import/review"

export const Route = createFileRoute("/import/review_/dive/$diveId")({
  component: HandPairing,
})

// The pairing screen turned round, for a hand-logged dive under Not
// paired: its day's computer dives, any already paired marked, and Leave
// unpaired.
function HandPairing() {
  const diveId = Route.useParams().diveId as DiveId
  const { loaded, preview, overrides } = useImport()
  const { log } = useLog()
  const toReview = useToReview()
  const [initial, setInitial] = useState(() =>
    preview ? choicesOf(preview, overrides) : null
  )
  // Opened by a reload, the preview arrives after the first render.
  if (!initial && preview) setInitial(choicesOf(preview, overrides))

  useEffect(() => {
    if (!loaded) loadPending().catch(() => {})
  }, [loaded])
  const hand = log?.dive.get(diveId)
  const known = !!preview && handDays(preview).has(diveId)
  useEffect(() => {
    if (loaded && log && (!known || !hand)) toReview()
  }, [loaded, log, known, hand, toReview])

  if (!preview || !log || !hand || !known) return null
  const name = computerName(preview.computerModel)
  const day = handDays(preview).get(diveId)!
  const current = pairedWith(preview, overrides, diveId)
  const was =
    initial &&
    [...initial].find(
      ([, found]) => found.kind === "pair" && found.diveId === diveId
    )?.[0]
  const site = (id: string) => {
    const other = log.dive.get(id)
    return (other && log.sites.get(other.siteId)?.name) ?? "Unknown site"
  }

  const option = (entry: Entry, withDay: boolean): PairOption => {
    const { dive, reason } = entry
    const before = initial?.get(dive.ref)
    const takenFrom =
      before?.kind === "pair" && before.diveId !== diveId ? before.diveId : null
    return {
      key: dive.ref,
      icon: IconDeviceWatch,
      label: `${withDay ? `${shortDay(dive.startTime)} · ` : ""}${clockTime(dive.startTime)}`,
      meta: `${depth(dive.maxDepth)} m · ${minutes(dive.duration)} min${reason ? ` · ${leftOutLabels[reason]}` : ""}`,
      note:
        takenFrom &&
        `Now paired with this dive, so ${site(takenFrom)} will be left unpaired`,
      current: was === dive.ref,
      on: current === dive.ref,
      onPick: () =>
        setOverrides(chooseFor(preview, overrides, diveId, dive.ref)),
    }
  }
  const all = [...entries(preview).values()]
  const sameDay = all.filter((entry) => entry.dive.day === day)
  const otherDays = all.filter((entry) => entry.dive.day !== day)
  const chosen = current ? entries(preview).get(current) : undefined

  return (
    <PairingFrame>
      <ImportSection title="Your dive">
        <Card className="gap-0.5 px-4 py-3.5">
          <span className="flex min-w-0 items-center gap-1.5 text-base font-medium tracking-[-0.015em]">
            <IconMapPin
              aria-hidden
              className="size-[1.15em] shrink-0 text-muted-foreground"
            />
            <span className="truncate">{site(diveId)}</span>
          </span>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {dayAndTime(hand.startTime)} · {depth(hand.maxDepth)} m ·{" "}
            {minutes(hand.duration)} min
          </span>
        </Card>
      </ImportSection>

      <ImportSection title="Pair with">
        <div
          role="radiogroup"
          aria-label="Pair with"
          className="flex flex-col gap-3"
        >
          {sameDay.length > 0 && (
            <OptionCard
              heading={`${capital(name)} dives on ${shortDay(hand.startTime)}`}
              options={sameDay.map((entry) => option(entry, false))}
            />
          )}
          <OptionCard
            options={[
              {
                key: "none",
                icon: IconPlayerSkipForward,
                label: "Leave unpaired",
                meta: "Your dive stays as it is",
                current: was == null,
                on: current == null,
                onPick: () =>
                  setOverrides(chooseFor(preview, overrides, diveId, null)),
              },
            ]}
          />
          <OtherDays options={otherDays.map((entry) => option(entry, true))} />
        </div>
      </ImportSection>

      {chosen && (
        <Compare
          computer={chosen.dive}
          hand={hand}
          entry={chosen}
          name={name}
        />
      )}
    </PairingFrame>
  )
}
