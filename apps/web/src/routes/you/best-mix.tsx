import { useEffect, useRef, useState } from "react"
import { airOxygen, bestMix, defaultSettings, mod } from "@shylog/core"
import { createFileRoute } from "@tanstack/react-router"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import { useLog } from "@/data/log"
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

export const Route = createFileRoute("/you/best-mix")({
  component: EanxPage,
})

const back = { label: "You", to: "/you" } as const
const salt = { waterType: "salt" } as const

// Air, then every whole mix to EAN40, in tenths of a per cent.
const mixes = [airOxygen, ...Array.from({ length: 19 }, (_, i) => 220 + i * 10)]

// Whole metres, from what was typed, with a comma for a point.
function parseDepth(text: string) {
  const value = Number.parseFloat(text.replace(",", "."))
  if (Number.isNaN(value) || value <= 0) return null
  return Math.min(60, Math.max(1, Math.round(value)))
}

const metres = (depth: number) => `${depth.toFixed(1)} m`

// The rows' heights in px, min-h-14 and min-h-11.5, which the crossings
// are timed by.
const exactHeight = 56
const rowHeight = 46

// The nitrox mixes with their MODs and NDLs at a target depth, the list
// kept centred on the richest mix that's safe there.
function EanxPage() {
  const { log } = useLog()
  const maxPo2 = log?.settings.maxPo2 ?? defaultSettings.maxPo2
  const model = useNdlModel()
  const [depth, setDepth] = useState<number | null>(null)
  // What's being typed, until the field is left.
  const [typed, setTyped] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const glide = useGlide(
    list,
    header,
    depth == null ? "310" : "exact",
    `${depth} ${maxPo2}`
  )
  const exact = depth == null ? null : bestMix(depth * 1000, maxPo2, salt)
  // The exact mix before the depth changed: a row's MOD turns red or back
  // as the exact row glides past it. Dropped once the glide is over, so
  // nothing else that changes a colour, a theme say, waits for it.
  const [from, setFrom] = useState<number | null>(null)
  useEffect(() => {
    if (from == null) return
    const timer = setTimeout(() => setFrom(null), glideDuration + 40)
    return () => clearTimeout(timer)
  }, [from, depth])
  // The whole mixes the exact row passes between two depths, nearest its
  // old place first.
  const between = (was: number | null, now: number | null) =>
    was == null || now == null
      ? []
      : mixes
          .filter((oxygen) => (oxygen - was) * (oxygen - now) < 0)
          .sort((a, b) => Math.abs(a - was) - Math.abs(b - was))
  const crossed = between(from, exact)
  // When the middle of the exact row passes the middle of a row it
  // crosses: it travels the crossed rows' height while they travel its own,
  // so the two meet `exactHeight / 2 + (i - 0.5) × rowHeight` into that.
  const passed = (oxygen: number) => {
    const rank = crossed.indexOf(oxygen) + 1
    if (!rank) return 0
    return crossingDelay(
      (exactHeight / 2 + (rank - 0.5) * rowHeight) /
        (exactHeight + crossed.length * rowHeight)
    )
  }
  // Steps glide; typing lands at once, as each key would start a glide to a
  // depth that's only half typed, and so does a jump past a whole list of
  // rows, which no eye could follow.
  const change = (next: number | null, typing = false) => {
    if (next === depth) return
    const nextExact = next == null ? null : bestMix(next * 1000, maxPo2, salt)
    const far = between(exact, nextExact).length * rowHeight > glide.height()
    const glides = !typing && !far
    if (glides) glide.capture()
    setFrom(glides ? exact : null)
    setDepth(next)
  }

  // The next step's NDLs, worked out while the diver reads this one.
  useEffect(() => {
    const ceiling = Math.max(maxPo2, 1.6)
    const next = depth == null ? [30] : [depth - 1, depth + 1]
    const jobs = next
      .filter((target) => target >= 1 && target <= 60)
      .flatMap((target) =>
        [...mixes, bestMix(target * 1000, maxPo2, salt)]
          .filter((oxygen) => mod(oxygen, ceiling, salt) >= target)
          .map((oxygen): [number, number] => [oxygen, target * 1000])
      )
    return warmNdl(model, jobs)
  }, [model, depth, maxPo2])

  // A second MOD at 1.6 bar, the usual contingency limit, unless the
  // setting is already there.
  const contingency = maxPo2 < 1.6
  // In a fixed order in the document, the exact mix last, and placed by
  // CSS order: React moving a row's node to sort it would cancel the
  // delayed colour switch on the row it moved.
  const rows: { key: string; oxygen: number; exact: boolean }[] = mixes
    // The exact mix takes the place of a whole one it equals.
    .filter((oxygen) => oxygen !== exact)
    .map((oxygen) => ({ key: String(oxygen), oxygen, exact: false }))
  // Below air there's nothing to breathe at that depth.
  if (exact != null && exact >= airOxygen)
    rows.push({ key: "exact", oxygen: exact, exact: true })
  const sorted = rows.map((row) => row.oxygen).sort((a, b) => a - b)

  return (
    <div>
      <PageBar back={back} title="Best nitrox mix" />
      <div className="px-4 pb-4 md:mx-auto md:w-full md:max-w-xl">
        <Controls labelledBy="best-mix-depth">
          <ToolHeading id="best-mix-depth">Target depth</ToolHeading>
          <Stepper
            label="Target depth in metres"
            value={typed ?? (depth == null ? "" : String(depth))}
            // What the first step gives.
            placeholder="30"
            unit="m"
            inputMode="numeric"
            onType={(text) => {
              setTyped(text)
              change(parseDepth(text), true)
            }}
            onStep={(direction) => {
              setTyped(null)
              change(
                depth == null
                  ? 30
                  : Math.min(60, Math.max(1, depth + direction))
              )
            }}
            onDone={() => setTyped(null)}
            less="1 m shallower"
            more="1 m deeper"
            atLeast={depth === 1}
            atMost={depth === 60}
          />
        </Controls>

        <ModelPicker />

        <section aria-labelledby="best-mix-mixes" className="mt-4">
          <ToolHeading id="best-mix-mixes">Mixes</ToolHeading>
          {/* Clipped, not hidden, so the header can stick as the page
              scrolls. */}
          <Card
            role="table"
            aria-labelledby="best-mix-mixes"
            className="gap-0 overflow-clip py-0"
          >
            <div
              ref={header}
              role="row"
              className={cn(
                stuckHeader,
                "grid min-h-9 items-center gap-x-2 border-b px-4 py-1.5 text-xs leading-tight font-semibold text-muted-foreground",
                contingency
                  ? "grid-cols-[minmax(0,1.15fr)_repeat(3,minmax(0,1fr))]"
                  : "grid-cols-[minmax(0,1.15fr)_repeat(2,minmax(0,1fr))]"
              )}
            >
              <span role="columnheader">O₂</span>
              {/* Broken after the @ when narrow, never inside the
                  figure and its unit. */}
              <span role="columnheader" className="text-right">
                MOD @{" "}
                <span className="whitespace-nowrap">
                  {maxPo2.toFixed(1)} ppO₂
                </span>
              </span>
              {contingency && (
                <span role="columnheader" className="text-right">
                  MOD @ <span className="whitespace-nowrap">1.6 ppO₂</span>
                </span>
              )}
              <span
                role="columnheader"
                className={cn(
                  "text-right transition-colors duration-200 ease-out",
                  depth == null && "text-muted-foreground/60"
                )}
              >
                NDL
              </span>
            </div>
            <div ref={list} role="rowgroup" className="flex flex-col">
              {rows.map((row) => (
                <MixRow
                  key={row.key}
                  glideKey={row.key}
                  place={sorted.indexOf(row.oxygen)}
                  oxygen={row.oxygen}
                  exact={row.exact}
                  depth={depth}
                  maxPo2={maxPo2}
                  contingency={contingency}
                  ndl={(oxygen) => ndlText(model, oxygen, depth! * 1000)}
                  crossing={passed(row.oxygen)}
                />
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}

function MixRow({
  glideKey,
  place,
  oxygen,
  exact,
  depth,
  maxPo2,
  contingency,
  ndl,
  crossing,
}: {
  glideKey: string
  // Its place in the list, top first.
  place: number
  oxygen: number
  exact: boolean
  depth: number | null
  maxPo2: number
  contingency: boolean
  ndl: (oxygen: number) => string
  // When to turn red or back, in ms, as the exact row passes.
  crossing: number
}) {
  const limit = mod(oxygen, maxPo2, salt)
  const ceiling = contingency ? mod(oxygen, 1.6, salt) : limit
  const over = depth != null && limit < depth
  const past = depth != null && ceiling < depth
  // Named as the NDL table names them.
  const label =
    oxygen === airOxygen && !exact
      ? "Air"
      : oxygen >= 1000
        ? "Pure O₂"
        : exact
          ? `${(oxygen / 10).toFixed(1)}%`
          : `${oxygen / 10}%`
  return (
    <div
      role="row"
      data-glide={glideKey}
      // A whole mix the exact one stood in for comes back from behind it.
      data-glide-from={exact ? undefined : "exact"}
      style={{ order: place }}
      className={cn(
        "relative grid items-center gap-x-2 border-t px-4 text-[15px] tabular-nums",
        place === 0 && "border-t-0",
        contingency
          ? "grid-cols-[minmax(0,1.15fr)_repeat(3,minmax(0,1fr))]"
          : "grid-cols-[minmax(0,1.15fr)_repeat(2,minmax(0,1fr))]",
        exact
          ? // Opaque, so the rows sliding past go behind it.
            "z-10 min-h-14 bg-[color-mix(in_oklab,var(--primary)_9%,var(--card))] font-semibold dark:bg-[color-mix(in_oklab,var(--primary)_14%,var(--card))]"
          : "min-h-11.5 bg-card"
      )}
    >
      <span role="cell" className={cn(exact && "text-primary")}>
        {label}
      </span>
      <span
        role="cell"
        style={{ transitionDelay: `${crossing}ms` }}
        className={cn(
          "text-right transition-colors duration-0",
          over && "text-destructive"
        )}
      >
        {metres(limit)}
      </span>
      {contingency && (
        <span
          role="cell"
          className={cn("text-right", past && "text-destructive")}
        >
          {metres(ceiling)}
        </span>
      )}
      <span
        role="cell"
        style={{ transitionDelay: `${crossing}ms` }}
        className={cn(
          "text-right font-semibold transition-colors duration-0",
          past ? "text-muted-foreground/60" : over && "text-muted-foreground"
        )}
      >
        {depth != null && (
          // Fades in with the exact row on the first depth; later steps
          // swap the figure at once, as it's what the diver is reading.
          <span className="animate-appear duration-200 ease-out">
            {past ? "—" : ndl(oxygen)}
          </span>
        )}
      </span>
    </div>
  )
}
