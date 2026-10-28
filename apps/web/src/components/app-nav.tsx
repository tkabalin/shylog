import {
  Link,
  useMatchRoute,
  useRouter,
  type AnyRouter,
} from "@tanstack/react-router"
import type { MouseEvent } from "react"
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

declare module "@tanstack/react-router" {
  interface HistoryState {
    // Set by a Log card, so the dive's page knows the Log is behind it.
    fromLog?: true
  }
}

// Back in history when the Log came before, so it returns with its scroll
// position and filters, as a pushed screen pops; otherwise a fresh Log.
export function backToLog(router: AnyRouter, event: MouseEvent) {
  if (router.state.location.state.fromLog && router.history.canGoBack()) {
    event.preventDefault()
    router.history.back()
  }
}

// A dive's detail is pushed from the Log, so the Log stays the current tab
// there and tapping it goes back.
function useLogTab() {
  const router = useRouter()
  const onDive = !!useMatchRoute()({ to: "/dive/$diveId" })
  return (to: string) =>
    to === "/" && onDive
      ? {
          "data-status": "active",
          "aria-current": "page" as const,
          onClick: (event: MouseEvent) => backToLog(router, event),
        }
      : {}
}

// Phones get a bottom bar, as on the Log board. The dive form covers it,
// as EditDiveHifi draws it and an iOS edit sheet would, so a tab can't
// leave a form half filled in.
export function useOnForm() {
  const match = useMatchRoute()
  return !!(match({ to: "/dive/new" }) || match({ to: "/dive/$diveId/edit" }))
}

export function BottomNav() {
  const logTab = useLogTab()
  if (useOnForm()) return null
  return (
    <nav
      aria-label="Main"
      className="bottom-nav fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t bg-background pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] desk:hidden"
    >
      {destinations.map(({ to, label, icon: Icon }) => (
        // Icons only, so the label is the link's name for tests and VoiceOver.
        // Tabs replace the entry, so swiping back never steps through tabs.
        <Link
          key={to}
          to={to}
          replace
          aria-label={label}
          {...logTab(to)}
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

// On a wide screen with a mouse or trackpad (desk:) the same destinations
// sit in a fixed sidebar.
export function AppSidebar() {
  const logTab = useLogTab()
  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 hidden h-svh shrink-0 border-r desk:flex"
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
                        <Link
                          to={to}
                          replace
                          activeProps={{ "data-active": "" }}
                          {...(logTab(to)["data-status"]
                            ? { ...logTab(to), "data-active": "" }
                            : {})}
                        />
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
