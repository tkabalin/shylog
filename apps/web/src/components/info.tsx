import type { ReactNode } from "react"
import { IconInfoCircle } from "@tabler/icons-react"

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"

// Tapped, not hovered, so it works on a phone. The icon's hit area reaches
// 44px around it.
export function Info({
  term,
  title,
  children,
}: {
  term: string
  title: string
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${term}`}
        className="relative inline-grid size-4 shrink-0 place-items-center rounded-full outline-offset-2 transition-opacity duration-150 after:absolute after:-inset-3.5 hover:opacity-70 active:opacity-50 active:duration-0"
      >
        <IconInfoCircle aria-hidden className="size-[15px]" />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  )
}
