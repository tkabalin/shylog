import { createRootRoute, Outlet } from "@tanstack/react-router"

import { cn } from "cn"

import { AppSidebar, BottomNav, useOnForm } from "@/components/app-nav"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

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
          "overflow-y-auto overscroll-y-none pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] md:pb-0",
          onForm
            ? "pb-[env(safe-area-inset-bottom)]"
            : "pb-[calc(--spacing(12.25)+max(0.5rem,env(safe-area-inset-bottom)))]"
        )}
      >
        <Outlet />
      </SidebarInset>
      <BottomNav />
    </SidebarProvider>
  )
}
