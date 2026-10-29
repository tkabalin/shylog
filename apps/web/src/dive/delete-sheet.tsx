import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { deleteDraft } from "@/data/drafts"
import { deleteDive } from "@/data/edits"
import { db } from "@/data/db"
import { draftChanged, upload } from "@/data/upload"
import { useDesk } from "@/hooks/use-desk"

// DiveDetailHifi's confirmation. A synced dive goes to Recently deleted; a
// draft never reached the server, so it goes for good. Calls `onDeleted`
// once the server has it, before the sync drops it from the log.
export function DeleteSheet({
  open,
  onOpenChange,
  diveId,
  draft,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  diveId: string
  draft: boolean
  onDeleted: () => void
}) {
  const desk = useDesk()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const body = draft
    ? "It hasn’t synced yet, so it’s removed from this phone straight away. It won’t go to Recently deleted."
    : "It leaves your log, stats and exports. You can restore it from Recently deleted."
  const cta = draft ? "Delete for good" : "Delete dive"

  const confirm = async () => {
    setBusy(true)
    setError(undefined)
    try {
      if (draft) {
        await deleteDraft(diveId)
        // An upload already under way may land it anyway, or its first
        // reply was lost; then the server has it, and it goes from there.
        await upload()
        if (await db.dives.get(diveId))
          await deleteDive(diveId, undefined, { settle: false })
        else await draftChanged()
      } else {
        // Gone before the sync shows it deleted under the closing sheet.
        await deleteDive(diveId, undefined, { settle: false })
      }
      onDeleted()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  const change = (next: boolean) => {
    if (busy) return
    if (!next) setError(undefined)
    onOpenChange(next)
  }

  const errorLine = error && (
    <p
      role="alert"
      className="text-center text-[13px] text-destructive desk:text-left"
    >
      {error}
    </p>
  )

  return (
    <Drawer showSwipeHandle open={open} onOpenChange={change}>
      {desk ? (
        <DrawerContent role="alertdialog">
          <DrawerHeader>
            <DrawerTitle>Delete this dive?</DrawerTitle>
            <DrawerDescription>{body}</DrawerDescription>
            {errorLine}
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={confirm}>
              {error ? "Try again" : cta}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      ) : (
        <DrawerContent role="alertdialog">
          <DrawerHeader className="pb-4">
            <DrawerTitle>Delete this dive?</DrawerTitle>
            <DrawerDescription>{body}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {errorLine}
            <Button
              variant="destructive"
              className="h-12 rounded-[14px] bg-destructive text-base font-semibold text-white hover:bg-destructive/90 dark:bg-red-600 dark:hover:bg-red-600/90"
              disabled={busy}
              onClick={confirm}
            >
              {error ? "Try again" : cta}
            </Button>
            <Button
              variant="ghost"
              className="h-12 rounded-[14px] text-base font-semibold text-primary"
              onClick={() => change(false)}
            >
              Cancel
            </Button>
          </div>
        </DrawerContent>
      )}
    </Drawer>
  )
}
