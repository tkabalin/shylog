import { useEffect, useState, type RefObject } from "react"

import type { Dive } from "@/data/db"

import { milestones } from "./milestones"

declare module "@tanstack/react-router" {
  interface HistoryState {
    // Set by the new dive form's Save, so the dive's page celebrates it.
    saved?: true
  }
}

// A bubble: its centre on screen, how far it climbs, and how.
interface Bubble {
  x: number
  y: number
  size: number
  rise: number
  duration: number
  delay: number
  sway: number
  fade: number
}

const random = (min: number, max: number) => min + Math.random() * (max - min)

// Any new dive: seven small bubbles off the max depth figure, surfacing at
// the top of the screen, as if breathed out at depth. 0.2 px/ms is a little
// slower than the burst, as small bubbles rise more slowly.
export function fromDepth(figure: DOMRect): Bubble[] {
  const y = figure.top + figure.height / 2
  let delay = 0
  return Array.from({ length: 7 }, (_, i) => {
    const rise = y * random(0.8, 1.05)
    const bubble = {
      x: figure.left + random(0, figure.width),
      y,
      size: random(6, 12),
      rise,
      duration: (rise / 0.2) * random(0.9, 1.1),
      delay,
      sway: random(3, 6) * (i % 2 ? 1 : -1),
      fade: 0.4,
    }
    delay += random(50, 80)
    return bubble
  })
}

// A milestone: twelve larger bubbles up from the bottom edge, one per
// twelfth of the page's column so they never clump.
export function fromBottom(column: DOMRect): Bubble[] {
  const count = 12
  const height = window.innerHeight
  const order = Array.from({ length: count }, (_, i) => i).sort(
    () => Math.random() - 0.5
  )
  let delay = 0
  return order.map((slot) => {
    const size = random(8, 22)
    const bubble = {
      x: column.left + ((slot + random(0.15, 0.85)) / count) * column.width,
      y: height + size / 2,
      size,
      rise: height * random(0.5, 0.7) + size,
      duration: random(1600, 2200),
      delay,
      sway: random(4, 8) * (Math.random() < 0.5 ? -1 : 1),
      fade: 0.3,
    }
    delay += random(40, 80)
    return bubble
  })
}

function float(layer: HTMLElement, bubble: Bubble) {
  const { x, y, size, rise, duration, delay, sway, fade } = bubble
  // The climb and the sway sit on two elements, so each animates a plain
  // transform, which every browser runs off the main thread: they play
  // while the save's upload and sync are busy on it.
  const climber = document.createElement("span")
  climber.className = "absolute opacity-0"
  Object.assign(climber.style, {
    left: `${x - size / 2}px`,
    top: `${y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
  })
  // An outlined bubble with a glint, clear in both themes.
  const element = document.createElement("span")
  element.className =
    "block size-full rounded-full border border-primary/70 bg-primary/7 bg-[radial-gradient(circle_at_32%_28%,color-mix(in_oklab,var(--background)_85%,transparent)_0_14%,transparent_16%)]"
  climber.append(element)
  layer.append(climber)
  const timing = { duration, delay, fill: "backwards" } as const
  // The plain ease-in-out swings like a pendulum; the app's strong curve
  // would make each sway stop and lurch.
  const swing = "ease-in-out"
  return [
    // A steady climb, as at a bubble's terminal speed, fading at the end.
    climber.animate(
      [
        { transform: "translateY(0)", opacity: 0 },
        { opacity: 1, offset: 0.1 },
        { opacity: 1, offset: 1 - fade },
        { transform: `translateY(${-rise}px)`, opacity: 0 },
      ],
      { ...timing, easing: "linear" }
    ),
    // Swaying either side, and growing as the pressure drops.
    element.animate(
      [
        { transform: "translateX(0) scale(0.6)", easing: swing },
        { transform: `translateX(${sway}px) scale(0.77)`, easing: swing },
        { transform: `translateX(${-sway}px) scale(0.95)`, easing: swing },
        { transform: "translateX(0) scale(1.15)" },
      ],
      timing
    ),
  ]
}

// Plays the bubbles over the whole app, where they never take a tap, and
// clears them once they've surfaced. The returned stop clears them at once,
// so they don't follow the diver to another screen.
export function play(bubbles: Bubble[]) {
  const layer = document.createElement("div")
  layer.setAttribute("aria-hidden", "true")
  layer.className = "pointer-events-none fixed inset-0 z-40 overflow-hidden"
  document.body.append(layer)
  const animations = bubbles.flatMap((bubble) => float(layer, bubble))
  Promise.all(animations.map((animation) => animation.finished)).then(
    () => layer.remove(),
    // Cancelled by stop, which has removed it.
    () => {}
  )
  return () => {
    for (const animation of animations) animation.cancel()
    layer.remove()
  }
}

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches

// Once per save: the dive opened again, or returned to from its form, is
// plain. Bubbles come off the max depth figure as the page appears, so the
// save answers at once even offline; a milestone's burst follows once the
// server has numbered the dive.
const celebrated = new Set<string>()

// Headline is the page's headline figures, max depth first.
export function useSaveCelebration(
  dive: Dive,
  saved: boolean,
  headline: RefObject<HTMLElement | null>
) {
  const [on] = useState(() => saved && !celebrated.has(dive.id))

  useEffect(() => {
    if (!on) return
    celebrated.add(dive.id)
    if (reducedMotion()) return
    let stop: (() => void) | undefined
    // Measured a frame on, once the router has scrolled the page back to
    // its top; the form left it scrolled, which put the figure above it.
    const frame = requestAnimationFrame(() => {
      const figure = headline.current
        ?.querySelector("dd")
        ?.getBoundingClientRect()
      if (figure && figure.top > 0) {
        stop = play(fromDepth(figure))
      }
    })
    return () => {
      cancelAnimationFrame(frame)
      stop?.()
    }
  }, [on, dive.id, headline])

  const milestone =
    on && dive.number != null && milestones.includes(dive.number)
  useEffect(() => {
    if (!milestone || !headline.current || reducedMotion()) return
    return play(fromBottom(headline.current.getBoundingClientRect()))
  }, [milestone, headline])
}
