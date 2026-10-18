import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppSidebar, BottomNav } from "@/components/app-nav"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <SidebarProvider className="h-full">
      <AppSidebar />
      {/* viewport-fit=cover lets the page run under the notch, so content
          keeps to the safe area; bottom padding matches the bottom nav's height. */}
      <SidebarInset
        id="main"
        className="overflow-y-auto pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[calc(--spacing(12.25)+max(0.5rem,env(safe-area-inset-bottom)))] pl-[env(safe-area-inset-left)] md:pb-0"
      >
        <Outlet />
      </SidebarInset>
      <BottomNav />
    </SidebarProvider>
  )
}
