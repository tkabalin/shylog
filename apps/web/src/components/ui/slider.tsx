import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "cn"

// Shylog: thumbs are 20px with a 44px touch area for wet hands, and each can
// carry a label shown above it (the range sheet's bounds, D25), or one label
// centred between them when they are too close for two.
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabels,
  joinedLabel,
  getAriaLabel,
  getAriaValueText,
  ...props
}: SliderPrimitive.Root.Props & {
  thumbLabels?: React.ReactNode[]
  joinedLabel?: React.ReactNode
} & Pick<SliderPrimitive.Thumb.Props, "getAriaLabel" | "getAriaValueText">) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]
  const middle =
    ((_values[0] + _values[_values.length - 1]) / 2 - min) / (max - min || 1)

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {joinedLabel != null && (
          <span
            aria-hidden
            style={{ left: `${middle * 100}%` }}
            className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 text-sm font-medium whitespace-nowrap text-foreground tabular-nums"
          >
            {joinedLabel}
          </span>
        )}
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            index={index}
            getAriaLabel={getAriaLabel}
            getAriaValueText={getAriaValueText}
            className="relative block size-5 shrink-0 rounded-full border border-ring bg-white shadow-sm ring-ring/50 transition-colors select-none after:absolute after:-inset-3 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50 desk:size-3 desk:after:-inset-2"
          >
            {joinedLabel == null && thumbLabels?.[index] != null && (
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 text-sm font-medium whitespace-nowrap text-foreground tabular-nums",
                  // Shylog: at an end it lines up with the thumb's outer
                  // edge, so "> 40 m" stays inside the track's padding.
                  _values[index] <= min && "left-0 translate-x-0",
                  _values[index] >= max && "right-0 left-auto translate-x-0"
                )}
              >
                {thumbLabels[index]}
              </span>
            )}
          </SliderPrimitive.Thumb>
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
