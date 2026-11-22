import { useMemo, useRef, type PointerEvent } from "react"

// A chart's pointer handling for picking a point. A mouse picks as it moves;
// a touch picks on a tap, or scrubs once it drags sideways, so a vertical
// swipe still scrolls the page. `free`, full screen, scrubs any drag.
// `pick` should stay the same between renders, so the handlers do too.
export function useScrub(
  pick: (event: PointerEvent<HTMLDivElement>) => void,
  free = false
) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const scrubbing = useRef(false)
  return useMemo(
    () => ({
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (free || event.pointerType === "mouse") pick(event)
        else start.current = { x: event.clientX, y: event.clientY }
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const from = start.current
        // A few pixels of slop first, so a swipe's first sideways jitter
        // doesn't scrub before the page takes the scroll; once sideways, it
        // keeps scrubbing however the finger drifts.
        const sideways = from ? Math.abs(event.clientX - from.x) : 0
        if (from && sideways > 6 && sideways > Math.abs(event.clientY - from.y))
          scrubbing.current = true
        // A touch moves only while down, so full screen any move scrubs.
        if (event.pointerType === "mouse" || scrubbing.current || free)
          pick(event)
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        if (!free && event.pointerType !== "mouse" && start.current) pick(event)
        start.current = null
        scrubbing.current = false
      },
      onPointerCancel() {
        start.current = null
        scrubbing.current = false
      },
    }),
    [pick, free]
  )
}
