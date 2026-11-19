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

import { CompassDial } from "./compass-dial"
import {
  filterSites,
  goodForOptions,
  searchOf,
  seasonOptions,
  siteCount,
  skillOptions,
  typeOptions,
  type SiteFilters,
} from "./filters"

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
  // The phone's row keeps the way in and the depth; the sheet has the rest.
  const cleared: SiteFilters = conditionsOnly
    ? { ...draft, wind: [], swell: [], season: [] }
    : { types: [], depth: draft.depth, access: draft.access }
  const shown = filterSites(draft).length

  return (
    <Drawer showSwipeHandle open={open && mounted} onOpenChange={onOpenChange}>
      <DrawerContent finalFocus={returnFocus}>
        <DrawerHeader className="pb-4">
          <DrawerTitle>{conditionsOnly ? "Conditions" : "Filters"}</DrawerTitle>
        </DrawerHeader>
        {/* A pull down from the top of the filters drags the sheet, as an
            iOS sheet's does; a scroll part way down scrolls them. */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 pb-6">
          {!conditionsOnly && (
            <Group title="Type">
              <Chips
                options={typeOptions}
                value={draft.types}
                onChange={(types) => setDraft({ ...draft, types })}
              />
            </Group>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Group title="Wind">
              <CompassDial
                name="Wind"
                any="Any wind"
                says={(wind, article) => (
                  <>
                    Sites good in {article} {wind}
                  </>
                )}
                icon={<IconWind aria-hidden />}
                spread
                value={draft.wind?.[0]}
                onChange={(wind) =>
                  setDraft({ ...draft, wind: wind ? [wind] : [] })
                }
              />
            </Group>
            <Group title="Swell">
              <CompassDial
                name="Swell"
                any="Any swell"
                says={(swell) => <>Sites not exposed to {swell} swell</>}
                icon={<IconRipple aria-hidden />}
                value={draft.swell?.[0]}
                onChange={(swell) =>
                  setDraft({ ...draft, swell: swell ? [swell] : [] })
                }
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
