import {
  IconAlertTriangle,
  IconCloudOff,
  IconCloudUpload,
} from "@tabler/icons-react"
import { cn } from "cn"

import type { Dive } from "@/data/db"
import { useSyncStatus, type SyncState } from "@/data/sync-status"

const when: Record<SyncState, string> = {
  synced: "Syncing now",
  syncing: "Syncing now",
  offline: "Syncs when you’re back online",
  unreachable: "Can’t reach the server. Is Tailscale on?",
  fault: "The server ran into a problem. It tries again soon",
  stuck: "The server couldn’t save it. It tries again soon",
  refused: "Syncing now",
  paused: "Waits until Shylog is updated",
}

// DiveDetailHifi's unsynced strip: a draft is saved on this phone until it
// uploads, and says when that will be. One the server refused gives its
// reason instead, in the warning colour, until an edit sends it again.
export function UnsyncedBanner({ dive }: { dive: Dive }) {
  const { state } = useSyncStatus()
  const refused = dive.rejected != null
  // The upload icon wherever the line says Syncing now, the last frame
  // before it folds away included.
  const Icon = refused
    ? IconAlertTriangle
    : when[state] === when.syncing
      ? IconCloudUpload
      : IconCloudOff
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-13 items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm",
        refused ? "bg-warn/10" : "bg-primary/8"
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-4.5 shrink-0",
          refused ? "text-warn" : "text-primary"
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span>
          {refused ? "The server refused this dive" : "Saved on this phone"}
        </span>
        {/* Darker than muted, which falls short of 4.5:1 on the tint. */}
        <span className="text-[13px] [overflow-wrap:anywhere] text-foreground/60">
          {refused ? dive.rejected : when[state]}
        </span>
      </span>
    </div>
  )
}
