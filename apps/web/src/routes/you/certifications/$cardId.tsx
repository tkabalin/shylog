import { createContext, use, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { IconPencil, IconX } from "@tabler/icons-react"
import { createFileRoute, Link, Navigate } from "@tanstack/react-router"

import { ImagePages, type PageImageProps } from "@/components/image-pages"
import { PageControl } from "@/components/page-control"
import type { Card } from "@/data/db"
import { useLog } from "@/data/log"
import { useConnected } from "@/data/sync-status"
import { useFullScreen } from "@/hooks/use-full-screen"
import { useEdgeSwipeBlock } from "@/lib/edge-swipe"
import { useBack } from "@/you/bar"
import { CardImage } from "@/you/cards/card-image"
import { CardSheet, loadCardSheet } from "@/you/cards/load-sheet"

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

// The card the viewer shows, for its pages' images.
const ShownCard = createContext<Card | null>(null)

function Screenshot({ i, ...props }: PageImageProps) {
  const card = use(ShownCard)!
  return (
    <CardImage
      {...props}
      cardId={card.id}
      n={i}
      hash={card.images[i]}
      retry
      alt={`${card.name}, screenshot ${i + 1} of ${card.images.length}`}
    />
  )
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
  // A swipe from the very left edge turns the page, as anywhere else on
  // the card, rather than leaving the viewer.
  useEdgeSwipeBlock()
  // Edit card's sheet loads once the card is up, so Edit opens it at once
  // rather than on a press that waits for the download.
  useEffect(() => void loadCardSheet(), [])

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
  // Edit card over the viewer, a fresh sheet each time it opens.
  const [editing, setEditing] = useState(false)
  const connected = useConnected()
  const [edits, setEdits] = useState(0)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The keys belong to the sheet while it's open.
      if (event.defaultPrevented || editing) return
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
  }, [card.images.length, editing])

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
        <button
          type="button"
          aria-label="Edit card"
          // Editing and deleting a card need the server.
          disabled={!connected}
          onPointerDown={() => void loadCardSheet()}
          onClick={() => {
            setEdits((was) => was + 1)
            setEditing(true)
          }}
          className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 transition-opacity duration-150 enabled:hover:opacity-70 enabled:active:opacity-50 enabled:active:duration-0 disabled:opacity-40"
        >
          <IconPencil aria-hidden className="size-4.5" />
        </button>
      </div>
      {edits > 0 && (
        <CardSheet
          key={edits}
          open={editing}
          onOpenChange={setEditing}
          card={card}
          // The list takes the viewer's place as the card goes.
          onDeleted={() => closeLink.current?.click()}
        />
      )}
      <ShownCard value={card}>
        <ImagePages
          count={card.images.length}
          page={shown}
          onPage={setPage}
          // An eCard's small print readable on a phone.
          maxScale={4}
          keyOf={(i) => `${i} ${card.images[i]}`}
          image={Screenshot}
        />
      </ShownCard>
      {many && (
        <PageControl
          count={card.images.length}
          shown={shown}
          onPage={setPage}
          label="Screenshots"
          itemLabel={(i) => `Screenshot ${i + 1}`}
        />
      )}
      {/* Room under the pages and dots, off the window's bottom edge. */}
      <div aria-hidden className="h-6 shrink-0" />
    </div>,
    document.body
  )
}
