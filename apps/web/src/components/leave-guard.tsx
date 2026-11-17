import { useCallback, useEffect, useRef } from "react"
import { useBlocker } from "@tanstack/react-router"

export interface Leave {
  proceed: () => void
  reset: () => void
}

// On a desktop the sidebar and Back stay in reach, so leaving with something
// typed asks first, as Cancel does. A phone keeps what was typed instead
// (lib/kept.ts): iOS's back swipe has left before the question could show.
export function LeaveGuard({
  when,
  onBlock,
}: {
  when: () => boolean
  onBlock: (leave: Leave | null) => void
}) {
  // One blocker for the form's life, asking the latest `when`, rather than
  // a new one each keystroke as `when` changes.
  const latest = useRef(when)
  useEffect(() => {
    latest.current = when
  })
  const shouldBlockFn = useCallback(() => latest.current(), [])
  const blocker = useBlocker({
    shouldBlockFn,
    enableBeforeUnload: false,
    withResolver: true,
  })
  const { status, proceed, reset } = blocker
  useEffect(() => {
    onBlock(status === "blocked" ? { proceed, reset } : null)
  }, [status, proceed, reset, onBlock])
  return null
}
