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
  ModelPicker,
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
  const glide = useGlide(list, header, "mark-limit", `${oxygen} ${limit}`)

  const atLimit = mod(oxygen, limit, salt)
  const atCeiling = mod(oxygen, Math.max(limit, 1.6), salt)
  const deepest = Math.min(60, Math.floor(atCeiling) + 3)
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
  // Steps and the chips glide; typing lands at once, as each key would
  // start a glide to a mix that's only half typed, and so does a jump of
  // the line past a whole list of rows, which no eye could follow.
  const change = (next: number, typing = false) => {
    const mix = oxygenOf(next)
    const line = Math.max(3, Math.floor(mod(mix, limit, salt)) + 1)
    const far = Math.abs(line - lines.over) * rowHeight > glide.height()
    const glides = mix !== oxygen && !typing && !far
    if (glides) glide.capture()
    setFrom(glides ? lines : null)
    setPercent(next)
  }
  // When the row at `depth` changes zone as `line` passes its middle, or 0
  // for a row that line leaves as it was.
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

        <ModelPicker className="-mt-1" />

        <section aria-labelledby="ndl-depths" className="mt-4">
          <ToolHeading id="ndl-depths">By depth</ToolHeading>
          {/* Clipped, not hidden, so the header can stick as the page
              scrolls. */}
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
              <span role="columnheader" className="text-right">
                NDL
              </span>
              <span role="columnheader" className="text-right">
                ppO₂
              </span>
            </div>
            <div ref={list} role="rowgroup" className="relative">
              {depths.map((depth) => {
                const over = depth > atLimit
                const past = depth > atCeiling
                const overAt = crossing("over", depth)
                const pastAt = crossing("past", depth)
                // The text takes the look of whichever line passes last.
                const textAt = Math.max(overAt, pastAt)
                return (
                  <div
                    key={depth}
                    role="row"
                    data-glide={`d${depth}`}
                    className="relative grid h-11.5 grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))] items-center gap-x-2 border-t px-4 text-[15px] tabular-nums first:border-t-0"
                  >
                    {/* The zones, each switched as its line glides over
                        the row: orange past the setting, then hatched red
                        past 1.6 bar over it. */}
                    <span
                      aria-hidden
                      style={{ transitionDelay: `${overAt}ms` }}
                      className={cn(
                        "pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--warn)_7%,transparent)] shadow-[inset_3px_0_0_var(--warn)] transition-opacity duration-0",
                        !over && "opacity-0"
                      )}
                    />
                    <span
                      aria-hidden
                      style={{ transitionDelay: `${pastAt}ms` }}
                      className={cn(
                        "pointer-events-none absolute inset-0 bg-card bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_oklab,var(--destructive)_8%,transparent)_6px_12px)] shadow-[inset_3px_0_0_var(--destructive)] transition-opacity duration-0",
                        !past && "opacity-0"
                      )}
                    />
                    <span role="cell" className="relative">
                      {depth} m
                    </span>
                    <span
                      role="cell"
                      style={{ transitionDelay: `${textAt}ms` }}
                      className={cn(
                        "relative text-right font-semibold transition-colors duration-0",
                        past
                          ? "text-muted-foreground/60"
                          : over && "text-muted-foreground"
                      )}
                    >
                      {past ? "—" : ndlText(model, oxygen, depth * 1000)}
                    </span>
                    <span
                      role="cell"
                      style={{ transitionDelay: `${textAt}ms` }}
                      className={cn(
                        "relative text-right transition-[color,font-weight] duration-0",
                        past
                          ? "font-semibold text-destructive"
                          : over
                            ? "font-semibold text-warn"
                            : "text-muted-foreground"
                      )}
                    >
                      {po2At(oxygen, depth, salt).toFixed(2)}
                    </span>
                  </div>
                )
              })}
              {marks.map((mark) => (
                <div
                  key={mark.key}
                  data-glide={mark.key}
                  aria-hidden
                  style={{ top: mark.index * rowHeight - 11 }}
                  className="pointer-events-none absolute inset-x-0 z-10 h-[22px]"
                >
                  <span
                    className={cn(
                      "absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2",
                      mark.past ? "bg-destructive" : "bg-warn"
                    )}
                  />
                  <span
                    className={cn(
                      "absolute top-0 left-3 inline-flex h-[22px] items-center gap-1.5 rounded-full bg-card pr-2.5 pl-2 text-xs font-semibold whitespace-nowrap tabular-nums ring-[1.5px]",
                      mark.past
                        ? "text-destructive ring-destructive"
                        : "text-warn ring-warn"
                    )}
                  >
                    <i className="size-[7px] rounded-full bg-current" />
                    MOD @ {mark.bar.toFixed(1)} ppO₂: {mark.depth.toFixed(1)} m
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
