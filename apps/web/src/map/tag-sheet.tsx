import { useEffect, useId, useState, type RefObject } from "react"
import { IconRipple, IconWind } from "@tabler/icons-react"
import { cn } from "cn"

import { tagChip } from "@/components/tag-chip"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Haptic } from "@/lib/haptic"

import {
  accessOptions,
  compassOptions,
  filterSites,
  goodForOptions,
  searchOf,
  seasonOptions,
  siteCount,
  skillOptions,
  type SiteFilters,
} from "./filters"
import type { Compass } from "./sites"

// The sheet behind the phone's Filters pill, with every filter the pills
// don't hold, and behind the desktop's Conditions pill, with only those.
// Loaded on its own, as the map's first frame doesn't need it.
export default function TagSheet({
  open,
  onOpenChange,
  returnFocus,
  conditionsOnly = false,
  filters,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: RefObject<HTMLElement | null>
  conditionsOnly?: boolean
  filters: SiteFilters
  onApply: (filters: SiteFilters) => void
}) {
  // Mounted by the tap that opens it, so it starts closed for a frame: a
  // drawer that mounts open skips its entrance.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const [draft, setDraft] = useState(filters)
  const [wasOpen, setWasOpen] = useState(open)
  // Each opening starts from the applied filters.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(filters)
  }
  const cleared: SiteFilters = conditionsOnly
    ? { ...draft, wind: [], swell: [], season: [] }
    : { types: draft.types, depth: draft.depth }
  const shown = filterSites(draft).length
  // A hairline under the title once the filters scroll under it, as iOS's
  // sheets draw one.
  const [scrolled, setScrolled] = useState(false)

  return (
    <Drawer showSwipeHandle open={open && mounted} onOpenChange={onOpenChange}>
      <DrawerContent finalFocus={returnFocus}>
        <DrawerHeader
          className={cn(
            "border-b transition-colors duration-150",
            scrolled ? "border-border" : "border-transparent"
          )}
        >
          <DrawerTitle>{conditionsOnly ? "Conditions" : "Filters"}</DrawerTitle>
        </DrawerHeader>
        {/* A pull down from the top of the filters drags the sheet, as an
            iOS sheet's does; a scroll part way down scrolls them. */}
        <div
          onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 pt-2 pb-6"
        >
          {!conditionsOnly && (
            <Group title="Way in">
              <Chips
                options={accessOptions}
                value={draft.access ?? []}
                onChange={(access) => setDraft({ ...draft, access })}
              />
            </Group>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Group title="Today's wind">
              <CompassGrid
                name="Today's wind"
                icon={<IconWind aria-hidden />}
                value={draft.wind ?? []}
                onChange={(wind) => setDraft({ ...draft, wind })}
              />
            </Group>
            <Group title="Today's swell">
              <CompassGrid
                name="Today's swell"
                icon={<IconRipple aria-hidden />}
                value={draft.swell ?? []}
                onChange={(swell) => setDraft({ ...draft, swell })}
              />
            </Group>
          </div>
          <Group title="Best season">
            <Chips
              options={seasonOptions}
              value={draft.season ?? []}
              onChange={(season) => setDraft({ ...draft, season })}
            />
          </Group>
          {!conditionsOnly && (
            <>
              <Group title="Skills">
                <Chips
                  options={skillOptions}
                  value={draft.skills ?? []}
                  onChange={(skills) => setDraft({ ...draft, skills })}
                />
              </Group>
              <Group title="Good for">
                <Chips
                  options={goodForOptions}
                  value={draft.goodFor ?? []}
                  onChange={(goodFor) => setDraft({ ...draft, goodFor })}
                />
              </Group>
            </>
          )}
        </div>
        <DrawerFooter
          data-base-ui-swipe-ignore
          className="flex-row gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <Button
            variant="outline"
            className="flex-1 desk:flex-none"
            disabled={
              JSON.stringify(searchOf(cleared)) ===
              JSON.stringify(searchOf(draft))
            }
            onClick={() => setDraft(cleared)}
          >
            Reset
          </Button>
          <Button
            className="flex-1 tabular-nums desk:flex-none"
            disabled={!shown}
            onClick={() => {
              onApply(draft)
              onOpenChange(false)
            }}
          >
            {shown ? `Show ${siteCount(shown)}` : "No sites"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <h3 id={id} className="text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

// A tick per option, any number at once, wrapping onto as many lines as it
// takes: the dive form's tag chips, smaller for a mouse.
const chip = cn(tagChip, "desk:h-8 desk:px-3")

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T[]
  onChange: (value: T[]) => void
}) {
  return (
    <ToggleGroup
      multiple
      value={value}
      onValueChange={(next) => onChange(next as T[])}
      className="flex flex-wrap gap-2"
    >
      {options.map(({ value: option, label }) => (
        <ToggleGroupItem key={option} value={option} className={chip}>
          {label}
          <Haptic />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// The eight points laid out as a compass: north at the top, and the wind
// or swell's icon at the centre.
const layout: (Compass | "centre")[] = [
  "nw",
  "n",
  "ne",
  "w",
  "centre",
  "e",
  "sw",
  "s",
  "se",
]

function CompassGrid({
  name,
  icon,
  value,
  onChange,
}: {
  name: string
  icon: React.ReactNode
  value: Compass[]
  onChange: (value: Compass[]) => void
}) {
  return (
    <ToggleGroup
      multiple
      aria-label={name}
      value={value}
      onValueChange={(next) => onChange(next as Compass[])}
      // Sized for a finger on a phone and for a mouse from desk: up.
      className="grid aspect-square w-full max-w-44 grid-cols-3 grid-rows-3 gap-1.5 desk:max-w-32"
    >
      {layout.map((point) =>
        point === "centre" ? (
          <span
            key={point}
            className="flex items-center justify-center text-muted-foreground [&_svg]:size-5"
          >
            {icon}
          </span>
        ) : (
          <ToggleGroupItem
            key={point}
            value={point}
            aria-label={compassOptions.find((o) => o.value === point)!.label}
            className={cn(
              chip,
              "size-full min-w-0 px-0 uppercase desk:size-full desk:px-0"
            )}
          >
            {point}
            <Haptic />
          </ToggleGroupItem>
        )
      )}
    </ToggleGroup>
  )
}
