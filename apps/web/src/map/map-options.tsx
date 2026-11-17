import { useEffect, useRef, useState } from "react"
import { IconChevronRight, IconStack2 } from "@tabler/icons-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { months } from "@/format/dates"
import { localValue } from "@/lib/local-value"

import { extractBuilt } from "./extract"
import { fetched } from "./sites"
import { rulesRead } from "./zone-rules"

// Whether the zones show, kept on this device until switched back on.
export const zonesShown = localValue(
  "explore-zones",
  (stored) => stored !== "off",
  (on: boolean) => (on ? "on" : "off")
)

// "16 Nov 2026", from the date alone, with no time zone to move it.
const day = (date: string) => {
  const [year, month, dayOf] = date.split("-").map(Number)
  return `${dayOf} ${months[month - 1]} ${year}`
}

type Options = {
  zones: boolean
  onZones: (on: boolean) => void
  // The rules screen, or card, which the desktop's popover closes for.
  onRules: () => void
}

// The MPA zones switch, the way to the rules, and where the map's data comes
// from, each as "Label: text".
function Body({ zones, onZones, onRules, desk }: Options & { desk: boolean }) {
  const row = cn(
    "flex w-full items-center justify-between gap-3 border-b text-left",
    desk ? "min-h-10 text-sm" : "min-h-13 text-[15px]"
  )
  const link =
    "underline decoration-current/40 underline-offset-2 hover:decoration-current"
  return (
    <>
      <div className={desk ? undefined : "border-t"}>
        <label className={cn(row, "cursor-pointer select-none")}>
          MPA zones
          <Switch checked={zones} onCheckedChange={onZones} />
        </label>
        <button
          type="button"
          onClick={onRules}
          className={cn(
            row,
            "transition-opacity duration-150 data-press:opacity-60 data-press:duration-0 desk:hover:text-primary"
          )}
        >
          Zone rules
          <IconChevronRight className="size-4.5 text-muted-foreground" />
        </button>
      </div>
      <div className={desk ? "pt-3" : "pt-4 pb-4"}>
        <h3
          className={cn(
            "mb-2 font-medium text-muted-foreground",
            desk ? "text-xs" : "text-[13px]"
          )}
        >
          Sources
        </h3>
        <ul
          className={cn(
            "flex flex-col text-muted-foreground",
            desk
              ? "gap-1.5 text-xs leading-[17px]"
              : "gap-2 text-[13px] leading-[18px]"
          )}
        >
          <li>
            <b className="font-medium text-foreground">Map</b>:{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener"
              className={link}
            >
              OpenStreetMap
            </a>{" "}
            contributors, via Protomaps. Extract of{" "}
            <span className="whitespace-nowrap">{day(extractBuilt)}</span>.
          </li>
          <li>
            <b className="font-medium text-foreground">Dive sites</b>:{" "}
            <a
              href="https://en.wikivoyage.org/wiki/Diving_the_Cape_Peninsula_and_False_Bay/Dive_sites"
              target="_blank"
              rel="noopener"
              className={link}
            >
              Wikivoyage
            </a>
            , CC{"\u00a0"}BY{"\u2011"}SA. Read on{" "}
            <span className="whitespace-nowrap">{day(fetched)}</span>.
          </li>
          <li>
            <b className="font-medium text-foreground">Site maps and images</b>:{" "}
            <a
              href="https://commons.wikimedia.org/"
              target="_blank"
              rel="noopener"
              className={link}
            >
              Wikimedia Commons
            </a>
            , each credited under it.
          </li>
          <li>
            <b className="font-medium text-foreground">MPA zones</b>: Government
            Gazettes. Read on{" "}
            <span className="whitespace-nowrap">{day(rulesRead)}</span>.
          </li>
        </ul>
      </div>
    </>
  )
}

// On a phone, a 36 px circle under the site count, opening a sheet.
export function PhoneMapOptions({
  covered,
  ...options
}: Options & {
  // A screen over the map, as the rules are.
  covered: boolean
}) {
  const [open, setOpen] = useState(false)
  // Open under the rules, so Back finds the sheet as iOS's back swipe
  // pictured it. Keyed, a new sheet each way goes and comes back at once:
  // a slide would run over the rules, or up after the picture had gone.
  const shown = open && !covered
  // Focus then stays on the rules' bar: the old sheet hands it back to
  // this button as it unmounts, before the rules can take it.
  const leaving = useRef(false)
  useEffect(() => {
    if (!covered) leaving.current = false
  }, [covered])
  return (
    <>
      <button
        type="button"
        aria-label="Map options"
        aria-haspopup="dialog"
        aria-expanded={shown}
        onClick={() => setOpen(true)}
        className={cn(
          floating,
          "grid size-9 place-items-center rounded-full after:absolute after:-inset-1"
        )}
      >
        <IconStack2 className="size-[18px]" />
      </button>
      <Drawer
        key={covered ? "covered" : "shown"}
        showSwipeHandle
        open={shown}
        onOpenChange={setOpen}
      >
        <DrawerContent finalFocus={() => !leaving.current}>
          <DrawerHeader>
            <DrawerTitle>Map</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto overscroll-contain px-4 pt-4">
            <Body
              {...options}
              desk={false}
              onRules={() => {
                leaving.current = true
                options.onRules()
              }}
            />
          </div>
          <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  )
}

// From desk: up, an outline icon button at the map's top right, opening a
// popover.
export function DeskMapOptions(options: Options) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Map options"
            className="absolute top-3 right-3 z-10 shadow-xs"
          />
        }
      >
        <IconStack2 />
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={8}
        className="w-75 gap-0 p-3"
      >
        <Body
          {...options}
          desk
          onRules={() => {
            setOpen(false)
            options.onRules()
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

// The phone's controls over the map: solid, as all of Shylog's chrome is,
// with a soft shadow to lift them off the busy map.
export const floating =
  "relative bg-background text-foreground shadow-[0_0_0_1px_var(--color-border),0_4px_14px_-6px_oklch(0.2_0.02_225/35%)] transition-[scale] duration-150 ease-out active:scale-95 motion-reduce:active:scale-100"
