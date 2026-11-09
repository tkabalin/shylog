import { useEffect, useState } from "react"
import {
  IconAlertTriangle,
  IconCloudPause,
  IconCloudUpload,
  IconServerOff,
  IconWifiOff,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

import shyshark from "@/assets/shyshark.svg"
import { countText, diveCount } from "@/components/pickers/match"
import { useSyncStatus, type SyncState } from "@/data/sync-status"

const looks: Record<
  Exclude<SyncState, "synced">,
  { icon: typeof IconWifiOff; spoken: string; warn?: true }
> = {
  offline: { icon: IconWifiOff, spoken: "Offline" },
  unreachable: {
    icon: IconServerOff,
    spoken: "Can’t reach the server",
    warn: true,
  },
  syncing: { icon: IconCloudUpload, spoken: "Syncing" },
  stuck: {
    icon: IconAlertTriangle,
    spoken: "Not synced, the server couldn’t save them",
    warn: true,
  },
  refused: { icon: IconAlertTriangle, spoken: "Not synced", warn: true },
  paused: { icon: IconCloudPause, spoken: "Syncing paused", warn: true },
}

const sharkImage = (
  <img
    src={shyshark}
    alt=""
    width={48}
    height={48}
    className="size-12 drop-shadow-[0_2px_3px_rgb(42_26_10/0.25)] dark:drop-shadow-none"
  />
)

// The app icon's shyshark, so the Log carries the brand. It wears the sync
// status (see Mobile rules in the spec) as an app icon wears a badge: none
// when everything is synced, in the accent colour, and in the warning colour
// where the diver has to act. Badged, it opens the You tab, sideways, as a tab does.
export function SyncShark() {
  const { state, unsynced, waiting } = useSyncStatus()
  // Faded in only when it appears with the Log on screen, not each time
  // the Log mounts (a tab switch, back from a dive).
  const [live, setLive] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLive(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  if (state === "synced") return sharkImage
  const { icon: Icon, spoken, warn } = looks[state]
  // Under Not synced, every dive the server hasn't taken, refused ones
  // included; otherwise those waiting to upload.
  const n =
    state === "refused" || state === "stuck" ? unsynced.length : waiting.length
  return (
    <Link
      to="/you"
      replace
      aria-label={`${spoken}${n ? `, ${diveCount(n)} not synced yet` : ""}. Open sync status`}
      className="relative transition-opacity duration-150 ease-out select-none [-webkit-touch-callout:none] active:opacity-50 active:duration-0 desk:hover:opacity-70"
    >
      {sharkImage}
      {/* It fades in rather than popping onto the shark as the state
          changes; it goes at once, as the state it showed is over. */}
      <span
        className={cn(
          "absolute -top-1.5 -right-2 inline-flex h-5.5 items-center gap-1 rounded-full px-1.5 text-xs font-semibold tabular-nums ring-2 ring-background transition-opacity duration-150 ease-out",
          // Filled, as a pale tint was lost against the shark.
          warn ? "bg-warn text-white" : "bg-primary text-primary-foreground",
          live && "starting:opacity-0"
        )}
      >
        <Icon aria-hidden className="size-3.5 stroke-[2.25]" />
        {n > 0 && countText(n)}
      </span>
    </Link>
  )
}
