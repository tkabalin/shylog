import type { ReactNode } from "react"
import { IconChevronRight } from "@tabler/icons-react"
import { cn } from "cn"

import type { Icon } from "@/dive/form/rows"

// SettingsHifi's `.row`: a label (with a line under it where there is
// one), a muted value on the right, and a chevron where it opens a screen.
// The caller wraps it in its link or button, styled with `listRow`.
export const listRow =
  "flex min-h-12 w-full items-center gap-3 py-2.5 pr-3 pl-4 text-left text-[15px] transition-colors duration-150 select-none [-webkit-touch-callout:none]"

// A tappable row darkens while pressed, as the form's do, since the tap
// flash is off app-wide.
export const pressable = "hover:bg-muted/60 active:bg-muted active:duration-0"

export function RowContent({
  icon: Icon,
  label,
  sub,
  value,
  chevron,
}: {
  icon?: Icon
  label: ReactNode
  sub?: ReactNode
  value?: ReactNode
  chevron?: boolean
}) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {Icon && (
            <Icon
              aria-hidden
              className="size-[1.15em] shrink-0 text-muted-foreground"
            />
          )}
          {label}
        </span>
        {sub && (
          <span className="mt-0.5 block text-[13px] text-muted-foreground in-disabled:text-muted-foreground/60">
            {sub}
          </span>
        )}
      </span>
      {/* A long value (a tailnet name) truncates rather than running into
          the label. */}
      {value != null && (
        <span className="max-w-3/5 min-w-0 truncate text-muted-foreground tabular-nums">
          {value}
        </span>
      )}
      {chevron && (
        <IconChevronRight
          aria-hidden
          className="size-4.5 shrink-0 text-muted-foreground/60"
        />
      )}
    </>
  )
}

// The explicit Save a section with fields gets once something in it
// changes (D7), under its card with Cancel to put the saved values back.
// A refusal shows beside them, and the values stay for Try again.
export function SaveLine({
  shown,
  busy,
  error,
  onSave,
  onCancel,
}: {
  shown: boolean
  busy: boolean
  error?: string
  onSave: () => void
  onCancel: () => void
}) {
  // It eases open under the card rather than pushing the page down on the
  // first keystroke, and folds away the same way once saved. Out of reach
  // while folded.
  return (
    <div
      inert={!shown}
      className={cn(
        // Hidden once folded: visibility flips at the end of a fold and the
        // start of an opening, so it never cuts the motion short.
        "grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out motion-reduce:transition-[opacity,visibility]",
        shown
          ? "visible grid-rows-[1fr] opacity-100"
          : "invisible grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="mt-2 flex items-center gap-2 px-1">
          <p
            role={error ? "alert" : undefined}
            className="min-w-0 flex-1 text-[13px] text-destructive"
          >
            {error}
          </p>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={cn(
              "inline-flex h-11 items-center px-3 text-[15px] font-medium text-muted-foreground transition-opacity duration-150 select-none hover:opacity-70 active:opacity-50 active:duration-0 disabled:opacity-50"
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="relative inline-flex h-9 items-center rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-inset-y-1 hover:opacity-85 active:opacity-70 active:duration-0 disabled:opacity-50"
          >
            {error ? "Try again" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
