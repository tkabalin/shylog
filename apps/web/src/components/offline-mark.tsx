import { useEffect, useState } from "react"
import { IconServerOff, IconWifiOff } from "@tabler/icons-react"
import { cn } from "cn"

import { useOnline } from "@/data/sync-status"

// A screen's sign that what needs the server is disabled for now, in its
// bar: wifi-off offline, server-off when the server can't be reached. The
// disabled controls are the message, so no words say it again.
export function OfflineMark({
  show,
  className,
}: {
  show: boolean
  className?: string
}) {
  const online = useOnline()
  // Faded in only when the signal goes with the screen open, not when the
  // screen is drawn offline.
  const [live, setLive] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLive(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  if (!show) return null
  const Icon = online ? IconServerOff : IconWifiOff
  return (
    <Icon
      role="img"
      aria-label={online ? "Can’t reach the server" : "Offline"}
      className={cn(
        "size-[18px] shrink-0 text-muted-foreground transition-opacity duration-150 ease-out",
        live && "starting:opacity-0",
        className
      )}
    />
  )
}
