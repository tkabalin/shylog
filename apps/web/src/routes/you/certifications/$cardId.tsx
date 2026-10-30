import { useEffect, useRef, useState, type PointerEvent } from "react"
import { createPortal } from "react-dom"
import { IconX } from "@tabler/icons-react"
import { createFileRoute, Link, Navigate } from "@tanstack/react-router"
import { cn } from "cn"

import type { Card } from "@/data/db"
import { useLog } from "@/data/log"
import { useFullScreen } from "@/hooks/use-full-screen"
import { useBack } from "@/you/bar"
import { CardPages } from "@/you/cards/card-pages"

// CertsHifi's viewer: a card full screen over the list, which stays as it
// was underneath. Pushed from the list (see Navigation history).
export const Route = createFileRoute("/you/certifications/$cardId")({
  component: ViewerPage,
})

function ViewerPage() {
  const { cardId } = Route.useParams()
  const { log } = useLog()
  if (!log) return null
  const card = log.cards.find((one) => one.id === cardId)
  // Deleted here or on another phone: the list takes its place.
  if (!card) return <Navigate to="/you/certifications" replace />
  return <Viewer card={card} />
}

// Where the browser can keep the screen on, as a dive centre reads the card.
const canStayOn = typeof navigator !== "undefined" && "wakeLock" in navigator

function Viewer({ card }: { card: Card }) {
  const goBack = useBack()
  const [page, setPage] = useState(0)
  // A page removed in Edit can leave the one shown past the end.
  const shown = Math.min(page, card.images.length - 1)
  const many = card.images.length > 1

  useFullScreen()

  // The screen stays on while the card is shown, where the phone allows it.
  // The lock goes when the app is hidden, so it is taken again when it
  // comes back.
  useEffect(() => {
    if (!canStayOn) return
    let lock: WakeLockSentinel | undefined
    let asking = false
    let closed = false
    // One lock at a time: a quick hide and show while one is asked for
    // would take a second the cleanup never lets go.
    const take = () => {
      if (document.visibilityState !== "visible" || asking) return
      if (lock && !lock.released) return
      asking = true
      navigator.wakeLock
        .request("screen")
        .then((taken) => {
          if (closed) return void taken.release()
          lock = taken
        })
        // A phone saving power can refuse.
        .catch(() => {})
        .finally(() => (asking = false))
    }
    take()
    document.addEventListener("visibilitychange", take)
    return () => {
      closed = true
      document.removeEventListener("visibilitychange", take)
      void lock?.release()
    }
  }, [])

  // Escape closes it through the same link, as a dialog would; the arrow
  // keys turn the pages. Once only for Escape: a second press before the
  // page goes would go back past the list.
  const closeLink = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === "Escape") {
        document.removeEventListener("keydown", onKey)
        closeLink.current?.click()
      } else if (event.key === "ArrowLeft") {
        setPage((was) => Math.max(0, Math.min(was, card.images.length - 1) - 1))
      } else if (event.key === "ArrowRight") {
        setPage((was) => Math.min(card.images.length - 1, was + 1))
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [card.images.length])

  return createPortal(
    // Dark whatever the theme, as a photo viewer is. It opens and closes
    // at once.
    <div
      role="dialog"
      aria-modal
      aria-labelledby="card-name"
      data-slot="card-viewer"
      className="dark fixed inset-0 z-50 flex flex-col bg-neutral-950 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-neutral-50"
    >
      <div className="grid shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-4 pt-4">
        <Link
          to="/you/certifications"
          replace
          ref={closeLink}
          onClick={(event) => void goBack(event)}
          aria-label="Close"
          className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 transition-opacity duration-150 hover:opacity-70 active:opacity-50 active:duration-0"
        >
          <IconX aria-hidden className="size-5" />
        </Link>
        <h2
          id="card-name"
          className="line-clamp-2 text-center text-base leading-tight font-semibold tracking-[-0.015em] break-words"
        >
          {card.name}
        </h2>
      </div>
      <CardPages card={card} page={shown} onPage={setPage} />
      {many && (
        <PageControl
          count={card.images.length}
          shown={shown}
          onPage={setPage}
        />
      )}
      {/* Room under the pages and dots, off the window's bottom edge. */}
      <div aria-hidden className="h-6 shrink-0" />
    </div>,
    document.body
  )
}

// iOS's page control: the strip is one target, as its 15 px dots are too
// close to tap apart. A tap left or right of the shown dot turns one page
// that way, and sliding along the strip scrubs through them.
function PageControl({
  count,
  shown,
  onPage,
}: {
  count: number
  shown: number
  onPage: (page: number) => void
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
      aria-label="Screenshots"
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
            aria-label={`Screenshot ${i + 1}`}
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
