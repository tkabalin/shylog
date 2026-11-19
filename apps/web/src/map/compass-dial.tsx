import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react"
import { cn } from "cn"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Haptic } from "@/lib/haptic"

import { compassOptions } from "./filters"
import { compass, type Compass } from "./tag-values"
import { around } from "./tags"

// Where things sit, in hundredths of the dial's width: the points round the
// edge, the track the needle's knob rides, and the hub that clears it.
const labelRadius = 37.5
const trackRadius = 27
const hubRadius = 12.5

// The wedge over a point and its neighbours, pointing north, a little past
// each neighbour's dot so the three sit inside it.
const spreadEdge = (degrees: number) => {
  const turn = (degrees * Math.PI) / 180
  const r = trackRadius + 6
  return `${50 + r * Math.sin(turn)} ${50 - r * Math.cos(turn)}`
}
const wedge = `M50 50 L${spreadEdge(-56)} A${trackRadius + 6} ${trackRadius + 6} 0 0 1 ${spreadEdge(56)} Z`

const short = (point: Compass) => point.toUpperCase()

// The pointer's angle round the dial's centre, clockwise from north, or
// none in the hub or outside the dial's circle.
function angleAt(event: PointerEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - box.left - box.width / 2
  const y = event.clientY - box.top - box.height / 2
  const from = Math.hypot(x, y)
  if (from < (box.width * hubRadius) / 100 || from > box.width / 2) {
    return undefined
  }
  return (Math.atan2(x, -y) * 180) / Math.PI
}

const pointAt = (degrees: number) => compass[(Math.round(degrees / 45) + 8) % 8]

// The turn nearest `from` that points the same way as `to`, so the needle
// goes the short way round: north-west to north is 45°, not 315° back.
const nearest = (from: number, to: number) =>
  from + ((((to - from) % 360) + 540) % 360) - 180

// One direction picked on a compass: drag the needle round from the centre,
// or tap a point, and tap the hub to clear it. North at the top. A spread
// dial matches the points either side too, and shows them in a wedge.
export function CompassDial({
  name,
  any,
  icon,
  spread = false,
  value,
  onChange,
}: {
  name: string
  any: string
  icon: ReactNode
  spread?: boolean
  value: Compass | undefined
  onChange: (value: Compass | undefined) => void
}) {
  const range = spread && value ? around(value) : []
  const [angle, setAngle] = useState(value ? compass.indexOf(value) * 45 : 0)
  const [dragging, setDragging] = useState(false)
  // How the needle reaches a new angle: a tap's slide, the short settle
  // after a drag, or a jump where it first appears.
  const [motion, setMotion] = useState<"tap" | "settle" | "jump">("tap")
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    // A drag places the needle itself.
    if (value && !dragging) {
      setAngle(nearest(angle, compass.indexOf(value) * 45))
      setMotion(shown ? "tap" : "jump")
    }
  }
  // Set from nothing, it appears where it points, then slides again.
  useEffect(() => {
    if (motion !== "jump") return
    const frame = requestAnimationFrame(() => setMotion("tap"))
    return () => cancelAnimationFrame(frame)
  }, [motion])

  // A press on a point becomes a drag only once it has moved, so a tap
  // stays the point's own click and keeps its haptic tick. Anywhere else
  // in the circle the needle follows the finger from the first touch. Refs,
  // as a release can come before the drag's render.
  const press = useRef<{ id: number; x: number; y: number }>(null)
  const drag = useRef(false)
  const last = useRef(value)
  // A drag's click is swallowed: WebKit can send it to the point it began on.
  const dragged = useRef(false)
  const follow = (event: PointerEvent<HTMLElement>) => {
    const degrees = angleAt(event)
    if (degrees === undefined) return
    setAngle((from) => nearest(from, degrees))
    const point = pointAt(degrees)
    if (point === last.current) return
    last.current = point
    onChange(point)
    // Safari ticks only for a real tap, so a drag ticks on Android alone.
    navigator.vibrate?.(10)
  }
  const grab = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = dragged.current = true
    last.current = value
    setDragging(true)
    follow(event)
  }
  // Let go, the needle settles on the point it's nearest.
  const release = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerId !== press.current?.id) return
    press.current = null
    if (!drag.current) return
    drag.current = false
    setDragging(false)
    setMotion("settle")
    setAngle((from) => nearest(from, Math.round(from / 45) * 45))
  }

  return (
    <div className="flex w-full flex-col items-center">
      <div
        // The sheet mustn't take a drag on the dial as a swipe or a scroll.
        data-base-ui-swipe-ignore
        onPointerDown={(event) => {
          // A second finger would make the needle jump between them.
          if (event.button !== 0 || drag.current) return
          if (press.current && press.current.id !== event.pointerId) return
          const target = event.target as Element
          if (target.closest("[data-hub]")) return
          dragged.current = false
          press.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          }
          if (target.closest("button")) return
          if (angleAt(event) === undefined) press.current = null
          else grab(event)
        }}
        onPointerMove={(event) => {
          const start = press.current
          if (event.pointerId !== start?.id) return
          if (drag.current) return follow(event)
          const moved = Math.hypot(
            event.clientX - start.x,
            event.clientY - start.y
          )
          if (moved >= 6) grab(event)
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onClickCapture={(event) => {
          if (!dragged.current) return
          dragged.current = false
          event.stopPropagation()
          event.preventDefault()
        }}
        // Sized for a finger on a phone and for a mouse from desk: up. Round,
        // so a touch on its corners scrolls the sheet.
        className="relative aspect-square w-full max-w-44 touch-none rounded-full select-none desk:max-w-36"
      >
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full overflow-visible"
        >
          <circle
            cx="50"
            cy="50"
            r={trackRadius}
            fill="none"
            vectorEffect="non-scaling-stroke"
            className="stroke-border"
            strokeWidth={1.5}
          />
          {compass.map((point, i) => (
            <circle
              key={point}
              cx={50 + trackRadius * Math.sin((i * Math.PI) / 4)}
              cy={50 - trackRadius * Math.cos((i * Math.PI) / 4)}
              r="1.25"
              className="fill-muted-foreground/40"
            />
          ))}
          <g
            style={{ rotate: `${angle}deg`, transformOrigin: "50px 50px" }}
            className={cn(
              !dragging &&
                {
                  tap: "transition-[rotate] duration-300 ease-drawer",
                  settle: "transition-[rotate] duration-150 ease-out",
                  jump: undefined,
                }[motion],
              "motion-reduce:transition-none"
            )}
          >
            <g
              style={{ transformOrigin: "50px 50px" }}
              className={cn(
                "transition-[opacity,scale] duration-150 ease-out",
                value
                  ? "opacity-100"
                  : "scale-90 opacity-0 motion-reduce:scale-100"
              )}
            >
              {spread && <path d={wedge} className="fill-primary/10" />}
              <line
                x1="50"
                y1={50 - hubRadius}
                x2="50"
                y2={50 - trackRadius}
                vectorEffect="non-scaling-stroke"
                strokeWidth={2}
                strokeLinecap="round"
                className="stroke-primary"
              />
              <circle
                cx="50"
                cy={50 - trackRadius}
                r="4"
                className="fill-primary"
              />
            </g>
          </g>
        </svg>
        <ToggleGroup
          aria-label={name}
          value={value ? [value] : []}
          onValueChange={(next) => onChange(next[0] as Compass | undefined)}
          // A second finger mid-drag mustn't tap a point.
          className={cn(
            "absolute inset-0 block size-full",
            dragging && "pointer-events-none"
          )}
        >
          {compassOptions.map(({ value: point, label }) => {
            const turn = (compass.indexOf(point) * Math.PI) / 4
            return (
              <ToggleGroupItem
                key={point}
                value={point}
                aria-label={label}
                style={{
                  left: `${50 + labelRadius * Math.sin(turn)}%`,
                  top: `${50 - labelRadius * Math.cos(turn)}%`,
                }}
                className={cn(
                  "absolute size-11 min-w-0 -translate-1/2 cursor-pointer rounded-full p-0 text-sm text-muted-foreground uppercase hover:bg-transparent hover:text-foreground aria-pressed:bg-transparent aria-pressed:font-semibold aria-pressed:text-primary data-[state=on]:bg-transparent desk:size-1/4 desk:text-xs",
                  range.includes(point) &&
                    "text-primary/85 dark:text-primary/70"
                )}
              >
                {point}
                <Haptic />
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
        <button
          type="button"
          data-hub
          aria-label={any}
          onClick={() => onChange(undefined)}
          className="absolute top-1/2 left-1/2 flex size-1/4 -translate-1/2 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground transition-[scale,opacity] duration-150 ease-out outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 active:opacity-50 active:duration-0 [&_svg]:size-1/2"
        >
          {icon}
          <Haptic />
        </button>
      </div>
      <p
        className={cn(
          "text-sm",
          value ? "font-medium text-foreground" : "text-muted-foreground"
        )}
      >
        {value
          ? compassOptions.find((option) => option.value === value)!.label +
            (spread ? `, ${short(range[0]!)} to ${short(range[2]!)}` : "")
          : "Any"}
      </p>
    </div>
  )
}
