import { memo, useLayoutEffect, useRef, useSyncExternalStore } from "react"

import { cn } from "cn"

import { laneBottom, laneHeight, laneTop, plotTop } from "./layout"
import type { ProfileModel } from "./model"

// The crosshair's chosen point, outside React: a scrub moves the line and
// dot straight from the pointer handler, and only the readouts, which
// subscribe, re-render. Null rests it on the deepest point.
export type Cursor = ReturnType<typeof cursor>
type Place = (chosen: number | null) => void

export function cursor() {
  let chosen: number | null = null
  const crosshairs = new Set<Place>()
  return {
    get: () => chosen,
    set(next: number | null) {
      if (next === chosen) return
      chosen = next
      for (const place of crosshairs) place(chosen)
    },
    add(place: Place) {
      crosshairs.add(place)
      place(chosen)
      return () => void crosshairs.delete(place)
    },
  }
}

// The index of the point the crosshair is on, for a readout.
export function useIndex(model: ProfileModel | null, cursor: Cursor) {
  const chosen = useSyncExternalStore(cursor.add, cursor.get)
  return model ? Math.min(chosen ?? model.deepest, model.points.length - 1) : 0
}

// To whole device pixels: each piece is a layer of its own, which would be
// drawn smeared over two pixels at a fractional offset.
const snap = (px: number) =>
  Math.round(px * devicePixelRatio) / devicePixelRatio

const dot = 8

// The crosshair, drawn as two small SVGs over the charts' scales and moved
// by `transform` on layers of their own, so a scrub repaints nothing. The
// line goes under the chart (its wrapper is `isolate`), where label halos
// mask it; the dot goes over.
export const Crosshair = memo(function Crosshair({
  model,
  cursor,
  width,
  lane,
  layer,
}: {
  model: ProfileModel
  cursor: Cursor
  width: number
  lane?: boolean
  layer: "line" | "dot"
}) {
  const ref = useRef<SVGSVGElement>(null)
  const height = lane ? laneHeight : model.chartHeight
  const top = lane ? 0 : plotTop
  const bottom = lane ? height : plotTop + model.plotHeight

  useLayoutEffect(
    () =>
      cursor.add((chosen) => {
        const svg = ref.current
        if (!svg) return
        const point =
          model.points[
            Math.min(chosen ?? model.deepest, model.points.length - 1)
          ]
        const x =
          model.left + (point.time / model.time.max) * (width - model.left)
        if (layer === "line") {
          // The 1 px line's left edge on a pixel boundary keeps it sharp.
          svg.style.transform = `translateX(${snap(x - 0.5)}px)`
          return
        }
        let y: number | null
        if (lane) {
          const range = model.temperature!
          const span = laneHeight - laneTop - laneBottom
          y =
            point.temperature == null
              ? null
              : laneTop +
                ((range.max - point.temperature) / (range.max - range.min)) *
                  span
        } else {
          y = plotTop + (point.depth / model.depth.max) * model.plotHeight
        }
        svg.style.visibility = y == null ? "hidden" : ""
        if (y != null)
          svg.style.transform = `translate(${snap(x - dot)}px, ${snap(y - dot)}px)`
      }),
    [cursor, model, width, lane, layer]
  )

  return layer === "line" ? (
    <svg
      ref={ref}
      aria-hidden
      width={1}
      height={bottom - top}
      className="pointer-events-none absolute left-0 -z-10 will-change-transform"
      style={{ top }}
    >
      <line
        x1={0.5}
        x2={0.5}
        y1={0}
        y2={bottom - top}
        className="stroke-foreground"
        strokeOpacity={0.5}
      />
    </svg>
  ) : (
    <svg
      ref={ref}
      aria-hidden
      width={dot * 2}
      height={dot * 2}
      viewBox={`${-dot} ${-dot} ${dot * 2} ${dot * 2}`}
      className="pointer-events-none absolute top-0 left-0 will-change-transform"
    >
      <circle
        r={lane ? 3.5 : 5}
        className={cn(
          "fill-card",
          lane ? "stroke-muted-foreground" : "stroke-primary"
        )}
        strokeWidth={lane ? 2 : 2.5}
      />
    </svg>
  )
})
