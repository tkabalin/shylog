import {
  useEffect,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react"
import { cn } from "cn"

import { IconSearch, IconX } from "@tabler/icons-react"

import { DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

// How much of the screen the on-screen keyboard covers. iOS doesn't shrink
// a full-height sheet for it, so its lists pad their ends by this much to
// scroll their last rows above it.
function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () =>
      setInset(
        Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      )
    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
    }
  }, [])
  return inset
}

// A picker sheet at full height, like an iOS page sheet: it stops a little
// below the status bar, so the form behind still shows at the top.
export function FullSheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DrawerContent>) {
  return (
    <DrawerContent
      className={cn(
        "h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] max-h-none md:mx-auto md:max-w-md md:border-x",
        className
      )}
      {...props}
    >
      <KeyboardInset>{children}</KeyboardInset>
    </DrawerContent>
  )
}

// Inside the popup, which mounts only while the sheet is open, so a closed
// sheet doesn't follow the keyboard. `contents` keeps the sheet's layout;
// the variable still reaches the lists below it.
function KeyboardInset({ children }: { children: ReactNode }) {
  const keyboard = useKeyboardInset()
  return (
    <div
      className="contents"
      style={{ "--keyboard": `${keyboard}px` } as CSSProperties}
    >
      {children}
    </div>
  )
}

// The sheet's bar: an action either side of a centred title, as on the
// boards' headers.
export function SheetBar({
  title,
  start,
  end,
}: {
  title: ReactNode
  start?: ReactNode
  end?: ReactNode
}) {
  return (
    <div className="grid h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-2">
      <span className="justify-self-start">{start}</span>
      <DrawerTitle>{title}</DrawerTitle>
      <span className="justify-self-end">{end}</span>
    </div>
  )
}

export function BarButton({
  className,
  strong,
  ...props
}: ComponentProps<"button"> & { strong?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 items-center gap-0.5 px-2 text-base text-primary transition-opacity duration-150 active:opacity-50 active:duration-0 disabled:text-muted-foreground/60 disabled:active:opacity-100",
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
  className,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  capitalise?: boolean
  maxLength?: number
  className?: string
}) {
  return (
    <InputGroup
      variant="filled"
      className={cn(
        "has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0",
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
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
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
            className="relative inline-flex size-5 items-center justify-center rounded-full bg-muted-foreground/40 text-background transition-opacity duration-150 after:absolute after:-inset-3 active:opacity-50 active:duration-0"
          >
            <IconX aria-hidden className="size-3.5 stroke-3" />
          </button>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
