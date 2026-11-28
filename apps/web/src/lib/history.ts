import type { MouseEvent } from "react"

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
