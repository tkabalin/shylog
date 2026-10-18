import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppSidebar, BottomNav } from "@/components/app-nav"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* viewport-fit=cover lets the page run under the notch, so content
          keeps to the safe area; bottom padding clears the bottom nav. */}
      <SidebarInset className="pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-24 pl-[env(safe-area-inset-left)] md:pb-0">
        <Outlet />
      </SidebarInset>
      <BottomNav />
    </SidebarProvider>
  )
}
