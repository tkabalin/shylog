import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react"
import { cn } from "cn"

import { IconSearch, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  DrawerActions,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { useDesk } from "@/hooks/use-desk"
import { isReturn } from "@/lib/keys"

// How much of the screen the on-screen keyboard covers. iOS doesn't shrink
// a full-height sheet for it, so its lists pad their ends by this much to
// scroll their last rows above it.
const pads = new Set<HTMLElement>()
let keyboard = 0
let frame = 0

function measure() {
  const viewport = window.visualViewport
  if (!viewport) return 0
  return Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
}

// iOS sends several resizes and scrolls a frame as the keyboard slides, so
// this writes at most once a frame, and only when the height has changed.
function follow() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const next = measure()
    if (next === keyboard) return
    keyboard = next
    for (const pad of pads) pad.style.setProperty("--keyboard", `${next}px`)
  })
}

// A ref for the element in a sheet that pads its end by `--keyboard`. The
// variable doesn't inherit (index.css), so it's written on each one as it
// mounts: a scroller remounted with the keyboard up starts clear of it.
export function keyboardPad(pad: HTMLElement | null) {
  if (!pad) return
  const viewport = window.visualViewport
  if (!pads.size) {
    keyboard = measure()
    viewport?.addEventListener("resize", follow)
    viewport?.addEventListener("scroll", follow)
  }
  pads.add(pad)
  pad.style.setProperty("--keyboard", `${keyboard}px`)
  return () => {
    pads.delete(pad)
    if (pads.size) return
    // Nothing open reads it, so a closed sheet doesn't follow the keyboard.
    viewport?.removeEventListener("resize", follow)
    viewport?.removeEventListener("scroll", follow)
    cancelAnimationFrame(frame)
    frame = 0
  }
}

// A picker sheet at full height, like an iOS page sheet, stopping a little
// below the status bar. As a dialog it keeps a fixed height, so the list
// doesn't jump as a search narrows it.
export function FullSheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DrawerContent>) {
  return (
    <DrawerContent
      className={cn(
        "h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] max-h-none desk:h-[min(40rem,calc(100dvh-4rem))]",
        className
      )}
      {...props}
    >
      {children}
    </DrawerContent>
  )
}

// Set around a bar's actions once they sit in a desktop dialog's footer,
// where BarButton draws a shadcn button instead of a text button.
const InFooter = createContext(false)

// The sheet's bar: an action either side of a centred title, as on the
// boards' headers. As a desktop dialog the title heads it and the actions
// move to its footer, as shadcn's dialogs have them.
export function SheetBar({
  title,
  start,
  end,
  mark,
}: {
  title: ReactNode
  start?: ReactNode
  end?: ReactNode
  // A sign such as OfflineMark, beside the end action on a phone and
  // across from the title on desktop, as it would be lost in the footer.
  mark?: ReactNode
}) {
  const desk = useDesk()
  if (desk)
    return (
      <>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-3">
          <DrawerTitle>{title}</DrawerTitle>
          {mark}
        </div>
        <DrawerActions>
          <InFooter.Provider value>
            {start}
            {end}
          </InFooter.Provider>
        </DrawerActions>
      </>
    )
  return (
    // An iOS sheet's bar sits clear of the sheet's top edge; flush, with 44
    // px for the row alone, it read as cramped next to Apple's. Stuck, so a
    // sheet that scrolls in landscape keeps Cancel and Done in reach.
    <div className="sticky top-0 z-10 grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center bg-popover px-2 pt-2">
      <span className="justify-self-start">{start}</span>
      <DrawerTitle>{title}</DrawerTitle>
      <span className="flex items-center justify-self-end">
        {mark}
        {end}
      </span>
    </div>
  )
}

export function BarButton({
  className,
  strong,
  back,
  ...props
}: ComponentProps<"button"> & { strong?: boolean; back?: boolean }) {
  const footer = useContext(InFooter)
  // In a footer a step back sits apart on the left, as a wizard's does.
  if (footer)
    return (
      <Button
        variant={strong ? "default" : "outline"}
        className={back ? "mr-auto" : undefined}
        {...props}
      />
    )
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 items-center gap-0.5 px-2 text-base text-primary transition-opacity duration-150 active:opacity-50 active:duration-0 enabled:hover:opacity-70 disabled:text-muted-foreground/60 disabled:active:opacity-100",
        strong ? "font-semibold" : "font-medium",
        className
      )}
      {...props}
    />
  )
}

export function SheetSection({
  title,
  children,
  className,
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col", className)}>
      {title && (
        <h3 className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="flex flex-col divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {children}
      </div>
    </section>
  )
}

// A sheet's search, as SitePickerHifi draws it: filled, with its own clear
// button rather than the browser's, and Return closing the keyboard.
export function SheetSearch({
  value,
  onChange,
  label,
  capitalise,
  maxLength,
  autoFocus,
  className,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  capitalise?: boolean
  maxLength?: number
  autoFocus?: boolean
  className?: string
}) {
  return (
    <InputGroup
      variant="filled"
      // Sized for a mouse in a desktop dialog, as the Log's search is.
      className={cn(
        "has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0 desk:h-9 desk:rounded-lg",
        className
      )}
    >
      <InputGroupAddon>
        <IconSearch aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        enterKeyHint="search"
        maxLength={maxLength}
        autoFocus={autoFocus}
        onKeyDown={(event) => {
          if (!isReturn(event)) return
          event.preventDefault()
          event.currentTarget.blur()
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize={capitalise ? "words" : "off"}
        spellCheck={false}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="relative inline-flex size-5 items-center justify-center rounded-full bg-muted-foreground/40 text-background transition-opacity duration-150 after:absolute after:-inset-3 hover:opacity-70 active:opacity-50 active:duration-0"
          >
            <IconX aria-hidden className="size-3.5 stroke-3" />
          </button>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
