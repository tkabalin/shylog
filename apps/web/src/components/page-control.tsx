import { useRef, type PointerEvent } from "react"
import { cn } from "cn"

// iOS's page control: the strip is one target, as its 15 px dots are too
// close to tap apart. A tap left or right of the shown dot turns one page
// that way, and sliding along the strip scrubs through them.
export function PageControl({
  count,
  shown,
  onPage,
  label,
  itemLabel,
}: {
  count: number
  shown: number
  onPage: (page: number) => void
  label: string
  itemLabel: (i: number) => string
}) {
  const dots = useRef<HTMLDivElement>(null)
  // Where the finger went down, until it has slid far enough to scrub.
  const press = useRef<{ x: number; scrubbing: boolean } | null>(null)
  // The click a pointer's release sends a dot, which the strip has already
  // answered; a click with none before it is the keys or a screen reader.
  const answered = useRef(false)
  const dotAt = (x: number) => {
    const box = dots.current!.getBoundingClientRect()
    const i = Math.floor(((x - box.left) / box.width) * count)
    return Math.max(0, Math.min(count - 1, i))
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { x: event.clientX, scrubbing: false }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const down = press.current
    if (!down) return
    if (!down.scrubbing && Math.abs(event.clientX - down.x) < 8) return
    down.scrubbing = true
    const i = dotAt(event.clientX)
    if (i !== shown) onPage(i)
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const down = press.current
    press.current = null
    if (!down) return
    answered.current = true
    // Not every release clicks a dot, so the next key press isn't eaten.
    setTimeout(() => (answered.current = false))
    if (down.scrubbing) return
    const box = dots.current!.getBoundingClientRect()
    const centre = box.left + ((shown + 0.5) / count) * box.width
    const next = event.clientX < centre ? shown - 1 : shown + 1
    if (next >= 0 && next < count) onPage(next)
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (press.current = null)}
      // Drawn where the board has the dots, and held by the strip alone so
      // a slide along it never scrolls or zooms.
      className="-mb-1.5 flex h-11 shrink-0 touch-none justify-center select-none"
    >
      <div ref={dots} className="flex">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === shown}
            aria-label={itemLabel(i)}
            tabIndex={i === shown ? 0 : -1}
            onClick={() => !answered.current && onPage(i)}
            className="inline-flex h-11 w-3.75 items-center justify-center"
          >
            <span
              className={cn(
                "size-1.75 rounded-full transition-colors duration-200 ease-out",
                i === shown ? "bg-neutral-50" : "bg-white/30"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
