import { useRef, useState } from "react"
import {
  IconAdjustmentsHorizontal,
  IconBook,
  IconWind,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerTitle,
} from "@/components/ui/drawer"
import { localValue } from "@/lib/local-value"

import { author } from "./author"

// Seen on this device, so a visitor who comes back goes straight to the map.
const welcomed = localValue(
  "divesites-welcomed",
  (stored) => stored === "1",
  (seen) => (seen ? "1" : "")
)

// What the map does a line each, with the icons Explore uses for them.
const features = [
  {
    icon: IconAdjustmentsHorizontal,
    text: "Filter by depth, and shore or boat",
  },
  { icon: IconBook, text: "Read each site's guide and site maps" },
  { icon: IconWind, text: "Find sites sheltered from today's wind and swell" },
]

// The public site's first visit: what the site is and who made it, once.
// A sheet on a phone, and from desk: up the drawer's centred dialog.
export function Welcome({ total }: { total: number }) {
  const [open, setOpen] = useState(() => !welcomed.get())
  const start = useRef<HTMLDivElement>(null)
  const close = () => {
    welcomed.set(true)
    setOpen(false)
  }
  return (
    <Drawer
      showSwipeHandle
      open={open}
      onOpenChange={(next) => !next && close()}
    >
      {/* Focus on the dialog itself, which names it, as a page that opens
          with it drew a focus ring round the byline's link or the button. */}
      <DrawerContent ref={start} initialFocus={start}>
        <div className="flex flex-col items-center gap-1 px-6 pt-6 text-center">
          <img src="/favicon.svg" alt="" className="mb-3 size-14" />
          <DrawerTitle className="text-xl font-semibold tracking-tight">
            Cape Town dive sites
          </DrawerTitle>
          <DrawerDescription>
            {total} sites around the Cape Peninsula and False Bay
          </DrawerDescription>
        </div>
        {/* As iOS's welcome sheets list theirs. */}
        <ul className="mx-auto mt-6 flex flex-col gap-4 px-8 text-[15px] leading-5">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3.5">
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          By{" "}
          <a
            href={author.url}
            target="_blank"
            rel="noopener"
            className="underline decoration-current/40 underline-offset-2"
          >
            {author.name}
          </a>
        </p>
        <DrawerFooter className="pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button size="lg" onClick={close}>
            Explore the map
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
