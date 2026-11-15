import { useState, type ReactNode } from "react"
import { IconShieldCheck } from "@tabler/icons-react"
import { cn } from "cn"

import { diveCount } from "@/components/pickers/match"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { protect, useProtection } from "@/data/storage"
import { useSyncStatus } from "@/data/sync-status"
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
                `${diveCount(n)} only on this device, safe until they sync`
              ) : (
                "Dives saved on this device won’t be cleared"
              )
            ) : bad ? (
              <span className="text-warn">
                Your browser may clear dives saved on this device
                {n ? `, including ${n} not synced yet` : ""}
              </span>
            ) : null
          }
          // No Keep them safe pill when it isn't, as SettingsHifi draws one:
          // the warning and the chevron already say it, and on iOS the
          // sheet has no such button.
          value={
            ok ? (
              <span className="inline-flex items-center gap-1.25">
                <IconShieldCheck
                  aria-hidden
                  className="size-4 shrink-0 text-primary"
                />
                Protected
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

// Which help to show: only the device's own, both where it's neither.
// iPadOS reports itself as a Mac, told apart by its touch screen.
function platform() {
  const agent = navigator.userAgent
  if (
    /iPhone|iPad|iPod/.test(agent) ||
    (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
  )
    return "iPhone"
  return /Android/.test(agent) ? "Android" : null
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {steps.map((step, i) => (
        <li key={step} className="flex items-baseline gap-2">
          <Badge variant="secondary" aria-hidden className="tabular-nums">
            {i + 1}
          </Badge>
          {step}
        </li>
      ))}
    </ol>
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
  const device = platform()
  // iOS never asks and keeps data mainly for a Home Screen app, so Keep
  // them safe would do nothing there; the steps say what does.
  const ios = device === "iPhone"
  const ask = !ok && !ios
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
              // WebKit keeps the data of an app on the Home Screen.
              <Steps
                steps={[
                  // Apple's words for Safari's default, compact layout.
                  "In Safari, tap ⋯, then Share.",
                  "Tap Add to Home Screen, turn on Open as Web App, then tap Add.",
                  "Open Shylog from its Home Screen icon.",
                ]}
              />,
            ],
            [
              "Android",
              // Chrome grants it without asking, sooner to an installed app;
              // Firefox asks.
              <Steps
                steps={[
                  "In your browser’s menu, tap Add to Home screen.",
                  "Open Shylog from its Home Screen icon, then tap Keep them safe.",
                ]}
              />,
            ],
          ] satisfies [string, ReactNode][]
        )
          .filter(([name]) => !device || name === device)
          .map(([name, text], _, rows) => (
            <div key={name} className="flex gap-3 px-4 py-3">
              {rows.length > 1 && (
                <span className="w-18.5 shrink-0 text-[13px] font-semibold">
                  {name}
                </span>
              )}
              <div className="text-sm leading-[1.45] text-muted-foreground">
                {text}
              </div>
            </div>
          ))}
      </div>
      {ok && (
        <p className="-mt-1 flex items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
          <IconShieldCheck aria-hidden className="size-4 text-primary" />
          Protected on this device.
        </p>
      )}
    </>
  )
  // On iOS no button asks the browser, so the body stops before saying so.
  const body = `Dives you log without signal are saved on this device until they sync. Browsers can clear a website’s saved data when the device runs low on space.${ios ? "" : " Protected storage asks the browser to keep Shylog’s data."}`
  return (
    <Drawer showSwipeHandle open={open} onOpenChange={onOpenChange}>
      {/* Phones only (You leaves the row out on a desk), so its iOS layout
          has no desk version. */}
      <DrawerContent>
        <DrawerHeader className="pb-4">
          <DrawerTitle>Offline storage</DrawerTitle>
          <DrawerDescription>{body}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {help}
          <div className="flex flex-col gap-2">
            {ask && (
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
              {ask ? "Not now" : "Done"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
