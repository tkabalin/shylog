import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  IconAlertTriangle,
  IconCloudCheck,
  IconCloudOff,
  IconCloudPause,
  IconCloudUpload,
  IconDownload,
  IconRefresh,
  IconServerOff,
  IconWifiOff,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Fold, foldMs } from "@/components/fold"
import { Card } from "@/components/ui/card"
import type { Dive } from "@/data/db"
import { useQueueCounts } from "@/data/drafts"
import { saveFile } from "@/data/export"
import { waitingDivesFile } from "@/data/export-queue"
import { useLastSync } from "@/data/last-sync"
import { syncNow, useLog } from "@/data/log"
import { syncCard, useSyncStatus, type SyncCardLook } from "@/data/sync-status"
import { dayMonth } from "@/format/dates"
import { useDesk } from "@/hooks/use-desk"
import { reloadApp } from "@/pwa"
import { listRow, pressable, RowContent, SaveFailure } from "@/you/parts"

const icons: Record<SyncCardLook, typeof IconCloudCheck> = {
  synced: IconCloudCheck,
  first: IconRefresh,
  syncing: IconCloudUpload,
  waiting: IconCloudOff,
  offline: IconWifiOff,
  unreachable: IconServerOff,
  stuck: IconAlertTriangle,
  refused: IconAlertTriangle,
  paused: IconCloudPause,
}

// SettingsHifi's sync card, first on You: the state, the last sync, and
// while dives wait on this phone how many and how long the oldest has.
// Try again syncs at once, rather than waiting for the next retry.
export function SyncCard() {
  const { log } = useLog()
  const status = useSyncStatus()
  const syncedAt = useLastSync()
  const queued = useQueueCounts()
  const [trying, setTrying] = useState(false)
  const place = (dive: Dive) =>
    // The day stays on one line ("Sun 8 Nov").
    `${log?.sites.get(dive.siteId)?.name ?? "a dive"}, ${dayMonth(dive.startTime).replaceAll(" ", "\u00a0")}`
  const { look, title, sub, warn, retry, reload } = syncCard(status, {
    syncedAt,
    place,
  })
  const Icon = icons[look]
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span
          aria-hidden
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
            warn
              ? "bg-warn/12 text-warn"
              : look === "offline"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/12 text-primary"
          )}
        >
          <Icon className="size-[19px] stroke-[1.9]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span
            role="status"
            className="text-base font-semibold tracking-[-0.01em]"
          >
            {title}
          </span>
          <span className="text-[13px] text-pretty text-muted-foreground tabular-nums">
            {sub}
          </span>
          {/* Under the words rather than beside them, which left the title
            and line a third of the card to wrap in. */}
          {(retry || reload) && (
            <button
              type="button"
              disabled={trying}
              onClick={async () => {
                if (reload) return reloadApp()
                setTrying(true)
                await syncNow()
                setTrying(false)
              }}
              // Reaches 46px tall, past the 44px a finger needs.
              className="relative mt-2 inline-flex h-8.5 shrink-0 items-center gap-1.5 self-start rounded-full bg-primary/12 pr-3 pl-2.5 text-sm font-medium text-primary transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-inset-y-1.5 hover:opacity-70 active:opacity-50 active:duration-0 disabled:opacity-50"
            >
              <IconRefresh aria-hidden className="size-4" />
              {reload ? "Reload" : "Try again"}
            </button>
          )}
        </span>
      </div>
      {/* From the queue, which holds another tab's drafts before this
          tab's log does; mounted once it is read, so a row there from the
          start is drawn with the page rather than unfolding. */}
      {queued && (
        <RowFold show={queued.drafts > 0}>
          <SaveWaiting />
        </RowFold>
      )}
    </Card>
  )
}

// Fold for the row, mounted while shown and through its fold away. Drawn
// with the card it stays still; each later showing unfolds as a fresh fold,
// marked as it comes back, as one marked as it went snapped shut.
function RowFold({ show, children }: { show: boolean; children: ReactNode }) {
  const [drawn, setDrawn] = useState(show)
  const [mounted, setMounted] = useState(show)
  const [was, setWas] = useState(show)
  const [round, setRound] = useState(0)
  if (show !== was) {
    setWas(show)
    if (show) {
      setRound((n) => n + 1)
      setMounted(true)
      setDrawn(false)
    }
  }
  useEffect(() => {
    if (show) return
    const gone = setTimeout(() => setMounted(false), foldMs)
    return () => clearTimeout(gone)
  }, [show])
  if (!mounted) return null
  return (
    <Fold key={round} open={show} appear={!drawn} gap="0px">
      {children}
    </Fold>
  )
}

// SettingsHifi's row under the card while dives are only on this phone,
// refused ones too: the queue as a file, a last resort if the phone's
// storage is at risk. It needs no connection.
function SaveWaiting() {
  const desk = useDesk()
  const [error, setError] = useState<string>()
  // One share sheet at a time: a second tap while it's open would fail.
  const saving = useRef(false)
  const save = async () => {
    if (saving.current) return
    saving.current = true
    setError(undefined)
    try {
      await saveFile(await waitingDivesFile(), desk)
    } catch (failure) {
      setError(`Couldn’t save the file: ${(failure as Error).message}`)
    } finally {
      saving.current = false
    }
  }
  return (
    <div className="border-t">
      <button
        type="button"
        onClick={() => void save()}
        className={cn(listRow, pressable, "min-h-15")}
      >
        <RowContent
          label="Save waiting dives to a file"
          sub="A backup in case this phone clears its storage"
        />
        <IconDownload
          aria-hidden
          className="size-4.5 shrink-0 text-muted-foreground/60"
        />
      </button>
      {error && (
        <div className="px-4 pb-3">
          <SaveFailure error={error} />
        </div>
      )}
    </div>
  )
}
