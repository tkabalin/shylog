import { useEffect } from "react"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { toast } from "sonner"

import { cn } from "cn"

import { AppSidebar, BottomNav, useOnForm } from "@/components/app-nav"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { useLog } from "@/data/log"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const onForm = useOnForm()
  return (
    <SidebarProvider className="h-full">
      <AppSidebar />
      {/* viewport-fit=cover lets the page run under the notch. Each page
          keeps its own top to the safe area, so its sticky bars cover the
          status bar; bottom padding matches the bottom nav's height. No
          rubber band, so a pull at the top can't drag the header down. The
          dive form covers the bottom nav, so it pads only the home bar. */}
      <SidebarInset
        id="main"
        className={cn(
          "overflow-y-auto overscroll-y-none pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] desk:pb-0",
          onForm
            ? "pb-[env(safe-area-inset-bottom)]"
            : "pb-[calc(--spacing(12.25)+max(0.5rem,env(safe-area-inset-bottom)))]"
        )}
      >
        <Outlet />
      </SidebarInset>
      {/* Opaque over the status bar, so iOS never draws its top edge blur:
          WebKit drops it only for a fixed or sticky opaque full-width box at
          the top, so this stays mounted. Pages' top bars sit above it (z-30). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-20 h-[max(0.75rem,env(safe-area-inset-top))] bg-background desk:left-(--sidebar-width)"
      />
      <BottomNav />
      <Toaster />
      <UpdateToast />
    </SidebarProvider>
  )
}

// A newer server has stopped syncing: the offer to reload stays up on every
// tab until it's taken or swiped away. A phone with no log yet has the
// Log's own screen saying so instead.
function UpdateToast() {
  const { log, blocked } = useLog()
  const show = blocked && !!log
  useEffect(() => {
    if (!show) return
    toast("A new version of Shylog is ready", {
      id: "update",
      description: "Syncing is paused until you reload.",
      duration: Infinity,
      action: { label: "Reload", onClick: () => location.reload() },
    })
    return () => void toast.dismiss("update")
  }, [show])
  return null
}
