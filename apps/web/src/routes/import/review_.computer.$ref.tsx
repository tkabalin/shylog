import { useEffect, useState } from "react"
import type { DiveId } from "@shylog/core"
import {
  IconCalendar,
  IconFilePlus,
  IconMapPin,
  IconPlayerSkipForward,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"

import { Card } from "@/components/ui/card"
import type { Dive } from "@/data/db"
import { loadPending, pairable, setOverrides, useImport } from "@/data/import"
import { useLog } from "@/data/log"
import { computerName } from "@/dive/form/values"
import { clockTime } from "@/format/dates"
import { depth, gasDetail, minutes, temperatureRange } from "@/format/figures"
import {
  Compare,
  ComputerProfile,
  OptionCard,
  OtherDays,
  PairingFrame,
  useToReview,
  type PairOption,
} from "@/import/pairing"
import {
  dayAndTime,
  ImportSection,
  shortDay,
  unsupportedGas,
} from "@/import/parts"
import {
  choicesOf,
  choose,
  entries,
  handDays,
  type Choice,
} from "@/import/review"

export const Route = createFileRoute("/import/review_/computer/$ref")({
  component: ComputerPairing,
})

const day = 24 * 60 * 60 * 1000
const near = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) <=
  2 * day

// ChangePairingHifi: one computer dive, paired with a hand-logged dive on
// its day or another, added as a new dive, or not imported.
function ComputerPairing() {
  const { ref } = Route.useParams()
  const { loaded, preview, overrides } = useImport()
  const { log } = useLog()
  const toReview = useToReview()
  // The choices as the screen opened, for Current and what a pick undoes.
  const [initial, setInitial] = useState(() =>
    preview ? choicesOf(preview, overrides) : null
  )
  // Opened by a reload, the preview arrives after the first render.
  if (!initial && preview) setInitial(choicesOf(preview, overrides))

  useEffect(() => {
    if (!loaded) loadPending().catch(() => {})
  }, [loaded])
  const entry = preview && entries(preview).get(ref)
  useEffect(() => {
    if (loaded && !entry) toReview()
  }, [loaded, entry, toReview])

  if (!preview || !entry || !log) return null
  const { dive } = entry
  const name = computerName(preview.computerModel)
  const choice = choicesOf(preview, overrides).get(ref)!
  const was = initial?.get(ref)
  const pick = (next: Choice) =>
    setOverrides(choose(preview, overrides, ref, next))
  const siteOf = (hand: Dive) =>
    log.sites.get(hand.siteId)?.name ?? "Unknown site"

  // A hand dive another computer dive had as the screen opened.
  const takenFrom = (diveId: string) => {
    for (const [other, found] of initial ?? [])
      if (other !== ref && found.kind === "pair" && found.diveId === diveId)
        return entries(preview).get(other)
    return undefined
  }
  const option = (hand: Dive, withDay: boolean): PairOption => {
    const other = takenFrom(hand.id)
    return {
      key: hand.id,
      icon: IconMapPin,
      label: siteOf(hand),
      meta: `${withDay ? `${shortDay(hand.startTime)} · ` : ""}${clockTime(hand.startTime)} · ${depth(hand.maxDepth)} m · ${minutes(hand.duration)} min`,
      note:
        other &&
        `Now paired with this dive, so the ${clockTime(other.dive.startTime)} ${name} dive will be left unpaired`,
      current: was?.kind === "pair" && was.diveId === hand.id,
      on: choice.kind === "pair" && choice.diveId === hand.id,
      onPick: () => pick({ kind: "pair", diveId: hand.id as DiveId }),
    }
  }
  const sameDay: Dive[] = []
  const otherDays: Dive[] = []
  const seen = new Set<string>()
  for (const [diveId, handDay] of handDays(preview)) {
    const hand = log.dive.get(diveId)
    // Deleted since the preview, which apply would refuse to pair.
    if (!hand || hand.deletedAt) continue
    seen.add(diveId)
    ;(handDay === dive.day ? sameDay : otherDays).push(hand)
  }
  // Other hand-logged dives near its day, which a clock far off may hide.
  for (const hand of log.dives)
    if (
      !seen.has(hand.id) &&
      pairable(hand.id) &&
      near(hand.startTime.slice(0, 10), dive.day)
    )
      (hand.startTime.slice(0, 10) === dive.day ? sameDay : otherDays).push(
        hand
      )
  const byStart = (a: Dive, b: Dive) => b.startTime.localeCompare(a.startTime)
  sameDay.sort(byStart)
  otherDays.sort(byStart)
  // A pick from another day stays in view.
  if (
    choice.kind === "pair" &&
    !sameDay.some((hand) => hand.id === choice.diveId)
  ) {
    const picked = log.dive.get(choice.diveId)
    if (picked && !otherDays.includes(picked)) otherDays.unshift(picked)
  }

  const water = temperatureRange(dive.minTemperature, dive.maxTemperature)
  const paired = choice.kind === "pair" ? log.dive.get(choice.diveId) : null
  const where = dive.site ?? "Unknown site"

  return (
    <PairingFrame>
      <ImportSection title={`From your ${name}`}>
        <Card className="gap-3 px-4 pt-3.5 pb-4">
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-base font-medium tracking-[-0.015em] whitespace-nowrap tabular-nums">
              <IconCalendar
                aria-hidden
                className="size-[1.15em] shrink-0 text-muted-foreground"
              />
              {dayAndTime(dive.startTime)}
            </span>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {depth(dive.maxDepth)} m · {minutes(dive.duration)} min
              {water && ` · ${water} °C`}
              {dive.oxygen !== undefined && ` · ${gasDetail(dive.oxygen)}`}
            </span>
            {dive.unsupportedGas && (
              <span className="text-[13px] text-warn">{unsupportedGas}</span>
            )}
          </span>
          <ComputerProfile dive={dive} />
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
              heading={`Your dives on ${shortDay(dive.startTime)}`}
              options={sameDay.map((hand) => option(hand, false))}
            />
          )}
          <OptionCard
            options={[
              {
                key: "add",
                icon: IconFilePlus,
                label: "Add as a new dive",
                meta: `Uses the ${name}’s time, depth and profile`,
                current: was?.kind === "add",
                on: choice.kind === "add",
                onPick: () => pick({ kind: "add" }),
              },
              {
                key: "skip",
                icon: IconPlayerSkipForward,
                label: entry.reason ? "Leave out" : "Don’t import",
                meta: entry.reason
                  ? {
                      freedive: "It looks like a freedive",
                      short: "It looks like a false start",
                      earlier: "It’s from before your last download",
                    }[entry.reason]
                  : `Leave this ${name} dive out`,
                current: was?.kind === "skip",
                on: choice.kind === "skip",
                onPick: () => pick({ kind: "skip" }),
              },
            ]}
          />
          <OtherDays options={otherDays.map((hand) => option(hand, true))} />
        </div>
      </ImportSection>

      {paired ? (
        <Compare computer={dive} hand={paired} entry={entry} name={name} />
      ) : (
        <p className="-mt-2 px-1 text-sm leading-normal text-muted-foreground">
          {choice.kind === "add"
            ? `A new dive is added on ${shortDay(dive.startTime)} at ${clockTime(dive.startTime)}, at ${where}, with the ${name}’s values. Change the site and other details afterwards.`
            : entry.reason
              ? "It stays left out and won’t be offered again."
              : `This ${name} dive won’t be imported. It’ll show up again if it’s in a later export.`}
        </p>
      )}
    </PairingFrame>
  )
}
