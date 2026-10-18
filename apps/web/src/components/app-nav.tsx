import { Link } from "@tanstack/react-router"
import {
  IconAdjustmentsHorizontal,
  IconChartBar,
  IconNotebook,
  IconUpload,
} from "@tabler/icons-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const destinations = [
  { to: "/", label: "Log", icon: IconNotebook },
  { to: "/stats", label: "Stats", icon: IconChartBar },
  { to: "/import", label: "Import", icon: IconUpload },
  { to: "/settings", label: "Settings", icon: IconAdjustmentsHorizontal },
] as const

// Phones get a bottom bar, as on the Log board.
export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t bg-background/85 pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] backdrop-blur-md md:hidden"
    >
      {destinations.map(({ to, label, icon: Icon }) => (
        // Icons only, so the label is the link's name for tests and VoiceOver.
        <Link
          key={to}
          to={to}
          aria-label={label}
          className="group flex min-h-12.25 items-center justify-center text-muted-foreground select-none [-webkit-touch-callout:none] data-[status=active]:text-primary"
        >
          <Icon
            aria-hidden
            className="size-7 stroke-[1.75] group-data-[status=active]:stroke-2"
          />
        </Link>
      ))}
    </nav>
  )
}

// From md: up the same destinations sit in a fixed sidebar.
export function AppSidebar() {
  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 hidden h-svh shrink-0 border-r md:flex"
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Main">
              <SidebarMenu>
                {destinations.map(({ to, label, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    {/* Link decides what is active, as in the bottom nav, and
                        sets the data-active the sidebar styles use. */}
                    <SidebarMenuButton
                      render={
                        <Link to={to} activeProps={{ "data-active": "" }} />
                      }
                    >
                      <Icon aria-hidden />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
