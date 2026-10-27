import * as React from "react"
import { cn } from "cn"

// Shylog: a native <input type="checkbox" switch> rather than Base UI's
// role="switch" element, because only Safari's own switch plays the system
// haptic. Safari draws it in the accent colour; browsers without the switch
// attribute get the same 51 × 31 iOS shape drawn here.
const nativeSwitch =
  typeof HTMLInputElement !== "undefined" &&
  "switch" in HTMLInputElement.prototype

function Switch({
  className,
  checked,
  onCheckedChange,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "onChange"> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <input
      type="checkbox"
      // React doesn't know the attribute, so it passes it through as is.
      {...{ switch: "" }}
      data-slot="switch"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
      className={cn(
        "shrink-0 cursor-pointer accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        nativeSwitch
          ? "h-7.75 w-12.75 rounded-full"
          : "relative h-7.75 w-12.75 appearance-none rounded-full bg-input transition-colors duration-200 ease-out before:absolute before:top-0.5 before:left-0.5 before:size-6.75 before:rounded-full before:bg-white before:shadow-[0_1px_3px_rgb(0_0_0/0.2)] before:transition-transform before:duration-200 before:ease-out checked:bg-primary checked:before:translate-x-5 motion-reduce:before:transition-none dark:bg-input/80 dark:checked:bg-primary",
        className
      )}
      {...props}
    />
  )
}

export { Switch }
