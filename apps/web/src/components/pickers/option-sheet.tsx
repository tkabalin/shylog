import { IconCheck } from "@tabler/icons-react"
import { cn } from "cn"

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"

export interface Option<V extends string> {
  value: V
  label: string
}

// A choice field's options as a bottom sheet (D29): a tick on the chosen
// one, and Not set first where the field is optional. Picking closes it.
export function OptionSheet<V extends string>({
  open,
  onOpenChange,
  title,
  options,
  value,
  onChange,
  optional = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  options: Option<V>[]
  value: V | null
  onChange: (value: V | null) => void
  optional?: boolean
}) {
  const pick = (next: V | null) => {
    onChange(next)
    onOpenChange(false)
  }
  return (
    <Drawer showSwipeHandle open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="md:mx-auto md:max-w-md md:border-x">
        <DrawerHeader className="pb-4">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div
          role="listbox"
          aria-label={title}
          className="overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {optional && (
            <OptionRow
              label="Not set"
              selected={value == null}
              muted
              onClick={() => pick(null)}
            />
          )}
          {options.map((option) => (
            <OptionRow
              key={option.value}
              label={option.label}
              selected={value === option.value}
              onClick={() => pick(option.value)}
            />
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function OptionRow({
  label,
  selected,
  muted,
  onClick,
}: {
  label: string
  selected: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="flex min-h-13 w-full items-center gap-3 border-t px-4 py-2 text-left transition-colors duration-150 active:bg-muted active:duration-0"
    >
      <span
        className={cn(
          "flex-1 text-base font-medium",
          muted && "font-normal text-muted-foreground"
        )}
      >
        {label}
      </span>
      {selected && (
        <IconCheck aria-hidden className="size-5 shrink-0 text-primary" />
      )}
    </button>
  )
}
