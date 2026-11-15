import { lazy, Suspense, useEffect, useState } from "react"
import type { Packing } from "@shylog/core"
import { IconCheck, IconRotate } from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { cn } from "cn"
import { toast } from "sonner"

import { OfflineMark } from "@/components/offline-mark"
import { countText } from "@/components/pickers/match"
import { BarButton } from "@/components/pickers/sheet"
import { Progress } from "@/components/progress"
import { RollingNumber } from "@/components/rolling-number"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { currentLog, useLog } from "@/data/log"
import {
  itemIds,
  packedCount,
  pruneTicks,
  resetTicks,
  restoreTicks,
  toggleTick,
  usePackingTicks,
} from "@/data/packing"
import { useConnected } from "@/data/sync-status"
import { useDesk } from "@/hooks/use-desk"
import { Haptic } from "@/lib/haptic"
import { PageBar } from "@/you/bar"
import { listRow, pressable } from "@/you/parts"

// Edit mode is opened now and then, so it loads when first wanted.
const loadEditList = () => import("@/you/packing-edit")
const EditList = lazy(() =>
  loadEditList().then((module) => ({ default: module.EditList }))
)

export const Route = createFileRoute("/you/packing")({
  component: PackingPage,
})

const back = { label: "You", to: "/you" } as const
const empty: Packing = { sections: [] }

// The packing checklist, ticked off on this phone, and edited for every
// device in Edit mode, which needs the server.
function PackingPage() {
  const { log, loaded } = useLog()
  const connected = useConnected()
  const desk = useDesk()
  const ticked = usePackingTicks()
  const [editing, setEditing] = useState(false)
  const packing = log?.packing
  // A tick on an item deleted here or on another phone goes with it.
  useEffect(() => {
    if (packing) pruneTicks(packing)
  }, [packing])
  if (!loaded) return null
  if (editing && packing) {
    return (
      <Suspense
        fallback={
          <PageBar back={back} title="Edit list" crumb="Packing list" />
        }
      >
        <EditList
          packing={packing}
          back={back}
          onClose={() => setEditing(false)}
        />
      </Suspense>
    )
  }
  const edit = desk ? (
    <Button
      variant="outline"
      disabled={!connected || !packing}
      onPointerDown={() => void loadEditList()}
      onClick={() => setEditing(true)}
    >
      Edit
    </Button>
  ) : (
    <BarButton
      disabled={!connected || !packing}
      onPointerDown={() => void loadEditList()}
      onClick={() => setEditing(true)}
    >
      Edit
    </BarButton>
  )
  return (
    <div className="flex min-h-full flex-col">
      <PageBar
        back={back}
        title="Packing list"
        end={
          <>
            <OfflineMark show={!connected} className="mx-1" />
            {edit}
          </>
        }
      />
      {/* Nothing until the first sync has filled the log. */}
      {packing && <Checklist packing={packing} ticked={ticked} />}
    </div>
  )
}

function Checklist({
  packing,
  ticked,
}: {
  packing: Packing
  ticked: ReadonlySet<string>
}) {
  const total = itemIds(packing).length
  if (!total) {
    return (
      <p className="flex flex-1 items-center justify-center px-7 pb-15 text-center text-sm text-muted-foreground">
        Nothing on the list yet
      </p>
    )
  }
  const packed = packedCount(packing, ticked)
  return (
    <div className="flex flex-col gap-6 px-4 pt-2 pb-10 md:mx-auto md:w-full md:max-w-xl">
      <Summary packed={packed} total={total} />
      {packing.sections
        .filter((section) => section.items.length)
        .map((section) => {
          const done = section.items.filter((item) => ticked.has(item.id))
          const all = done.length === section.items.length
          return (
            <section key={section.id} aria-labelledby={section.id}>
              <h2 className="mb-2 flex items-start gap-3 px-1 text-[13px] font-semibold text-muted-foreground">
                <span id={section.id} className="min-w-0 flex-1 break-words">
                  {section.name}
                </span>
                <span className="flex h-[1lh] shrink-0 items-center font-medium tabular-nums">
                  {all ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <IconCheck
                        aria-hidden
                        className="size-3.5 stroke-[2.5]"
                      />
                      All packed
                    </span>
                  ) : (
                    `${done.length} of ${section.items.length}`
                  )}
                </span>
              </h2>
              <Card className="gap-0 divide-y py-0">
                {section.items.map((item) => (
                  <TickRow
                    key={item.id}
                    name={item.name}
                    on={ticked.has(item.id)}
                    onToggle={() => toggleTick(item.id)}
                  />
                ))}
              </Card>
            </section>
          )
        })}
    </div>
  )
}

// What's left to pack, large, over the bar, with Reset beside it.
function Summary({ packed, total }: { packed: number; total: number }) {
  const left = total - packed
  // Whether anything was left to pack during this visit: the last tick
  // earns a small moment, a list opened all packed simply says so.
  const [counting, setCounting] = useState(left > 0)
  if (left > 0 && !counting) setCounting(true)
  const reset = () => {
    const cleared = resetTicks()
    toast("Ticks cleared", {
      action: {
        label: "Undo",
        // Against the list as it is by then, which an edit may have changed.
        onClick: () => restoreTicks(cleared, currentLog()?.packing ?? empty),
      },
    })
  }
  return (
    <section aria-label="Progress" className="flex flex-col gap-2.5 px-1 pt-2">
      <div className="flex h-11 items-end justify-between gap-3">
        {/* Keyed apart, so the finished header is a new element and its
            pop runs rather than the old one being restyled. */}
        {left ? (
          <p key="left" className="flex items-baseline gap-1.5">
            <span className="text-[44px] leading-none font-semibold tracking-[-0.035em] tabular-nums">
              <RollingNumber value={left} text={countText(left)} />
            </span>
            <span className="text-[17px] text-muted-foreground">to pack</span>
          </p>
        ) : (
          <p key="done" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground",
                counting &&
                  "transition-[scale,opacity] duration-200 ease-out starting:scale-90 starting:opacity-0 motion-reduce:starting:scale-100"
              )}
            >
              <IconCheck className="size-5.5 stroke-[2.75]" />
            </span>
            <span
              className={cn(
                "text-[28px] leading-none font-semibold tracking-[-0.03em]",
                counting &&
                  "transition-[translate,opacity] duration-200 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
              )}
            >
              All packed
            </span>
          </p>
        )}
        <button
          type="button"
          disabled={!packed}
          onClick={reset}
          className="relative inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-full bg-primary/12 pr-3 pl-2.5 text-sm font-medium text-primary transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-inset-y-1.5 hover:opacity-70 active:opacity-50 active:duration-0 disabled:opacity-50"
        >
          <IconRotate aria-hidden className="size-4" />
          Reset
        </button>
      </div>
      <Progress label="Packed" value={packed / total} tap />
      <p className="text-[13px] text-muted-foreground tabular-nums">
        {countText(packed)} of {countText(total)} packed
      </p>
    </section>
  )
}

// A whole row ticks its item, with the switch's haptic on an iPhone.
function TickRow({
  name,
  on,
  onToggle,
}: {
  name: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        listRow,
        pressable,
        "relative gap-3 text-base tracking-[-0.01em] has-data-press:bg-muted has-data-press:duration-0"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-150 ease-out",
          on
            ? "bg-primary text-primary-foreground"
            : "ring-[1.75px] ring-muted-foreground/55 ring-inset"
        )}
      >
        <IconCheck
          className={cn(
            "size-[15px] stroke-3 transition-[scale,opacity] duration-150 ease-out motion-reduce:scale-100 motion-reduce:transition-opacity",
            on ? "scale-100 opacity-100" : "scale-50 opacity-0"
          )}
        />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 break-words transition-colors duration-150",
          on && "text-muted-foreground"
        )}
      >
        {name}
      </span>
      <Haptic />
    </button>
  )
}
