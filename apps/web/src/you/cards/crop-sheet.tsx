import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
  type SyntheticEvent,
} from "react"
import { cardAspect, cardCropMaxScale, type CardCrop } from "@shylog/core"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from "motion/react"
import { IconZoomIn, IconZoomOut } from "@tabler/icons-react"
import { cn } from "cn"

import { useSize } from "@/chart/size"
import {
  BarButton,
  FullSheetContent,
  SheetBar,
} from "@/components/pickers/sheet"
import { Drawer } from "@/components/ui/drawer"
import { Slider } from "@/components/ui/slider"
import { useDesk } from "@/hooks/use-desk"
import { coverOf, PageImage, type PageSource } from "@/you/cards/card-thumb"
import {
  bandScale,
  inertia,
  rubberband,
  settle,
  unband,
  unbandScale,
} from "@/you/cards/gestures"

// Room round the frame, so the page beyond it shows what can be panned to.
const inset = 24
// The page's zoom and its pan from the frame's centre, in pixels.
type Place = { scale: number; x: number; y: number }
const clamp = (value: number, limit: number) =>
  Math.min(limit, Math.max(-limit, value))
// A crop at the page's centre and a zoom of 1 is no crop.
const centred = (crop: CardCrop) =>
  crop.scale === 1 &&
  Math.abs(crop.x - 0.5) < 1e-3 &&
  Math.abs(crop.y - 0.5) < 1e-3

type Point = { x: number; y: number }
type Gesture =
  // After a pinch, when and where its fingers were, so a lift straight
  // after settles under them rather than as a flick.
  | {
      kind: "pan"
      from: Point
      pan: Point
      afterPinch?: { mid: Point; time: number }
    }
  // As the viewer's pinch: the scale and pan at its start before banding,
  // and where the fingers and the unbanded pan were last.
  | {
      kind: "pinch"
      distance: number
      mid: Point
      scale: number
      shown: number
      pan: Point
      last: { mid: Point; pan: Point }
    }

// The thumbnail's crop: the first page under a card-shaped frame, dragged
// and pinched as the viewer's page is (from desk: up, dragged with a zoom
// slider). Done hands back the crop, or null for the page's centre.
export function CropSheet({
  open,
  onOpenChange,
  source,
  crop,
  onDone,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: PageSource
  crop: CardCrop | null
  onDone: (crop: CardCrop | null) => void
  // Where it centres from desk: up, as the sheet it opened from does.
  className?: string
}) {
  const readRef = useRef<() => CardCrop | null>(() => crop)
  return (
    // A tap above the sheet would throw the crop away, so only Cancel, a
    // swipe down or Escape close it, as the card sheet holds.
    <Drawer
      showSwipeHandle
      open={open}
      onOpenChange={onOpenChange}
      disablePointerDismissal
    >
      {/* Dark in both themes, as Photos' crop and the viewer it often opens
          over: light bars round the black stage read as a letterboxed video. */}
      <FullSheetContent
        className={cn(
          "dark [--drawer-bleed-background:var(--popover)]",
          className
        )}
      >
        <SheetBar
          title="Thumbnail"
          start={
            <BarButton onClick={() => onOpenChange(false)}>Cancel</BarButton>
          }
          end={
            <BarButton
              strong
              onClick={() => {
                onDone(readRef.current())
                onOpenChange(false)
              }}
            >
              Done
            </BarButton>
          }
        />
        <CropStage source={source} crop={crop} readRef={readRef} />
      </FullSheetContent>
    </Drawer>
  )
}

function CropStage({
  source,
  crop,
  readRef,
}: {
  source: PageSource
  crop: CardCrop | null
  readRef: RefObject<() => CardCrop | null>
}) {
  const desk = useDesk()
  const reduce = useReducedMotion()
  const spring = reduce ? { duration: 0 } : settle
  const stage = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(stage)
  // A crop knows its page's shape; a page never cropped is measured as it
  // loads.
  const [aspect, setAspect] = useState(crop?.aspect)
  // Until the page itself shows, its loading or Try again sits unmoved and
  // takes taps, rather than zoomed with the crop and caught by a pan.
  const [loaded, setLoaded] = useState(false)

  // The frame as large as the stage allows, and the page at a zoom of 1
  // just covering it.
  const frameW = Math.max(
    0,
    Math.min(width - inset * 2, (height - inset * 2) * cardAspect)
  )
  const frameH = frameW / cardAspect
  const cover = aspect ? coverOf(aspect) : { width: 1, height: 1 }
  const baseW = frameW * cover.width
  const baseH = frameH * cover.height

  const scale = useMotionValue(crop?.scale ?? 1)
  const panX = useMotionValue(0)
  const panY = useMotionValue(0)
  // Whether the page sits where Reset puts it, so Reset is off with nothing
  // to undo; set as a gesture, zoom or Reset settles, never each frame.
  const [atRest, setAtRest] = useState(!crop || centred(crop))
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)

  // The page gets its own layer while a finger or a settle moves it, as
  // the viewer's does, so the stage isn't repainted each frame, and none at
  // rest, so a zoomed page is drawn sharp. Checked a frame after each move.
  const page = useRef<HTMLDivElement>(null)
  const layer = useRef(() => {})
  useEffect(() => {
    let queued = 0
    const check = () => {
      queued = 0
      const moving =
        !!gesture.current || [scale, panX, panY].some((v) => v.isAnimating())
      if (page.current)
        page.current.style.willChange = moving ? "transform" : ""
    }
    layer.current = () => {
      queued ||= requestAnimationFrame(check)
    }
    const stops = [scale, panX, panY].flatMap((value) => [
      value.on("change", layer.current),
      value.on("animationComplete", layer.current),
    ])
    return () => {
      cancelAnimationFrame(queued)
      stops.forEach((stop) => stop())
    }
  }, [scale, panX, panY])

  // How far the page can pan at a scale before its edge comes into the
  // frame.
  const bounds = (at: number) => ({
    x: Math.max(0, (baseW * at - frameW) / 2),
    y: Math.max(0, (baseH * at - frameH) / 2),
  })

  // Where a settle or Reset will leave the page, while one runs, so a Done
  // or a resize mid-flight takes where it comes to rest.
  const rest = useRef<Place | null>(null)
  const place = (): Place =>
    rest.current ?? { scale: scale.get(), x: panX.get(), y: panY.get() }

  // The crop a place makes, and back, so a resize keeps what is framed.
  // Clamped where the frame stays covered, as thumbBox draws it.
  const toCrop = (w = baseW, h = baseH, at = place()): CardCrop => {
    const s = Math.min(cardCropMaxScale, Math.max(1, at.scale))
    const round = (value: number) => Math.round(value * 1e4) / 1e4
    const inside = (value: number, size: number) => {
      const half = Math.min(0.5, 0.5 / (size * s))
      return round(Math.min(1 - half, Math.max(half, value)))
    }
    return {
      x: inside(0.5 - at.x / (w * at.scale), cover.width),
      y: inside(0.5 - at.y / (h * at.scale), cover.height),
      scale: round(s),
      aspect: aspect!,
    }
  }
  const sized = useRef<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    if (!baseW || !aspect) return
    const was = sized.current
    const now = was
      ? toCrop(was.w, was.h)
      : (crop ?? { x: 0.5, y: 0.5, scale: 1 })
    sized.current = { w: baseW, h: baseH }
    // A gesture under way when the stage resized starts again.
    gesture.current = null
    pointers.current.clear()
    rest.current = null
    for (const value of [scale, panX, panY]) value.stop()
    const edge = bounds(now.scale)
    scale.jump(now.scale)
    panX.jump(clamp((0.5 - now.x) * baseW * now.scale, edge.x))
    panY.jump(clamp((0.5 - now.y) * baseH * now.scale, edge.y))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once a size is in
  }, [baseW, baseH, aspect])

  // Done reads where the page comes to rest: at its centre and a zoom of 1
  // it is no crop.
  useEffect(() => {
    readRef.current = () => {
      // Nothing can move the page until it has loaded.
      if (!loaded || !sized.current) return crop
      const made = toCrop()
      return centred(made) ? null : made
    }
  })

  const rect = useRef<DOMRect | null>(null)
  // Relative to the frame's centre, which is the stage's.
  const at = (event: { clientX: number; clientY: number }): Point => {
    const box = (rect.current ??= stage.current!.getBoundingClientRect())
    return {
      x: event.clientX - box.left - box.width / 2,
      y: event.clientY - box.top - box.height / 2,
    }
  }

  const bandPan = (pan: Point, s: number) => {
    const edge = bounds(s)
    return {
      x: rubberband(pan.x, -edge.x, edge.x, frameW),
      y: rubberband(pan.y, -edge.y, edge.y, frameH),
    }
  }
  const unbandPan = () => {
    const edge = bounds(scale.get())
    return {
      x: unband(panX.get(), -edge.x, edge.x, frameW),
      y: unband(panY.get(), -edge.y, edge.y, frameH),
    }
  }
  const stopAll = () => {
    rest.current = null
    for (const value of [scale, panX, panY]) value.stop()
  }

  // Zoomed about a point (the frame's centre for the slider, the pointer
  // for a trackpad's pinch), held inside the limits at once.
  const zoomTo = (to: number, about: Point = { x: 0, y: 0 }) => {
    const now = scale.get()
    const next = Math.min(cardCropMaxScale, Math.max(1, to))
    const ratio = next / now
    const edge = bounds(next)
    const x = clamp(about.x - (about.x - panX.get()) * ratio, edge.x)
    const y = clamp(about.y - (about.y - panY.get()) * ratio, edge.y)
    scale.set(next)
    panX.set(x)
    panY.set(y)
    setAtRest(centred(toCrop(baseW, baseH, { scale: next, x, y })))
  }

  // The wheel zooms, as in every web cropper, since the stage has nothing
  // to scroll. A trackpad's pinch comes as Ctrl and the wheel in small steps,
  // a mouse's notch as about 100 px, slowed to a quarter. Not passive, to
  // keep the browser's own zoom out of it.
  const wheel = useRef<(event: WheelEvent) => void>(null)
  useEffect(() => {
    wheel.current = (event) => {
      if (gesture.current) return
      event.preventDefault()
      if (!loaded) return
      stopAll()
      const speed = event.ctrlKey ? 100 : 400
      zoomTo(scale.get() * Math.exp(-event.deltaY / speed), at(event))
    }
  })
  useEffect(() => {
    const element = stage.current!
    const listener = (event: WheelEvent) => {
      rect.current = null
      wheel.current?.(event)
    }
    element.addEventListener("wheel", listener, { passive: false })
    return () => element.removeEventListener("wheel", listener)
  }, [])

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()] as [Point, Point]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const pan = unbandPan()
    gesture.current = {
      kind: "pinch",
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid,
      scale: unbandScale(scale.get(), cardCropMaxScale),
      shown: scale.get(),
      pan,
      last: { mid, pan },
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !sized.current || !loaded) return
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!pointers.current.size) rect.current = null
    pointers.current.set(event.pointerId, at(event))
    stopAll()
    if (pointers.current.size === 1)
      gesture.current = { kind: "pan", from: at(event), pan: unbandPan() }
    else if (pointers.current.size === 2) startPinch()
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const point = at(event)
    pointers.current.set(event.pointerId, point)
    const now = gesture.current
    if (!now) return
    if (now.kind === "pinch") {
      if (pointers.current.size < 2) return
      const [a, b] = [...pointers.current.values()] as [Point, Point]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const next = bandScale(
        (now.scale * distance) / Math.max(now.distance, 1),
        cardCropMaxScale
      )
      // The point of the page between the fingers stays between them.
      const ratio = next / now.shown
      const pan = {
        x: mid.x - (now.mid.x - now.pan.x) * ratio,
        y: mid.y - (now.mid.y - now.pan.y) * ratio,
      }
      now.last = { mid, pan }
      const shown = bandPan(pan, next)
      scale.set(next)
      panX.set(shown.x)
      panY.set(shown.y)
      return
    }
    const shown = bandPan(
      {
        x: now.pan.x + point.x - now.from.x,
        y: now.pan.y + point.y - now.from.y,
      },
      scale.get()
    )
    panX.set(shown.x)
    panY.set(shown.y)
  }

  // Back inside the limits, about the point the fingers left, carrying on
  // at the finger's speed when there's room, as the viewer settles.
  const settleZoom = (momentum: boolean, about: Point = { x: 0, y: 0 }) => {
    const now = scale.get()
    const to = Math.min(cardCropMaxScale, Math.max(1, now))
    const ratio = to / now
    const edge = bounds(to)
    if (to !== now) animate(scale, to, spring)
    const axes: [MotionValue<number>, number, number][] = [
      [panX, edge.x, about.x],
      [panY, edge.y, about.y],
    ]
    const [x, y] = axes.map(([value, limit, middle]) => {
      const scaled = middle - (middle - value.get()) * ratio
      const inside = clamp(scaled, limit)
      // Not while the zoom settles too: the inertia would start from the
      // unscaled pan, and Done would take a rest it never reaches.
      if (momentum && to === now && inside === scaled && !reduce) {
        const velocity = value.getVelocity()
        // Where Motion's inertia aims, stopped at the edge it bounces off.
        // Given as the target: Motion skips an inertia whose only keyframe
        // is where the value already is, so the page would stop dead.
        const end = clamp(scaled + inertia.power * velocity, limit)
        animate(value, end, {
          ...inertia,
          velocity,
          min: -limit,
          max: limit,
        })
        return end
      }
      if (inside !== value.get()) animate(value, inside, spring)
      return inside
    })
    rest.current = { scale: to, x: x!, y: y! }
    setAtRest(centred(toCrop(baseW, baseH, rest.current)))
  }

  // A finger lifted, or taken by the system (a call, the home bar).
  const release = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointers.current.delete(event.pointerId)) return
    const now = gesture.current
    if (!now) return
    if (now.kind === "pinch") {
      if (pointers.current.size >= 2) return startPinch()
      const left = [...pointers.current.values()][0]
      // One finger left pans on from where the page is.
      if (left) {
        gesture.current = {
          kind: "pan",
          from: left,
          pan: now.last.pan,
          afterPinch: { mid: now.last.mid, time: event.timeStamp },
        }
        return
      }
      gesture.current = null
      return settleZoom(false, now.last.mid)
    }
    if (pointers.current.size) return
    gesture.current = null
    // The second finger of a pinch, lifted at once or without moving on:
    // the pinch's end, settled under the fingers, not flung with the speed
    // the zoom gave the pan.
    const lifted = at(event)
    if (
      now.afterPinch &&
      (event.timeStamp - now.afterPinch.time < 100 ||
        Math.hypot(lifted.x - now.from.x, lifted.y - now.from.y) < 10)
    )
      return settleZoom(false, now.afterPinch.mid)
    settleZoom(!cancelled)
  }

  const reset = () => {
    // A finger still on the page has it; the two would fight.
    if (gesture.current) return
    stopAll()
    rest.current = { scale: 1, x: 0, y: 0 }
    setAtRest(true)
    animate(scale, 1, spring)
    animate(panX, 0, spring)
    animate(panY, 0, spring)
  }

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = event.currentTarget
    if (w && h) setAspect(w / h)
    setLoaded(true)
  }

  // The frame's corners scale with it, as the tiles' 7 px do on theirs.
  const radius = frameW * 0.064

  return (
    <>
      <div
        ref={stage}
        // A drag here pans the page, never pulls the sheet down.
        data-base-ui-swipe-ignore=""
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          release(event, false)
          layer.current()
        }}
        onPointerCancel={(event) => {
          release(event, true)
          layer.current()
        }}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden bg-black select-none [-webkit-touch-callout:none] active:cursor-grabbing"
      >
        <motion.div
          ref={page}
          className="absolute flex items-center justify-center"
          style={{
            width: baseW,
            height: baseH,
            left: (width - baseW) / 2,
            top: (height - baseH) / 2,
            x: loaded ? panX : 0,
            y: loaded ? panY : 0,
            scale: loaded ? scale : 1,
            visibility: frameW ? undefined : "hidden",
          }}
        >
          {/* A card's page says it's loading or couldn't be had, with Try
              again, as the viewer does; the page itself shows once its
              shape is known. */}
          <PageImage
            source={source}
            retry
            onLoad={onLoad}
            style={aspect ? undefined : { visibility: "hidden" }}
            className="block size-full max-w-none"
          />
        </motion.div>
        {/* The page outside the frame dimmed, as a photo editor's crop. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 shadow-[0_0_0_100vmax_rgb(0_0_0/0.6)] ring-2 ring-white"
          style={{ width: frameW, height: frameH, borderRadius: radius }}
        />
      </div>
      <div className="flex shrink-0 items-center justify-center gap-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] desk:justify-between desk:pb-1">
        {/* Off until the page has loaded, as there's nothing to move, and
            Reset while there's nothing to undo. */}
        {desk && (
          <ZoomSlider
            scale={scale}
            disabled={!loaded}
            onZoom={(to) => {
              stopAll()
              zoomTo(to)
            }}
          />
        )}
        <button
          type="button"
          onClick={reset}
          disabled={!loaded || atRest}
          // The bar's 16 px on a phone, and the dialog footer's 14 from desk:
          // up, beside its Cancel and Done.
          className="inline-flex h-11 items-center px-4 text-base font-medium text-primary transition-[opacity,color] duration-150 hover:opacity-70 active:opacity-50 active:duration-0 disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-60 desk:h-9 desk:text-sm"
        >
          Reset
        </button>
      </div>
    </>
  )
}

// The zoom from desk: up, following a pinch or Reset as the slider moves the
// page. Its own component, so only it renders as the zoom changes, and not
// at all on a phone.
function ZoomSlider({
  scale,
  disabled,
  onZoom,
}: {
  scale: MotionValue<number>
  disabled: boolean
  onZoom: (to: number) => void
}) {
  const [shown, setShown] = useState(() => scale.get())
  useEffect(() => scale.on("change", setShown), [scale])
  // The icons say which way zooms in, as the bar has no label of its own.
  const icon = cn(
    "size-4 shrink-0 text-muted-foreground",
    disabled && "opacity-50"
  )
  return (
    <div className="flex flex-1 items-center gap-2">
      <IconZoomOut aria-hidden className={icon} />
      <Slider
        // As a list, or the shared slider draws a range's two thumbs.
        value={[shown]}
        min={1}
        max={cardCropMaxScale}
        step={0.01}
        onValueChange={(value) =>
          onZoom(Array.isArray(value) ? value[0]! : value)
        }
        getAriaLabel={() => "Zoom"}
        disabled={disabled}
        className="flex-1"
      />
      <IconZoomIn aria-hidden className={icon} />
    </div>
  )
}
