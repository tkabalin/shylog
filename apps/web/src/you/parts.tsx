import type { ReactNode } from "react"
import { IconChevronRight } from "@tabler/icons-react"

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

// Why a change on You didn't save. The sections save as you go, so the
// field already shows the saved value again, ready to be changed again.
export function SaveFailure({ error }: { error?: string }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-2 px-1 text-[13px] text-destructive">
      {error}
    </p>
  )
}
