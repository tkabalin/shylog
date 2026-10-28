import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react"
import {
  IconArrowBackUp,
  IconCalculator,
  IconCheck,
  IconChevronRight,
  IconDeviceWatch,
  IconX,
  type IconProps,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Haptic } from "@/lib/haptic"

// The pieces of EditDiveHifi's form: a section heading over a card of rows,
// each row a muted label on the left and its value, right-aligned, in the
// board's 46 px row (`.frow`, `.fin`, `.pick`, `.fblock`, `.seg`).

export type Icon = ComponentType<IconProps>

export function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const id = `form-${title.toLowerCase().replace(/\W+/g, "-")}`
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground"
      >
        {title}
      </h2>
      <Card className="gap-0 divide-y py-0">{children}</Card>
    </section>
  )
}

export function Label({
  icon: Icon,
  children,
  htmlFor,
  id,
  after,
  className,
}: {
  icon?: Icon
  children: ReactNode
  htmlFor?: string
  id?: string
  // The computer or calculated marker, or its reset button.
  after?: ReactNode
  className?: string
}) {
  const Tag = htmlFor ? "label" : "span"
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5", className)}>
      <Tag
        htmlFor={htmlFor}
        id={id}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        {Icon && <Icon aria-hidden className="size-[1.15em] shrink-0" />}
        {children}
      </Tag>
      {after}
    </span>
  )
}

// A row with what belongs under it (a difference from the computer, an
// error), grouped so the card's divider never splits a field from its note.
export function Field({
  children,
  under,
}: {
  children: ReactNode
  under?: ReactNode
}) {
  return (
    <div>
      {children}
      {under}
    </div>
  )
}

export function Row({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        // A keyboard's place shows as a ring round the row, as shadcn's inputs
        // ring, since the row's own controls are borderless.
        "flex min-h-11.5 items-center gap-3 px-4 desk:has-[:is(input,textarea,button):focus-visible]:ring-2 desk:has-[:is(input,textarea,button):focus-visible]:ring-ring/50 desk:has-[:is(input,textarea,button):focus-visible]:ring-inset",
        className
      )}
    >
      {children}
    </div>
  )
}

// A tappable row highlights as a whole while pressed (or, with a mouse,
// while its control is hovered), as the sheets' rows do, since the tap
// flash is off app-wide (index.css).
export const pressedRow =
  "transition-colors duration-150 control-hover:bg-muted/60 has-[:active]:bg-muted has-[:active]:duration-0"

// Small inline buttons dim on touch-down and recover on release, as the
// bar buttons do.
const pressedButton =
  "transition-opacity duration-150 hover:opacity-70 active:opacity-50 active:duration-0"

// The board's borderless, right-aligned input. 16 px text, so iOS doesn't
// zoom in on focus. A dash only marks an empty box, so it goes once the
// caret is in it, where it would read as a typed minus.
export function RowInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      autoComplete="off"
      // The form has no submit button, so Return would do nothing: it
      // closes the keyboard instead.
      enterKeyHint="done"
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      className={cn(
        "h-11.5 w-full min-w-0 flex-1 bg-transparent text-right text-base font-medium text-ellipsis tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground/60",
        props.placeholder === "—" && "focus:placeholder:text-transparent",
        className
      )}
      {...props}
    />
  )
}

export function Unit({ children }: { children: ReactNode }) {
  return (
    <span className="min-w-5.5 shrink-0 text-sm text-muted-foreground">
      {children}
    </span>
  )
}

// A row that opens a picker: the value, or "Choose" faintly, then a chevron.
export function PickRow({
  icon,
  label,
  value,
  more,
  onClick,
  describedBy,
  invalid,
}: {
  icon?: Icon
  label: string
  value: string | null | undefined
  // How many more are chosen ("+ 12"), kept clear of the value's ellipsis.
  more?: string
  onClick: () => void
  describedBy?: string
  invalid?: boolean
}) {
  return (
    <Row className={pressedRow}>
      <Label icon={icon}>{label}</Label>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label}, ${value ?? "not set"}${more ? ` ${more}` : ""}`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="flex h-11.5 min-w-0 flex-1 items-center justify-end gap-1 text-right text-base font-medium desk:outline-none"
      >
        <span className={cn("truncate", !value && "text-muted-foreground/60")}>
          {value ?? "Choose"}
        </span>
        {more && <span className="shrink-0 tabular-nums">{more}</span>}
        <IconChevronRight
          aria-hidden
          className="size-4.5 shrink-0 text-muted-foreground/60"
        />
      </button>
    </Row>
  )
}

// A labelled block for controls wider than a row: chips, segments, pairs.
export function Block({
  label,
  icon,
  id,
  children,
  className,
}: {
  label: ReactNode
  icon?: Icon
  id: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={cn("flex flex-col gap-2 px-4 py-3", className)}
    >
      <Label icon={icon} id={id}>
        {label}
      </Label>
      {children}
    </div>
  )
}

// A half of a two-up pair (volume, pressures, temperatures): a small label
// over a left-aligned value.
export function PairInput({
  label,
  unit,
  className,
  after,
  ...props
}: ComponentProps<"input"> & {
  label: string
  unit: string
  after?: ReactNode
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-0.5 py-0.5", className)}>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {after}
      </span>
      {/* The value on the left and its unit at the column's right edge, as
          on the board. */}
      <span className="flex items-baseline gap-1">
        <RowInput {...props} className="h-6.5 text-left" />
        <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>
      </span>
    </label>
  )
}

// The board's segmented control. Tapping the chosen option again clears
// it, so an optional field can be emptied without a "Not set" option.
export function Segmented<V extends string>({
  labelledBy,
  value,
  onChange,
  options,
  className,
  compact,
}: {
  labelledBy: string
  value: V | null
  onChange: (value: V | null) => void
  options: { value: V; label: string; icon?: Icon }[]
  className?: string
  // Four options with icons need the board's smaller 13 px text to fit.
  compact?: boolean
}) {
  const index = options.findIndex((option) => option.value === value)
  const count = options.length
  // The thumb slides between options, but fades in place when the field is
  // filled or cleared, so it never sweeps in from the first option.
  const [was, setWas] = useState(index)
  const [placed, setPlaced] = useState(Math.max(index, 0))
  const [slide, setSlide] = useState(false)
  if (was !== index) {
    setWas(index)
    setSlide(was >= 0 && index >= 0)
    if (index >= 0) setPlaced(index)
  }
  return (
    <ToggleGroup
      aria-labelledby={labelledBy}
      value={value ? [value] : []}
      onValueChange={(next) => onChange((next[0] as V | undefined) ?? null)}
      spacing={0.5}
      className={cn(
        "relative grid w-full auto-cols-fr grid-flow-col rounded-[10px] bg-muted p-0.5",
        className
      )}
    >
      {/* One raised thumb for the chosen option, as an iOS segmented
          control has. The drawer curve moves on the first frame, so it
          isn't lag, but slower than ease-out, which read as a snap. */}
      <span
        aria-hidden
        style={{
          width: `calc((100% - 4px - ${count - 1} * 2px) / ${count})`,
          transform: `translateX(calc(${placed} * (100% + 2px)))`,
        }}
        className={cn(
          "absolute inset-y-0.5 left-0.5 rounded-lg bg-card shadow-xs ring-1 ring-foreground/10",
          slide
            ? "transition-[transform,opacity] duration-300 ease-drawer motion-reduce:transition-opacity"
            : "transition-opacity duration-150 ease-out",
          index < 0 && "opacity-0"
        )}
      />
      {options.map(({ value: option, label, icon: Icon }) => (
        <ToggleGroupItem
          key={option}
          value={option}
          className={cn(
            "relative h-10 min-w-0 gap-1.5 rounded-lg px-1 text-sm font-medium",
            compact && "gap-1 px-0.5 text-[13px]",
            // Below 375 px the words need the icons' room to fit.
            "max-[374px]:text-[13px] max-[374px]:[&_svg]:hidden",
            // The label turns with the thumb, and dims on touch-down, before
            // the tap lands.
            "cursor-pointer text-muted-foreground transition-[color,opacity] duration-300 ease-drawer hover:bg-transparent hover:text-muted-foreground active:opacity-50 active:duration-0 aria-pressed:bg-transparent aria-pressed:text-foreground data-pressed:bg-transparent"
          )}
        >
          {Icon && <Icon aria-hidden className="size-4" />}
          <span className="truncate">{label}</span>
          <Haptic />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// Whether the form is on screen yet: rows present when it opens appear with
// it, and only those a choice reveals afterwards ease open.
export const FormShown = createContext<{ current: boolean }>({ current: true })

// Rows a choice reveals (Oxygen, the training details, Distance) ease open
// rather than jumping everything below them down. Removal snaps, as the
// diver's own tap closed it.
export function Reveal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const shown = useContext(FormShown)
  const [animate] = useState(() => shown.current)
  return (
    <div
      className={cn(
        "grid grid-rows-[1fr] opacity-100",
        animate &&
          "transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-opacity starting:grid-rows-[0fr] starting:opacity-0"
      )}
    >
      <div className={cn("min-h-0 overflow-hidden", className)}>{children}</div>
    </div>
  )
}

// Where a value came from: the dive computer, or Shylog's own calculation.
export function Marker({
  source,
  computer,
}: {
  source: "computer" | "calculated"
  computer: string
}) {
  const Icon = source === "computer" ? IconDeviceWatch : IconCalculator
  const text =
    source === "computer" ? `From the ${computer}` : "Calculated by Shylog"
  return (
    <span className="inline-flex text-muted-foreground/60" title={text}>
      <Icon aria-hidden className="size-3.75" />
      <span className="sr-only">{text}</span>
    </span>
  )
}

// The marker once the value is edited: puts the original back.
export function ResetButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      // Visually 15 px like the marker it replaces; the tap area is 44 px.
      className={cn(
        "relative -my-1 inline-flex size-6 items-center justify-center text-primary after:absolute after:-inset-2.5",
        pressedButton
      )}
    >
      <IconArrowBackUp aria-hidden className="size-4.5" />
    </button>
  )
}

// A hand value the computer disagrees with: the computer's value on its own
// line under the field, with ✓ to use it and ✕ to keep yours (D14). The two
// buttons line up with the values above them, right-aligned.
export function DifferenceLine({
  computer,
  text,
  what,
  onUse,
  onKeep,
}: {
  computer: string
  text: string
  what: string
  onUse: () => void
  onKeep: () => void
}) {
  return (
    <div
      role="group"
      aria-label={`The ${computer} recorded a different ${what}`}
      className="-mt-1 flex items-center gap-1.5 pr-2 pb-1.5 pl-4 text-[13px] text-muted-foreground tabular-nums"
    >
      <IconDeviceWatch aria-hidden className="size-3.5 shrink-0" />
      {/* A long model name wraps; the value itself never splits. */}
      <span className="min-w-0 flex-1">
        {computer}: <span className="whitespace-nowrap">{text}</span>
      </span>
      <button
        type="button"
        aria-label={`Use ${computer} value`}
        onClick={onUse}
        className={cn(
          "relative inline-flex h-8 w-9 items-center justify-center text-primary after:absolute after:-inset-y-1.5",
          pressedButton
        )}
      >
        <IconCheck aria-hidden className="size-4.5" />
      </button>
      <button
        type="button"
        aria-label="Keep mine"
        onClick={onKeep}
        className={cn(
          "relative inline-flex h-8 w-9 items-center justify-center after:absolute after:-inset-y-1.5",
          pressedButton
        )}
      >
        <IconX aria-hidden className="size-4.5" />
      </button>
    </div>
  )
}

export function ErrorLine({
  id,
  message,
  inBlock,
  align = "right",
}: {
  id: string
  message?: string
  // Inside a block, which already has the card's side padding.
  inBlock?: boolean
  // Under the left of two columns (the minimum temperature).
  align?: "left" | "right"
}) {
  if (!message) return null
  return (
    <p
      id={id}
      className={cn(
        "text-[13px] text-destructive",
        align === "left" ? "text-left" : "text-right",
        inBlock ? "-mt-1" : "-mt-1.5 px-4 pb-2.5"
      )}
    >
      {message}
    </p>
  )
}
