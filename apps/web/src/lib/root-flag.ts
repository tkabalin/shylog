// A ref that sets an attribute on <html> while its element is mounted, for
// a rule that would otherwise read :root:has(). Chromium checks such a rule
// again on every insertion anywhere in the page, and when its target is the
// bottom nav, whose line is a scroll-driven animation, that restyled the
// whole page each time (every card the Log mounted as it scrolled).
const mounted = new Map<string, number>()

export const rootFlag = (name: string) => () => {
  mounted.set(name, (mounted.get(name) ?? 0) + 1)
  document.documentElement.setAttribute(name, "")
  // Counted, so a second element with the flag keeps it until both go.
  return () => {
    const left = mounted.get(name)! - 1
    mounted.set(name, left)
    if (!left) document.documentElement.removeAttribute(name)
  }
}
