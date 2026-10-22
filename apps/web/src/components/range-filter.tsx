import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react"
import type { IconProps } from "@tabler/icons-react"
import { cn } from "cn"

import type { Scale } from "@/components/range-sheet"
import { pillTrigger } from "@/components/ui/select"
import type { Range } from "@/log/filters"

// The drawer and slider are about a third of the Log's code and only needed
// once a pill is tapped, so they load when the browser is idle after the Log
// renders, or on the press that opens one, whichever comes first.
const loadSheet = () => import("@/components/range-sheet")
const RangeSheet = lazy(loadSheet)

export function usePreloadRangeSheet() {
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(() => void loadSheet())
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(() => void loadSheet(), 1000)
    return () => clearTimeout(id)
  }, [])
}

// "18–30 m", or "≥ 18 m" when the top handle is at the end of the scale.
export function rangeLabel(range: Range, scale: Scale, unit: string) {
  return range.max >= scale.max
    ? `≥ ${range.min} ${unit}`
    : `${range.min}–${range.max} ${unit}`
}

// A Depth or Duration pill (D25), styled like the Log's other filter pills.
export function RangeFilter({
  icon: Icon,
  ...sheet
}: {
  label: string
  noun: string
  unit: string
  unitName: string
  icon: ComponentType<IconProps>
  scale: Scale
  value: Range | undefined
  onApply: (range: Range | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  // Mounted from the first opening on, so closing can animate.
  const [used, setUsed] = useState(false)
  const pill = useRef<HTMLButtonElement>(null)
  const { value, scale, unit, label } = sheet
  return (
    <>
      <button
        ref={pill}
        type="button"
        aria-haspopup="dialog"
        aria-label={
          value ? `${label}, ${rangeLabel(value, scale, unit)}` : label
        }
        aria-expanded={open}
        data-active={value ? "" : undefined}
        onPointerDown={() => void loadSheet()}
        onClick={() => {
          setUsed(true)
          setOpen(true)
        }}
        className={cn(pillTrigger, "text-foreground")}
      >
        <Icon aria-hidden />
        {value ? rangeLabel(value, scale, unit) : label}
      </button>
      {used && (
        <Suspense>
          <RangeSheet
            {...sheet}
            open={open}
            onOpenChange={setOpen}
            returnFocus={pill}
          />
        </Suspense>
      )}
    </>
  )
}
