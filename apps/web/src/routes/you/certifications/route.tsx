import { Suspense, useRef, useState } from "react"
import {
  IconCertificate,
  IconChevronRight,
  IconDeviceMobileCheck,
  IconPhotoPlus,
  IconPlus,
} from "@tabler/icons-react"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { readPicks, type Picks } from "@/data/card-edits"
import type { Card } from "@/data/db"
import { useLog } from "@/data/log"
import { useDesk } from "@/hooks/use-desk"
import { PageBar } from "@/you/bar"
import { CardImage } from "@/you/cards/card-image"
import { accept, CardSheet, loadCardSheet } from "@/you/cards/load-sheet"
import { pressable } from "@/you/parts"

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
  if (!loaded) return null
  const cards = log?.cards ?? []
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
        <Suspense>
          <CardSheet
            key={adding.id}
            open={open}
            onOpenChange={setOpen}
            picked={adding.picked}
          />
        </Suspense>
      )}
      {/* Nothing until the first sync has filled the log, so a fresh phone
          doesn't say there are no cards. */}
      {!log ? null : cards.length ? (
        <div className="flex flex-col gap-3.5 px-4 pt-2 pb-10 md:mx-auto md:w-full md:max-w-xl">
          <ul className="flex flex-col divide-y overflow-hidden rounded-[14px] bg-card ring-1 ring-foreground/10">
            {cards.map((card) => (
              <li key={card.id}>
                <CardRow card={card} />
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 px-1 text-[13px] leading-normal text-muted-foreground">
            <IconDeviceMobileCheck
              aria-hidden
              className="mt-[0.1em] size-[1.15em] shrink-0"
            />
            Stored offline.
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

function CardRow({ card }: { card: Card }) {
  return (
    <Link
      to="/you/certifications/$cardId"
      params={{ cardId: card.id }}
      state={{ pushed: true }}
      className={cn(
        "flex w-full items-center gap-3 py-2.5 pr-3 pl-4 transition-colors duration-150 select-none [-webkit-touch-callout:none]",
        pressable
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-base leading-[1.4] font-medium tracking-[-0.015em]">
          <IconCertificate
            aria-hidden
            className="size-[1.15em] shrink-0 text-muted-foreground"
          />
          <span className="truncate">{card.name}</span>
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
  )
}
