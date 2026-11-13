import type { ReactNode } from "react"
import { IconCloudOff, IconRefresh, IconServerBolt } from "@tabler/icons-react"

import { reloadApp } from "@/pwa"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { syncNow, useLog } from "@/data/log"

// A tab with no log yet: the skeleton while the mirror is read or a first
// sync fills it, and if that sync fails, why, with another try. A newer
// server's offer to reload is a toast once there is a log (UpdateToast).
export function NoLog({
  title,
  skeleton,
}: {
  title: string
  skeleton: ReactNode
}) {
  const { loaded, blocked, reach } = useLog()
  return (
    <div className="flex min-h-full flex-col pt-[env(safe-area-inset-top)]">
      <h1 className="sr-only">{title}</h1>
      {blocked && (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="accent">
              <IconRefresh />
            </EmptyMedia>
            <EmptyTitle>Update Shylog</EmptyTitle>
            <EmptyDescription>
              The server has a newer version of Shylog. Reload to get it, and
              your log syncs again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              size="lg"
              // The board's primary action: 48 px, rounder, semibold.
              className="h-12 w-full rounded-[14px] text-base font-semibold"
              onClick={reloadApp}
            >
              Reload
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {loaded && reach !== "ok" && !blocked && (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="accent">
              {reach === "fault" ? <IconServerBolt /> : <IconCloudOff />}
            </EmptyMedia>
            <EmptyTitle>
              {reach === "fault"
                ? "The server ran into a problem"
                : "Can't reach Shylog"}
            </EmptyTitle>
            <EmptyDescription>
              {reach === "fault"
                ? "Your log appears here once the server is working again."
                : "Your log appears here once this phone can reach the server, on your tailnet."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="link" size="lg" onClick={() => void syncNow()}>
              <IconRefresh data-icon="inline-start" />
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {!(loaded && reach !== "ok") && !blocked && skeleton}
    </div>
  )
}
