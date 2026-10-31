import { useRef, useState } from "react"
import {
  IconCertificate,
  IconChevronRight,
  IconDeviceMobileCheck,
  IconPhotoPlus,
  IconPlus,
} from "@tabler/icons-react"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { MotionConfig, Reorder } from "motion/react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { orderCards, readPicks, type Picks } from "@/data/card-edits"
import type { Card } from "@/data/db"
import { useLog } from "@/data/log"
import { useDesk } from "@/hooks/use-desk"
import { PageBar } from "@/you/bar"
import { CardImage } from "@/you/cards/card-image"
import { accept, CardSheet, loadCardSheet } from "@/you/cards/load-sheet"
import { useLift } from "@/you/cards/use-lift"
import { pressable, SaveFailure } from "@/you/parts"

// CertsHifi's list. A card's viewer opens over it as a child route, so the
// list stays as it was underneath when the viewer closes.
export const Route = createFileRoute("/you/certifications")({
  component: CertificationsPage,
})

const pagesText = (count: number) =>
  `${count} ${count === 1 ? "screenshot" : "screenshots"}`

function CertificationsPage() {
  const { log, loaded } = useLog()
  // The add button opens the photo picker straight away, then New card
  // with what was picked (D31), a fresh sheet each time.
  const picker = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState<{ id: number; picked: Picks }>()
  const [open, setOpen] = useState(false)
  const desk = useDesk()
  // The order a drag has made, shown until the log has it.
  const [order, setOrder] = useState<Card[]>()
  // Read when the card is put down, as that render may not have the last
  // swap yet.
  const latest = useRef<Card[]>(undefined)
  const [held, setHeld] = useState(false)
  // The log's version when an order was saved: a sync that failed after
  // the save leaves the order shown until a newer log arrives.
  const [savedAt, setSavedAt] = useState<string>()
  const [failure, setFailure] = useState<string>()
  if (!loaded) return null
  const cards = log?.cards ?? []
  const ids = (list: Card[]) => list.map((card) => card.id).join()
  if (
    order &&
    !held &&
    (ids(order) === ids(cards) || (savedAt && log?.version !== savedAt))
  ) {
    setOrder(undefined)
    setSavedAt(undefined)
  }
  const shown = order ?? cards
  const reorder = (next: Card[]) => {
    latest.current = next
    setOrder(next)
  }
  // Held from the lift, so a sync landing mid-drag can't swap the cards
  // under the finger for the new log's copies, which the drag doesn't know.
  const lift = () => {
    setHeld(true)
    if (!order) setOrder(cards)
  }
  // Sent once the card is put down; put back if the server refuses it,
  // unless another drag has begun since.
  const drop = async () => {
    setHeld(false)
    const sent = latest.current
    latest.current = undefined
    if (!sent || ids(sent) === ids(cards)) return
    const at = log?.version
    setFailure(undefined)
    try {
      await orderCards(sent.map((card) => card.id))
      setSavedAt(at)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
      if (!latest.current) setOrder(undefined)
    }
  }
  const pick = () => picker.current?.click()
  return (
    <div className="flex min-h-full flex-col">
      <PageBar
        back={{ label: "You", to: "/you" }}
        title="Certifications"
        // The empty screen's own button adds the first, as the board has it.
        end={
          !log || cards.length === 0 ? null : desk ? (
            // A shadcn button with a mouse, as the Log's New dive is.
            <Button onPointerDown={() => void loadCardSheet()} onClick={pick}>
              <IconPlus data-icon="inline-start" />
              Add card
            </Button>
          ) : (
            <button
              type="button"
              aria-label="Add a card"
              onPointerDown={() => void loadCardSheet()}
              onClick={pick}
              className="inline-flex size-11 items-center justify-center text-primary transition-opacity duration-150 hover:opacity-70 active:opacity-50 active:duration-0"
            >
              <IconPlus aria-hidden className="size-5.5 stroke-[2.25]" />
            </button>
          )
        }
      />
      <input
        ref={picker}
        type="file"
        accept={accept(desk)}
        multiple
        hidden
        onChange={async (event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ""
          if (!files.length) return
          // Read, and any HEIC made a JPEG, before the sheet opens, so its
          // pages never change under it.
          setAdding({ id: Date.now(), picked: await readPicks(files) })
          setOpen(true)
        }}
      />
      {adding && (
        <CardSheet
          key={adding.id}
          open={open}
          onOpenChange={setOpen}
          picked={adding.picked}
        />
      )}
      {/* Nothing until the first sync has filled the log, so a fresh phone
          doesn't say there are no cards. */}
      {!log ? null : cards.length ? (
        <div className="flex flex-col gap-3.5 px-4 pt-2 pb-10 md:mx-auto md:w-full md:max-w-xl">
          {/* Under reduced motion the cards swap places at once. */}
          <MotionConfig reducedMotion="user">
            <Reorder.Group
              as="ul"
              axis="y"
              values={shown}
              onReorder={reorder}
              className="flex flex-col divide-y rounded-[14px] bg-card ring-1 ring-foreground/10"
            >
              {shown.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  onLift={lift}
                  onDrop={drop}
                />
              ))}
            </Reorder.Group>
          </MotionConfig>
          <SaveFailure error={failure} />
          <p className="flex items-start gap-2 px-1 text-[13px] leading-normal text-muted-foreground">
            <IconDeviceMobileCheck
              aria-hidden
              className="mt-[0.1em] size-[1.15em] shrink-0"
            />
            <span>
              Stored offline.
              {cards.length > 1 &&
                ` ${desk ? "Drag" : "Hold and drag"} to reorder.`}
            </span>
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-7 pb-15 text-center">
          <span
            aria-hidden
            className="inline-flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <IconCertificate className="size-6.5 stroke-[1.75]" />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-lg font-semibold tracking-[-0.015em]">
              No cards yet
            </span>
            <span className="text-sm leading-normal text-muted-foreground">
              Add screenshots of your eCards from your agency’s app. They open
              even without signal, for when a dive centre asks.
            </span>
          </span>
          <Button
            onPointerDown={() => void loadCardSheet()}
            onClick={pick}
            className="mt-2 h-12 w-full gap-3.5 rounded-[14px] text-base font-semibold"
          >
            <IconPhotoPlus aria-hidden className="size-[1.15em]" />
            Choose screenshots
          </Button>
        </div>
      )}
      <Outlet />
    </div>
  )
}

// A card's row, which opens its viewer, or lifted by a long press (a
// drag with a mouse) to move it in the list.
function CardRow({
  card,
  onLift,
  onDrop,
}: {
  card: Card
  onLift: () => void
  onDrop: () => void
}) {
  const { item, ref, lifted } = useLift()
  return (
    <Reorder.Item
      as="li"
      ref={ref}
      value={card}
      {...item}
      onDragStart={onLift}
      onDragEnd={() => {
        item.onDragEnd()
        onDrop()
      }}
      // Its corners follow the list's at either end.
      className={cn(
        "relative select-none [-webkit-touch-callout:none] first:rounded-t-[14px] last:rounded-b-[14px]",
        lifted && "z-10"
      )}
    >
      <Link
        to="/you/certifications/$cardId"
        params={{ cardId: card.id }}
        state={{ pushed: true }}
        draggable={false}
        // Lifted, it grows a little and its shadow fades in over the rows,
        // as a dragged row does on iOS, as the pages in Edit card do: scale
        // and opacity, which the compositor draws.
        className={cn(
          "relative flex w-full items-center gap-3 rounded-[inherit] bg-card py-2.5 pr-3 pl-4 transition-[background-color,scale] duration-150 ease-out after:pointer-events-none after:absolute after:inset-0 after:rounded-[14px] after:shadow-lg after:transition-opacity after:duration-200 after:ease-out motion-reduce:transition-none",
          pressable,
          lifted
            ? "scale-[1.02] rounded-[14px] after:opacity-100 motion-reduce:scale-100"
            : "after:opacity-0"
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-base leading-[1.4] font-medium tracking-[-0.015em]">
            {card.name}
          </span>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {pagesText(card.images.length)}
          </span>
        </span>
        <CardImage
          cardId={card.id}
          n={0}
          hash={card.images[0]!}
          className="h-14 w-19 shrink-0 rounded-[9px] bg-muted object-cover ring-1 ring-foreground/10"
        />
        <IconChevronRight
          aria-hidden
          className="size-4.5 shrink-0 text-muted-foreground/60"
        />
      </Link>
    </Reorder.Item>
  )
}
