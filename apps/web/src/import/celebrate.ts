import { useEffect, useState, type RefObject } from "react"

import { fromDepth, play } from "@/dive/celebration"

// A finished import is a rare moment, so Done marks it as the new-dive save
// does: the badge settles in and seven bubbles rise off it. Only on arriving
// from the review's apply, so a reload or a later visit shows it plain.
let pending = false
export const celebrateImport = () => void (pending = true)

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches

export function useImportCelebration(badge: RefObject<HTMLElement | null>) {
  const [on] = useState(() => pending)
  useEffect(() => {
    pending = false
    if (!on || reducedMotion()) return
    let stop: (() => void) | undefined
    // Once the badge has mostly settled, measured where it then is.
    const timer = setTimeout(() => {
      const box = badge.current?.getBoundingClientRect()
      if (box && box.top > 0) stop = play(fromDepth(box))
    }, 150)
    return () => {
      clearTimeout(timer)
      stop?.()
    }
  }, [on, badge])
  return on
}
