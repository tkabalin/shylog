import {
  IconCertificate,
  IconChevronRight,
  IconDeviceMobileCheck,
} from "@tabler/icons-react"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { cn } from "cn"

import type { Card } from "@/data/db"
import { useLog } from "@/data/log"
import { PageBar } from "@/you/bar"
import { CardImage } from "@/you/cards/card-image"
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
  if (!loaded) return null
  const cards = log?.cards ?? []
  return (
    <div className="flex min-h-full flex-col">
      <PageBar back={{ label: "You", to: "/you" }} title="Certifications" />
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
