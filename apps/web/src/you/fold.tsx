import { useLayoutEffect, useRef, type ReactNode } from "react"

// The room opens or closes over 250 ms while the content is invisible, and
// the content fades over 150 ms while its room is open, so it is never seen
// clipped. The room takes the drawer's curve: --ease-in-out moved a tall
// alert's room 61 px in one frame, which read as a lurch.
const room = "250ms var(--ease-drawer)"
const fade = "150ms var(--ease-out)"
export const foldMs = 400

// The flex gap under it (You's column is gap-6), closed with its room.
const gap = "-1.5rem"

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

// A card that comes or goes at the top of You, such as an alert: it
// unfolds into place and folds away rather than the page jumping by its
// height under the thumb. With reduced motion only the fade is animated.
// `appear` is false for a card drawn with the page, which stays still.
export function Fold({
  open,
  appear,
  children,
}: {
  open: boolean
  appear: boolean
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
  }, [appear])

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
  }, [open])

  return (
    <div ref={box} inert={!open} className="overflow-hidden">
      {children}
    </div>
  )
}
