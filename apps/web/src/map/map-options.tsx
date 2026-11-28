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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { months } from "@/format/dates"
import { localValue } from "@/lib/local-value"

import { author } from "./author"
import { extractBuilt } from "./extract-built"
import { publicSite } from "./host"
import { imageryThumb } from "./imagery"
import mapDark from "./looks/map-dark.png"
import mapLight from "./looks/map-light.png"
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
  // Map or satellite, where the instance has a key for the imagery.
  satellite?: Satellite
}

type Satellite = {
  // Whether the map shows the imagery, which it doesn't with no signal or
  // once the imagery failed to come, whatever was chosen.
  shown: boolean
  // Esri sends the imagery, so it needs a signal, not Shylog's server.
  online: boolean
  onChange: (on: boolean) => void
}

// Map and Satellite as pictures of the same harbour, as Apple Maps shows
// them, switching the map live. The card marked is what the map shows, and
// with no signal Satellite can't be chosen.
function Looks({ satellite, desk }: { satellite: Satellite; desk: boolean }) {
  const picture = "size-full object-cover"
  const looks = [
    {
      value: "map",
      label: "Map",
      picture: (
        <>
          <img src={mapLight} alt="" className={cn(picture, "dark:hidden")} />
          <img
            src={mapDark}
            alt=""
            className={cn(picture, "hidden dark:block")}
          />
        </>
      ),
    },
    {
      value: "satellite",
      label: "Satellite",
      // Grey where Esri doesn't send it, not a broken image, and asked for
      // again when the signal comes back.
      picture: (
        <img
          key={String(satellite.online)}
          src={imageryThumb}
          alt=""
          className={picture}
          onError={(event) => (event.currentTarget.style.visibility = "hidden")}
        />
      ),
    },
  ]
  return (
    <ToggleGroup
      aria-label="Map type"
      value={[satellite.shown ? "satellite" : "map"]}
      // Tapping the marked card again leaves it marked.
      onValueChange={(next: string[]) => {
        if (next[0]) satellite.onChange(next[0] === "satellite")
      }}
      className={cn("grid w-full grid-cols-2", desk ? "gap-2" : "gap-3")}
    >
      {looks.map(({ value, label, picture: image }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          disabled={value === "satellite" && !satellite.online}
          className={cn(
            "group/look h-auto min-w-0 flex-col items-stretch gap-1.5 p-0 pb-1 font-normal text-muted-foreground hover:bg-transparent aria-pressed:bg-transparent aria-pressed:text-foreground",
            // Greyed as well as faded, which alone read as unpressed in the
            // dark theme.
            "disabled:opacity-40 disabled:[&_img]:grayscale",
            desk ? "text-xs" : "text-[13px]"
          )}
        >
          <span className="block aspect-[16/10] overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-[box-shadow] duration-150 group-aria-pressed/look:ring-2 group-aria-pressed/look:ring-primary">
            {image}
          </span>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// The MPA zones switch, the way to the rules, and where the map's data comes
// from, each as "Label: text".
function Body({
  zones,
  onZones,
  onRules,
  satellite,
  desk,
}: Options & { desk: boolean }) {
  const row = cn(
    "flex w-full items-center justify-between gap-3 border-b text-left",
    desk ? "min-h-10 text-sm" : "min-h-13 text-[15px]"
  )
  const link =
    "underline decoration-current/40 underline-offset-2 hover:decoration-current"
  return (
    <>
      {satellite && (
        <div className={desk ? "pb-3" : "pb-4"}>
          <Looks satellite={satellite} desk={desk} />
        </div>
      )}
      <div className={desk && !satellite ? undefined : "border-t"}>
        {/* Laid out as the app's other switches: the note under the name,
            the switch centred beside both. The shading closes across the
            land, which the imagery doesn't hide; said under either card,
            so the sheet doesn't grow under the finger as Satellite is
            chosen. */}
        <label
          className={cn(
            row,
            "cursor-pointer gap-4 select-none",
            desk ? "py-2" : "py-2.5"
          )}
        >
          <span className="flex flex-1 flex-col gap-0.5">
            MPA zones
            {satellite && (
              <span
                className={cn(
                  "text-muted-foreground",
                  desk ? "text-xs" : "text-[13px]"
                )}
              >
                Zone shading and the Cape Point bands show on Map only.
              </span>
            )}
          </span>
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
          {satellite && (
            <li>
              <b className="font-medium text-foreground">Satellite</b>:{" "}
              <a
                href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9"
                target="_blank"
                rel="noopener"
                className={link}
              >
                Esri World Imagery
              </a>
              , from Esri, Vantor, GeoEye, Earthstar Geographics, CNES/Airbus
              DS, USDA, USGS, AeroGRID, IGN and the GIS User Community.
            </li>
          )}
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
            .
          </li>
          <li>
            <b className="font-medium text-foreground">MPA zones</b>: Government
            Gazettes. Read on{" "}
            <span className="whitespace-nowrap">{day(rulesRead)}</span>.
          </li>
          {/* The public site is Shylog's map on its own: who made it, and
              its code, which the GPL asks it to offer. */}
          {publicSite && (
            <>
              <li>
                <b className="font-medium text-foreground">By</b>:{" "}
                <a
                  href={author.url}
                  target="_blank"
                  rel="noopener"
                  className={link}
                >
                  {author.name}
                </a>
                .
              </li>
              <li>
                <b className="font-medium text-foreground">Code</b>: part of{" "}
                <a
                  href="https://github.com/tkabalin/shylog"
                  target="_blank"
                  rel="noopener"
                  className={link}
                >
                  Shylog
                </a>{" "}
                on GitHub.
              </li>
            </>
          )}
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
