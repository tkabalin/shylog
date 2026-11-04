import { useEffect, useId, useRef, useState } from "react"
import { IconCheck, IconSelector } from "@tabler/icons-react"
import { cn } from "cn"

import {
  setSmoothTemperature,
  useSmoothTemperature,
} from "@/data/smooth-temperature"

const lines = [
  [true, "Smoothed", "Without sensor lag"],
  [false, "Recorded", "As your dive computer logged it"],
] as const

// The temperature lane's caption, naming the line it shows, and a menu to
// pick the other. Laid out in the chart rather than portalled, so it
// turns with the full-screen view; it opens upward, inside the card.
export function LineMenu() {
  const smooth = useSmoothTemperature()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const options = () => [
    ...(panel.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ]

  useEffect(() => {
    if (!open) return
    // On the line shown, so the arrows go to the other.
    options()
      .find((option) => option.getAttribute("aria-pressed") === "true")
      ?.focus()
    // Before the full-screen view's own Escape, which would close it.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener("keydown", escape, true)
    return () => document.removeEventListener("keydown", escape, true)
  }, [open])

  return (
    <div
      ref={box}
      className="relative -ml-2"
      // Only when focus moves somewhere else: Safari doesn't focus a
      // clicked button, so a press on an option blurs to nothing.
      onBlur={(event) => {
        const to = event.relatedTarget
        if (to && !box.current?.contains(to)) setOpen(false)
      }}
    >
      {/* Takes the tap that closes the menu, as a menu on iOS does, so it
          doesn't also move the crosshair or press what's under it. */}
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-10"
          onPointerDown={() => setOpen(false)}
        />
      )}
      {/* 44 px tall over a 16 px row, which it doesn't grow. */}
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="-my-3.5 inline-flex h-11 cursor-pointer items-center gap-0.5 rounded-md px-2 whitespace-nowrap transition-[color,opacity] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-50 active:duration-0 desk:hover:text-foreground"
      >
        Water temperature · {smooth ? "Smoothed" : "Recorded"}
        <IconSelector aria-hidden className="size-3.5" />
      </button>
      {/* Always there, so it can scale back into the caption as it closes. */}
      <div
        ref={panel}
        id={id}
        role="group"
        aria-label="Water temperature line"
        inert={!open}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
          event.preventDefault()
          const all = options()
          const at = all.indexOf(document.activeElement as HTMLButtonElement)
          const step = event.key === "ArrowDown" ? 1 : -1
          all[(at + step + all.length) % all.length]?.focus()
        }}
        className={cn(
          "absolute bottom-full left-0 z-20 mb-1 flex w-max max-w-[min(20rem,calc(100vw-3rem))] origin-bottom-left flex-col rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[opacity,scale] duration-150 ease-out",
          !open &&
            "pointer-events-none scale-95 opacity-0 duration-100 motion-reduce:scale-100"
        )}
      >
        {lines.map(([value, label, note]) => (
          <button
            key={label}
            type="button"
            aria-pressed={smooth === value}
            onClick={() => {
              setSmoothTemperature(value)
              setOpen(false)
              trigger.current?.focus()
            }}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted desk:min-h-9 desk:hover:bg-muted"
          >
            <IconCheck
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-primary",
                smooth !== value && "invisible"
              )}
            />
            <span className="flex flex-col">
              {label}
              <span className="text-xs text-muted-foreground">{note}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
