import { useState } from "react"
import { createRootRoute, Outlet, useMatchRoute } from "@tanstack/react-router"

import { cn } from "cn"

import {
  AppSidebar,
  BottomNav,
  useImportStep,
  useOnForm,
} from "@/components/app-nav"
import {
  SidebarInset,
  SidebarProvider,
  sidebarFold,
} from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { UpdateToast } from "@/update"

export const Route = createRootRoute({
  component: RootLayout,
})

// shadcn's sidebar cookie, which a server render would read and pass in as
// defaultOpen; Shylog has none, so the first render reads it here.
const sidebarOpen = () =>
  !/(?:^|; )sidebar_state=false(?:;|$)/.test(document.cookie)

function RootLayout() {
  const onForm = useOnForm()
  const step = useImportStep()
  const onMap = !!useMatchRoute()({ to: "/explore" })
  const [defaultOpen] = useState(sidebarOpen)
  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-full">
      <AppSidebar />
      {/* viewport-fit=cover lets the page run under the notch. Each page
          keeps its own top to the safe area, so its sticky bars cover the
          status bar. No rubber band, so a pull at the top can't drag the
          header down. Bottom padding matches the bottom nav, border included;
          the dive form covers the nav, so it pads only the home bar. Pages
          never shrink, or a min-h-full one ends under the bar a screen down. */}
      <SidebarInset
        id="main"
        className={cn(
          "overflow-y-auto overscroll-y-none pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] *:shrink-0 desk:pb-0",
          // An import step's own bottom bar pads for the home bar itself.
          step
            ? undefined
            : onForm
              ? "pb-[env(safe-area-inset-bottom)]"
              : "pb-[calc(--spacing(12.25)+1px+max(0.5rem,env(safe-area-inset-bottom)))]"
        )}
      >
        <Outlet />
      </SidebarInset>
      {/* Opaque over the status bar, so iOS never draws its top edge blur:
          WebKit drops it only for a fixed or sticky opaque full-width box at
          the top, so this stays mounted. Pages' top bars sit above it (z-30).
          It follows the sidebar's width as the sidebar folds, in step. A
          desktop has no status bar, so there the map runs to the top. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-20 h-[max(0.75rem,env(safe-area-inset-top))] bg-background transition-[left] desk:left-(--sidebar-offset)",
          sidebarFold,
          onMap && "desk:hidden"
        )}
      />
      <BottomNav />
      <Toaster />
      <UpdateToast />
    </SidebarProvider>
  )
}
