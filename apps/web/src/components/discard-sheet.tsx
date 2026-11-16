import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { useDesk } from "@/hooks/use-desk"

// Asked before edits that aren't saved are thrown away: on a desktop as
// shadcn's alert dialogs ask, on a phone as an action sheet clear of the
// home indicator. Dismissing it keeps editing.
export function DiscardSheet({
  open,
  title = "Discard changes?",
  note,
  cta = "Discard changes",
  className,
  onKeep,
  onDiscard,
}: {
  open: boolean
  title?: string
  note: ReactNode
  cta?: string
  // The desktop dialog's placement, such as centred over the card viewer.
  className?: string
  onKeep: () => void
  onDiscard: () => void
}) {
  const desk = useDesk()
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onKeep()}>
      {desk ? (
        <DrawerContent className={className}>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{note}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="outline" onClick={onKeep}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={onDiscard}>
              {cta}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      ) : (
        <DrawerContent>
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <div className="flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="pb-1 text-center text-[13px] text-muted-foreground">
              {note}
            </p>
            <Button
              variant="outline"
              className="h-12 rounded-[14px] text-base font-semibold text-destructive"
              onClick={onDiscard}
            >
              {cta}
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-[14px] text-base font-semibold"
              onClick={onKeep}
            >
              Keep editing
            </Button>
          </div>
        </DrawerContent>
      )}
    </Drawer>
  )
}
