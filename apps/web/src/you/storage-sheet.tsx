import { useState, type ReactNode } from "react"
import { IconShieldCheck } from "@tabler/icons-react"
import { cn } from "cn"

import { diveCount } from "@/components/pickers/match"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { protect, useProtection } from "@/data/storage"
import { useSyncStatus } from "@/data/sync-status"
import { useDesk } from "@/hooks/use-desk"
import { listRow, pressable, RowContent } from "@/you/parts"

// SettingsHifi's Offline storage row under This device: whether the
// browser has promised to keep Shylog's data, opening help for keeping it.
export function StorageRow() {
  const protection = useProtection()
  const { unsynced } = useSyncStatus()
  const [open, setOpen] = useState(false)
  const ok = protection === "protected"
  // Nothing alarming until the browser has answered, a moment after launch.
  const bad = protection === "unprotected"
  // The sheet keeps what it opened with, so Keep them safe doesn't change
  // its buttons and copy as it closes.
  const [openedOk, setOpenedOk] = useState(ok)
  const n = unsynced.length
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpenedOk(ok)
          setOpen(true)
        }}
        aria-label={`Offline storage, ${ok ? "protected" : bad ? "not protected" : "checking"}. More about this`}
        className={cn(listRow, pressable, "min-h-15")}
      >
        <RowContent
          label="Offline storage"
          sub={
            ok ? (
              n ? (
                `${diveCount(n)} only on this phone, safe until they sync`
              ) : (
                "Dives saved on this phone won’t be cleared"
              )
            ) : bad ? (
              <span className="text-warn">
                Your browser may clear dives saved on this phone
                {n ? `, including ${n} not synced yet` : ""}
              </span>
            ) : null
          }
          value={
            ok ? (
              <span className="inline-flex items-center gap-1.25">
                <IconShieldCheck
                  aria-hidden
                  className="size-4 shrink-0 text-primary"
                />
                Protected
              </span>
            ) : bad ? (
              // Before the chevron, as SettingsHifi draws it.
              <span className="inline-flex h-8.5 shrink-0 items-center rounded-full bg-primary/12 px-3 text-sm font-medium text-primary">
                Keep them safe
              </span>
            ) : null
          }
          chevron
        />
      </button>
      <StorageSheet open={open} onOpenChange={setOpen} ok={openedOk} />
    </>
  )
}

function StorageSheet({
  open,
  onOpenChange,
  ok,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ok: boolean
}) {
  const desk = useDesk()
  const keep = async () => {
    await protect()
    onOpenChange(false)
  }
  const help = (
    <>
      <div className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {(
          [
            [
              "iPhone",
              // The menu path kept whole, never a line starting with ›.
              <>
                Open Shylog from your Home Screen. If it isn’t there, use
                Share&nbsp;›&nbsp;Add to Home Screen in Safari.
              </>,
            ],
            [
              "Android",
              "Tap Keep them safe and allow it when the browser asks.",
            ],
          ] satisfies [string, ReactNode][]
        ).map(([device, text]) => (
          <div key={device} className="flex gap-3 px-4 py-3">
            <span className="w-18.5 shrink-0 text-[13px] font-semibold">
              {device}
            </span>
            <span className="text-sm leading-[1.45] text-muted-foreground">
              {text}
            </span>
          </div>
        ))}
      </div>
      {ok && (
        <p className="-mt-1 flex items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
          <IconShieldCheck aria-hidden className="size-4 text-primary" />
          Protected on this phone.
        </p>
      )}
    </>
  )
  const body =
    "Dives you log without signal are saved on this phone until they sync. Browsers can clear a website’s saved data when the phone runs low on space. Protected storage asks the browser to keep Shylog’s data."
  return (
    <Drawer showSwipeHandle open={open} onOpenChange={onOpenChange}>
      {desk ? (
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Offline storage</DrawerTitle>
            {/* Filling the width, as the table below does, not balanced. */}
            <DrawerDescription className="text-pretty">
              {body}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-4 px-4 pt-2">{help}</div>
          <DrawerFooter>
            {ok ? (
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Not now
                </Button>
                <Button onClick={() => void keep()}>Keep them safe</Button>
              </>
            )}
          </DrawerFooter>
        </DrawerContent>
      ) : (
        <DrawerContent>
          <DrawerHeader className="pb-4">
            <DrawerTitle>Offline storage</DrawerTitle>
            <DrawerDescription>{body}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {help}
            <div className="flex flex-col gap-2">
              {!ok && (
                <Button
                  className="h-12 rounded-[14px] text-base font-semibold"
                  onClick={() => void keep()}
                >
                  Keep them safe
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-12 rounded-[14px] text-base font-semibold text-primary"
                onClick={() => onOpenChange(false)}
              >
                {ok ? "Done" : "Not now"}
              </Button>
            </div>
          </div>
        </DrawerContent>
      )}
    </Drawer>
  )
}
