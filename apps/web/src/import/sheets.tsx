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

import { bigButton } from "./parts"

// A question with two answers, as DiveDetailHifi's delete sheet: the
// answers stacked on a phone, the main one first, and in a dialog's footer
// with a mouse.
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  body,
  confirm,
  cancel,
  destructive,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: ReactNode
  confirm: string
  cancel: string
  destructive?: boolean
  busy?: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const desk = useDesk()
  const errorLine = error && (
    <p
      role="alert"
      className="text-center text-[13px] text-destructive desk:text-left"
    >
      {error}
    </p>
  )
  return (
    <Drawer
      showSwipeHandle
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
    >
      <DrawerContent role="alertdialog">
        <DrawerHeader className={desk ? undefined : "pb-4"}>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{body}</DrawerDescription>
          {desk && errorLine}
        </DrawerHeader>
        {desk ? (
          <DrawerFooter>
            <Button variant="outline" disabled={busy} onClick={onCancel}>
              {cancel}
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={busy}
              onClick={onConfirm}
            >
              {confirm}
            </Button>
          </DrawerFooter>
        ) : (
          <div className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {errorLine}
            <Button
              variant={destructive ? "destructive" : "default"}
              className={
                destructive
                  ? `${bigButton} bg-destructive text-white hover:bg-destructive/90 dark:bg-red-600 dark:hover:bg-red-600/90`
                  : bigButton
              }
              disabled={busy}
              onClick={onConfirm}
            >
              {confirm}
            </Button>
            <Button
              variant="ghost"
              className={`${bigButton} text-primary`}
              disabled={busy}
              onClick={onCancel}
            >
              {cancel}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
