import {
  Link,
  useMatchRoute,
  useRouter,
  useRouterState,
  type AnyRouter,
} from "@tanstack/react-router"
import type { MouseEvent } from "react"
import {
  IconChartBar,
  IconNotebook,
  IconScubaMask,
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
  // Once Settings: the diver's own things and the log's upkeep.
  { to: "/you", label: "You", icon: IconScubaMask },
] as const

declare module "@tanstack/react-router" {
  interface HistoryState {
    // Set by a Log card, so the dive's page knows the Log is behind it.
    fromLog?: true
    // Set by a screen inside You on what it pushes, so Back can go back.
    pushed?: true
    // A deleted dive opened from Recently deleted, which is behind it.
    fromDeleted?: true
    // A dive opened from an entity's detail, whose name its Back link says.
    parent?: string
    // A record's dive, or a site, buddy or region, opened from Statistics,
    // which is behind it (behind the entity, for one of its dives).
    fromStats?: true
  }
}

// A click a link handles itself: Ctrl, Cmd or Shift with a mouse opens the
// link elsewhere, as it would anywhere else, rather than going back.
export function plainClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}

// Back in history when the Log came before, so it returns with its scroll
// position and filters, as a pushed screen pops; otherwise a fresh Log.
export function backToLog(router: AnyRouter, event: MouseEvent) {
  if (plainClick(event) && logBehind(router)) {
    event.preventDefault()
    router.history.back()
  }
}

const logBehind = (router: AnyRouter) =>
  !!router.state.location.state.fromLog && router.history.canGoBack()

// The same from code, for a dive that has just been deleted.
export function closeToLog(router: AnyRouter) {
  if (logBehind(router)) router.history.back()
  else void router.navigate({ to: "/", replace: true })
}

function backFromStats(router: AnyRouter, event: MouseEvent) {
  if (
    plainClick(event) &&
    router.state.location.state.pushed &&
    router.history.canGoBack()
  ) {
    event.preventDefault()
    router.history.back()
  }
}

// A dive's detail is pushed from the Log, so the Log stays the current tab
// there and tapping it goes back. One opened from Recently deleted or an
// entity keeps You current instead, and a record's keeps Stats.
function useLogTab() {
  const router = useRouter()
  const match = useMatchRoute()
  // Its form and a new one too, opened from it.
  const onDive = !!match({ to: "/dive/$diveId", fuzzy: true })
  // A site, buddy or region opened from Statistics keeps Stats current too,
  // though its screen is inside You.
  const onEntity = !!match({ to: "/you/entities/$kind/$id" })
  // All patterns is pushed over Statistics, whose tab goes back to it.
  const onPatterns = !!match({ to: "/stats/patterns" })
  // Opened from Statistics, perhaps through a site of it, or from a screen
  // inside You.
  const from = useRouterState({
    select: ({ location: { state } }) =>
      state.fromStats
        ? "/stats"
        : state.fromDeleted || state.parent
          ? "/you"
          : null,
  })
  // A dive opened from an entity's detail, which is between it and its tab.
  const nested = useRouterState({
    select: ({ location: { state } }) => !!state.parent,
  })
  const active = { "data-status": "active", "aria-current": "page" as const }
  const back = (event: MouseEvent) => backFromStats(router, event)
  return (
    to: string
  ): Partial<typeof active> & {
    onClick?: (event: MouseEvent) => void
    activeOptions?: { exact: boolean }
  } => {
    if (onPatterns) return to === "/stats" ? { ...active, onClick: back } : {}
    if (onEntity && from === "/stats") {
      if (to === "/stats") return { ...active, onClick: back }
      // Not You, whose path this screen is under.
      return to === "/you" ? { activeOptions: { exact: true } } : {}
    }
    if (!onDive) return {}
    if (from) {
      if (to !== from) return {}
      // Statistics right behind a record's dive: its tab goes back there,
      // keeping the year, as the Log's does.
      return from === "/stats" && !nested
        ? { ...active, onClick: back }
        : active
    }
    return to === "/"
      ? { ...active, onClick: (event: MouseEvent) => backToLog(router, event) }
      : {}
  }
}

// Phones get a bottom bar, as on the Log board. The dive form covers it,
// as EditDiveHifi draws it and an iOS edit sheet would, so a tab can't
// leave a form half filled in.
export function useOnForm() {
  const match = useMatchRoute()
  const step = useImportStep()
  return (
    step ||
    !!(match({ to: "/dive/new" }) || match({ to: "/dive/$diveId/edit" }))
  )
}

// The import's steps after the upload, which the boards draw with their
// own button bar over the home bar and no tabs.
export function useImportStep() {
  const match = useMatchRoute()
  return !!(
    match({ to: "/import/review", fuzzy: true }) ||
    match({ to: "/import/done" })
  )
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
                {destinations.map(({ to, label, icon: Icon }) => {
                  const tab = logTab(to)
                  return (
                    <SidebarMenuItem key={to}>
                      {/* Link decides what is active, as in the bottom nav,
                          and sets the data-active the sidebar styles use. */}
                      <SidebarMenuButton
                        render={
                          <Link
                            to={to}
                            replace
                            activeProps={{ "data-active": "" }}
                            {...tab}
                            {...(tab["data-status"] && { "data-active": "" })}
                          />
                        }
                      >
                        <Icon aria-hidden />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
