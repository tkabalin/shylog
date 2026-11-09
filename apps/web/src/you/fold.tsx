import { useLayoutEffect, useRef, type ReactNode } from "react"
import { cn } from "cn"

// The room opens or closes over 250 ms while the content is invisible, and
// the content fades over 150 ms while its room is open, so it is never seen
// clipped. The room takes the drawer's curve: --ease-in-out moved a tall
// alert's room 61 px in one frame, which read as a lurch.
const room = "250ms var(--ease-drawer)"
const fade = "150ms var(--ease-out)"
export const foldMs = 400

// The flex gap under it (You's column is gap-6), closed with its room.
const youGap = "-1.5rem"

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

// Something that comes or goes in a column (You's alerts, a dive's offline
// note) unfolds into place and folds away, so the page never jumps under
// the thumb; reduced motion only fades. `appear` is false when drawn with
// the page; `gap` is the margin that cancels its room once closed.
export function Fold({
  open,
  appear,
  gap = youGap,
  className,
  children,
}: {
  open: boolean
  appear: boolean
  gap?: string
  className?: string
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el || !appear) return
    const height = el.scrollHeight
    Object.assign(el.style, {
      transition: "none",
      height: "0px",
      marginBottom: gap,
      opacity: "0",
    })
    void el.offsetHeight
    Object.assign(el.style, {
      transition: reduced()
        ? `opacity ${fade}`
        : `height ${room}, margin ${room}, opacity ${fade} 250ms`,
      height: `${height}px`,
      marginBottom: "",
      opacity: "",
    })
    // Back to its own height, so later text (an error line) can grow it.
    const settled = setTimeout(() => {
      Object.assign(el.style, { transition: "", height: "" })
    }, foldMs)
    return () => clearTimeout(settled)
  }, [appear, gap])

  useLayoutEffect(() => {
    const el = box.current
    if (!el || open) return
    Object.assign(el.style, {
      transition: "none",
      height: `${el.offsetHeight}px`,
    })
    void el.offsetHeight
    Object.assign(el.style, {
      // Reduced motion: the room closes at once when the fade ends, rather
      // than leaving a blank gap until the card unmounts.
      transition: reduced()
        ? `opacity ${fade}, height 0s 150ms, margin 0s 150ms`
        : `opacity ${fade}, height ${room} 150ms, margin ${room} 150ms`,
      height: "0px",
      marginBottom: gap,
      opacity: "0",
    })
  }, [open, gap])

  return (
    <div ref={box} inert={!open} className={cn("overflow-hidden", className)}>
      {children}
    </div>
  )
}
