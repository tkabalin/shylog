import { useEffect, useState, type RefObject } from "react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Slider } from "@/components/ui/slider"
import { isFullRange, type Range } from "@/log/filters"

export interface Scale {
  min: number
  max: number
  step: number
}

// The sheet a Depth or Duration pill opens (D25): a two-handle slider with
// its bounds shown above the handles, and Reset and Apply. Loaded on its own,
// as the Log's first frame doesn't need it.
export default function RangeSheet({
  open,
  onOpenChange,
  returnFocus,
  label,
  noun,
  unit,
  unitName,
  scale,
  value,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: RefObject<HTMLElement | null>
  label: string
  noun: string
  unit: string
  unitName: string
  scale: Scale
  value: Range | undefined
  onApply: (range: Range | undefined) => void
}) {
  // Mounted by the tap that opens it, so it starts closed for a frame:
  // a drawer that mounts open skips its entrance.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const full = { min: scale.min, max: scale.max }
  const [draft, setDraft] = useState<Range>(value ?? full)
  const [wasOpen, setWasOpen] = useState(open)
  // Each opening starts from the applied range.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(value ?? full)
  }
  const bound = (n: number) =>
    n >= scale.max ? `> ${scale.max} ${unit}` : `${n} ${unit}`
  // Two labels need about a fifth of the track before they touch.
  const close = draft.max - draft.min < (scale.max - scale.min) / 5

  return (
    <Drawer open={open && mounted} onOpenChange={onOpenChange}>
      <DrawerContent finalFocus={returnFocus}>
        <DrawerHeader>
          <DrawerTitle>{label}</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pt-10 pb-8">
          <Slider
            value={[draft.min, draft.max]}
            min={scale.min}
            max={scale.max}
            step={scale.step}
            minStepsBetweenValues={0}
            onValueChange={(values) => {
              const [min, max] = values as number[]
              setDraft({ min, max })
            }}
            thumbLabels={[bound(draft.min), bound(draft.max)]}
            joinedLabel={
              !close
                ? undefined
                : draft.min === draft.max
                  ? bound(draft.min)
                  : `${bound(draft.min)} – ${bound(draft.max)}`
            }
            getAriaLabel={(index) => `${index ? "Maximum" : "Minimum"} ${noun}`}
            getAriaValueText={(_, n) =>
              n >= scale.max
                ? `More than ${scale.max} ${unitName}`
                : `${n} ${unitName}`
            }
          />
        </div>
        <DrawerFooter className="flex-row gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            variant="outline"
            className="flex-1"
            disabled={isFullRange(draft, scale)}
            onClick={() => setDraft(full)}
          >
            Reset
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply(isFullRange(draft, scale) ? undefined : draft)
              onOpenChange(false)
            }}
          >
            Apply
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
