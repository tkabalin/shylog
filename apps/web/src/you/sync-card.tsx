import { useState } from "react"
import {
  IconAlertTriangle,
  IconCloudCheck,
  IconCloudOff,
  IconCloudPause,
  IconCloudUpload,
  IconRefresh,
  IconServerOff,
  IconWifiOff,
} from "@tabler/icons-react"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import type { Dive } from "@/data/db"
import { useLastSync } from "@/data/last-sync"
import { syncNow, useLog } from "@/data/log"
import { syncCard, useSyncStatus, type SyncCardLook } from "@/data/sync-status"
import { dayMonth } from "@/format/dates"

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
  const [trying, setTrying] = useState(false)
  const place = (dive: Dive) =>
    // The day stays on one line ("Sun 8 Nov").
    `${log?.sites.get(dive.siteId)?.name ?? "a dive"}, ${dayMonth(dive.startTime).replaceAll(" ", "\u00a0")}`
  const { look, title, sub, warn, retry } = syncCard(status, {
    syncedAt,
    place,
  })
  const Icon = icons[look]
  return (
    <Card className="flex-row items-center gap-3 px-4 py-3.5">
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
        {retry && (
          <button
            type="button"
            disabled={trying}
            onClick={async () => {
              setTrying(true)
              await syncNow()
              setTrying(false)
            }}
            // Reaches 46px tall, past the 44px a finger needs.
            className="relative mt-2 inline-flex h-8.5 shrink-0 items-center gap-1.5 self-start rounded-full bg-primary/12 pr-3 pl-2.5 text-sm font-medium text-primary transition-opacity duration-150 select-none after:absolute after:inset-x-0 after:-inset-y-1.5 hover:opacity-70 active:opacity-50 active:duration-0 disabled:opacity-50"
          >
            <IconRefresh aria-hidden className="size-4" />
            Try again
          </button>
        )}
      </span>
    </Card>
  )
}
