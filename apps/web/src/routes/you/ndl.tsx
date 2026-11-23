import { useEffect, useRef, useState } from "react"
import { airOxygen, defaultSettings, maxPo2 as po2At, mod } from "@shylog/core"
import { createFileRoute } from "@tanstack/react-router"
import { cn } from "cn"

import { tagChip } from "@/components/tag-chip"
import { Card } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useLog } from "@/data/log"
import { Haptic } from "@/lib/haptic"
import { crossingDelay, glideDuration, useGlide } from "@/lib/glide"
import { ndlText, useNdlModel, warmNdl } from "@/tools/ndl-model"
import {
  Controls,
  NdlHeading,
  Stepper,
  stuckHeader,
  ToolHeading,
} from "@/tools/parts"
import { PageBar } from "@/you/bar"

export const Route = createFileRoute("/you/ndl")({
  component: NdlPage,
})

const back = { label: "You", to: "/you" } as const
const salt = { waterType: "salt" } as const

// Per cent; 21 and below are air, 20.9 % in every calculation.
const presets = [
  { value: 21, label: "Air" },
  { value: 28, label: "EAN28" },
  { value: 32, label: "EAN32" },
  { value: 36, label: "EAN36" },
  { value: 40, label: "EAN40" },
]

const oxygenOf = (percent: number) =>
  percent <= 21 ? airOxygen : Math.round(percent * 10)

// To the tenth, from what was typed, with a comma for a point. Under 21 is
// taken as still being typed (the 3 of 32), so the table waits.
function parsePercent(text: string) {
  const value = Number.parseFloat(text.replace(",", "."))
  if (Number.isNaN(value) || value < 21) return null
  return Math.min(100, Math.round(value * 10) / 10)
}

// A step to the next whole per cent, from a whole one or between two.
function stepped(percent: number, direction: -1 | 1) {
  const whole = Number.isInteger(percent)
    ? percent + direction
    : direction < 0
      ? Math.floor(percent)
      : Math.ceil(percent)
  return Math.min(100, Math.max(21, whole))
}

const percentText = (percent: number) => percent.toFixed(1).replace(/\.0$/, "")

const mixName = (percent: number) =>
  percent <= 21
    ? "Air"
    : percent >= 100
      ? "Pure O₂"
      : `EAN${percentText(percent)}`

// To the hundredth, but up past a line, so a row there never reads as the
// limit itself (1.401 bar as 1.40 under "MOD @ 1.4"). Up from whole mbar.
const ppO2Text = (bar: number, over: boolean) =>
  (over ? Math.ceil(Math.round(bar * 1000) / 10) / 100 : bar).toFixed(2)

// Rows are one height, so a marker's place is a row's edge.
const rowHeight = 46

// One mix's NDL and PO₂ at every metre from 3 m to a few past its MOD at
// 1.6 bar, opening on the line where it passes the maximum PO₂.
function NdlPage() {
  const { log } = useLog()
  const limit = log?.settings.maxPo2 ?? defaultSettings.maxPo2
  const model = useNdlModel()
  const [percent, setPercent] = useState(32)
  const [typed, setTyped] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const oxygen = oxygenOf(percent)
  // Centred on the line only on opening: after that the rows stay put, so
  // a diver watching one depth sees its NDL change rather than the row move.
  const glide = useGlide(list, header, "mark-limit", `${oxygen} ${limit}`, {
    follow: false,
  })
  // The deepest row a shorter mix still shows, as it was on screen when the
  // mix changed: dropping it there would pull the page up as the scroll
  // clamps. Lowered as rows leave below, and dropped once the mix's own foot.
  const [floor, setFloor] = useState<number | null>(null)

  const atLimit = mod(oxygen, limit, salt)
  const atCeiling = mod(oxygen, Math.max(limit, 1.6), salt)
  const foot = Math.min(60, Math.floor(atCeiling) + 3)
  const deepest = Math.max(foot, floor ?? 0)
  const depths = Array.from(
    { length: Math.max(deepest - 2, 1) },
    (_, i) => i + 3
  )
  const firstOver = depths.findIndex((depth) => depth > atLimit)
  const firstPast = depths.findIndex((depth) => depth > atCeiling)
  // Each line as the depth of the first row below it.
  const lines = {
    over: depths[firstOver] ?? deepest + 1,
    past: depths[firstPast] ?? deepest + 1,
  }
  // Where the lines were before the mix changed, so each row changes zone
  // as its line glides over it rather than all at once. Dropped once the
  // glide is over, so nothing else that changes a colour, a theme say,
  // waits for it.
  const [from, setFrom] = useState<typeof lines | null>(null)
  useEffect(() => {
    if (!from) return
    const timer = setTimeout(() => setFrom(null), glideDuration + 40)
    return () => clearTimeout(timer)
  }, [from, oxygen])
  // The deepest row up to the scroller's foot, under the tab bar and the
  // keyboard too, as the page's height counts them.
  const lowestShown = () => {
    const rows = list.current
    const scroller = rows?.closest<HTMLElement>("#main")
    if (!rows || !scroller) return deepest
    const bottom = Math.min(
      scroller.getBoundingClientRect().bottom,
      window.innerHeight
    )
    const seen = (bottom - rows.getBoundingClientRect().top) / rowHeight
    return Math.min(deepest, Math.max(3, Math.floor(seen) + 3))
  }
  useEffect(() => {
    // One at or above the foot keeps nothing, so waits for the next change.
    if (floor == null || floor <= foot) return
    const scroller = list.current?.closest<HTMLElement>("#main")
    let frame = 0
    const trim = () => {
      frame = 0
      const lowest = lowestShown()
      if (lowest <= foot) setFloor(null)
      else if (lowest < floor) setFloor(lowest)
    }
    const onScroll = () => {
      frame ||= requestAnimationFrame(trim)
    }
    scroller?.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      scroller?.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [floor, foot]) // eslint-disable-line react-hooks/exhaustive-deps

  // Steps and the chips glide; typing lands at once, as each key would
  // start a glide to a mix that's only half typed, and so does a jump of
  // the line past a whole list of rows, which no eye could follow.
  const change = (next: number, typing = false) => {
    const mix = oxygenOf(next)
    const line = Math.max(3, Math.floor(mod(mix, limit, salt)) + 1)
    const far = Math.abs(line - lines.over) * rowHeight > glide.height()
    const glides = mix !== oxygen && !typing && !far
    if (glides) glide.capture()
    setFloor(lowestShown())
    setFrom(glides ? lines : null)
    setPercent(next)
  }
  // When the row at `depth` changes its figures' look as `line` passes its
  // middle, or 0 for a row that line leaves as it was.
  const crossing = (line: "over" | "past", depth: number) => {
    if (!from) return 0
    const was = from[line]
    const now = lines[line]
    if (depth >= was === depth >= now) return 0
    return crossingDelay(Math.abs(depth + 0.5 - was) / Math.abs(now - was))
  }

  // The tables a step or a chip would show next, worked out while the diver
  // reads this one.
  useEffect(() => {
    const ceiling = Math.max(limit, 1.6)
    const next = new Set(
      [stepped(percent, -1), stepped(percent, 1)]
        .concat(presets.map((preset) => preset.value))
        .map(oxygenOf)
    )
    const jobs: [number, number][] = []
    for (const mix of next) {
      const deepest = Math.min(60, Math.floor(mod(mix, ceiling, salt)))
      for (let depth = 3; depth <= deepest; depth++)
        jobs.push([mix, depth * 1000])
    }
    return warmNdl(model, jobs)
  }, [model, percent, limit])

  const marks = [
    {
      key: "mark-limit",
      index: firstOver,
      depth: atLimit,
      bar: limit,
      // At 1.6 bar or more, the setting is the only line, and it's red.
      past: limit >= 1.6,
    },
    // Only where 1.6 bar is past the setting.
    ...(limit < 1.6
      ? [
          {
            key: "mark-16",
            index: firstPast,
            depth: atCeiling,
            bar: 1.6,
            past: true,
          },
        ]
      : []),
  ].filter((mark) => mark.index >= 0)
  // Always both, so a band glides in from the foot rather than popping in.
  const zones = [
    {
      key: "zone-limit",
      index: firstOver < 0 ? depths.length : firstOver,
      past: limit >= 1.6,
    },
    {
      key: "zone-16",
      index: limit < 1.6 && firstPast >= 0 ? firstPast : depths.length,
      past: true,
    },
  ]

  return (
    <div>
      <PageBar back={back} title="NDL table" />
      <div className="px-4 pb-4 md:mx-auto md:w-full md:max-w-xl">
        <Controls labelledBy="ndl-mix">
          <ToolHeading id="ndl-mix">
            Mix{" "}
            <span className="font-medium text-muted-foreground/60">
              · {mixName(percent)}
            </span>
          </ToolHeading>
          <Stepper
            label="Oxygen percentage"
            value={typed ?? percentText(percent)}
            unit="%"
            inputMode="decimal"
            onType={(text) => {
              setTyped(text)
              const next = parsePercent(text)
              if (next != null) change(next, true)
            }}
            onStep={(direction) => {
              setTyped(null)
              change(stepped(percent, direction))
            }}
            onDone={() => setTyped(null)}
            less="1% less oxygen"
            more="1% more oxygen"
            atLeast={percent <= 21}
            atMost={percent >= 100}
          >
            <ToggleGroup
              aria-label="Common mixes"
              value={presets
                .filter((preset) => oxygenOf(preset.value) === oxygen)
                .map((preset) => String(preset.value))}
              onValueChange={(next) => {
                const picked = next[0]
                if (picked === undefined) return
                setTyped(null)
                change(Number(picked))
              }}
              className="grid w-full grid-cols-5 gap-1.5 px-4 pb-3.5 max-[374px]:gap-1"
            >
              {presets.map(({ value, label }) => (
                <ToggleGroupItem
                  key={value}
                  value={String(value)}
                  className={cn(
                    tagChip,
                    // Below 375 px the names need smaller text to fit.
                    "w-full min-w-0 px-0 tabular-nums max-[374px]:text-[13px] desk:h-9"
                  )}
                >
                  {label}
                  <Haptic />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Stepper>
        </Controls>

        <section aria-labelledby="ndl-depths" className="mt-4">
          <ToolHeading id="ndl-depths">By depth</ToolHeading>
          {/* Clipped, not hidden, so the header can stick as the page
              scrolls, and the zones end with the table. */}
          <Card
            role="table"
            aria-labelledby="ndl-depths"
            className="gap-0 overflow-clip py-0"
          >
            <div
              ref={header}
              role="row"
              className={cn(
                stuckHeader,
                "grid h-9 grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))] items-center gap-x-2 border-b px-4 text-xs font-semibold text-muted-foreground"
              )}
            >
              <span role="columnheader">Depth</span>
              <NdlHeading />
              <span role="columnheader" className="text-right">
                ppO₂
              </span>
            </div>
            <div ref={list} role="rowgroup" className="relative">
              {/* A band from each line down, gliding with it: orange past
                  the setting, hatched red past 1.6 bar. One with no line
                  waits below, and both run on past the clipped foot. */}
              {zones.map((zone) => (
                <span
                  key={zone.key}
                  data-glide={zone.key}
                  aria-hidden
                  style={{
                    top: zone.index * rowHeight,
                    height: `calc(${(depths.length - zone.index) * rowHeight}px + 100dvh)`,
                  }}
                  className={cn(
                    "pointer-events-none absolute inset-x-0",
                    zone.past
                      ? "bg-card bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_oklab,var(--destructive)_8%,transparent)_6px_12px)] shadow-[inset_3px_0_0_var(--destructive)]"
                      : "bg-[color-mix(in_oklab,var(--warn)_7%,transparent)] shadow-[inset_3px_0_0_var(--warn)]"
                  )}
                />
              ))}
              {depths.map((depth) => {
                const over = depth > atLimit
                const past = depth > atCeiling
                // The look of whichever line passes last. The NDL turns to
                // a dash or back only as the 1.6 bar line reaches the row.
                const pastAt = crossing("past", depth)
                const textAt = Math.max(crossing("over", depth), pastAt)
                return (
                  <div
                    key={depth}
                    role="row"
                    data-glide={`d${depth}`}
                    className="relative grid h-11.5 grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))] items-center gap-x-2 border-t px-4 text-[15px] tabular-nums first-of-type:border-t-0"
                  >
                    <span role="cell">{depth} m</span>
                    <span
                      role="cell"
                      data-switch={`d${depth}-ndl`}
                      data-switch-at={textAt}
                      data-switch-blank={pastAt > 0 || undefined}
                      className={cn(
                        "text-right font-semibold",
                        past
                          ? "text-muted-foreground/60"
                          : over && "text-muted-foreground"
                      )}
                    >
                      {past ? "—" : ndlText(model, oxygen, depth * 1000)}
                    </span>
                    <span
                      role="cell"
                      data-switch={`d${depth}-po2`}
                      data-switch-at={textAt}
                      className={cn(
                        "text-right",
                        past
                          ? "font-semibold text-destructive"
                          : over
                            ? "font-semibold text-warn"
                            : "text-muted-foreground"
                      )}
                    >
                      {ppO2Text(po2At(oxygen, depth, salt), over)}
                    </span>
                  </div>
                )
              })}
              {marks.map((mark) => (
                <div
                  key={mark.key}
                  data-glide={mark.key}
                  aria-hidden
                  style={{ top: mark.index * rowHeight - 13 }}
                  className="pointer-events-none absolute inset-x-0 z-10 h-[26px]"
                >
                  <span
                    className={cn(
                      "absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2",
                      mark.past ? "bg-destructive" : "bg-warn"
                    )}
                  />
                  <span
                    className={cn(
                      "absolute top-0 left-3 inline-flex h-[26px] items-center gap-1.5 rounded-full bg-card pr-2.5 pl-2 whitespace-nowrap tabular-nums ring-[1.5px]",
                      mark.past
                        ? "text-destructive ring-destructive"
                        : "text-warn ring-warn"
                    )}
                  >
                    <i className="size-[7px] rounded-full bg-current" />
                    {/* The depth first and at the table's size, as it's
                        what the line is read for. */}
                    <span className="text-[15px] font-bold">
                      {mark.depth.toFixed(1)} m
                    </span>
                    <span className="text-xs font-medium opacity-80">
                      MOD {mark.bar.toFixed(1)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
