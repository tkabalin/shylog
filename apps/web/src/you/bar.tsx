import type { MouseEvent, ReactNode } from "react"
import { IconChevronLeft } from "@tabler/icons-react"
import { Link, useRouter, type LinkProps } from "@tanstack/react-router"

import { plainClick } from "@/components/app-nav"

// Back in history when the screen was pushed from its parent, so the
// parent returns as it was left; otherwise a fresh parent takes its place,
// so swiping back can't reopen this screen.
export function useBack() {
  const router = useRouter()
  return (event?: MouseEvent) => {
    if (event && !plainClick(event)) return false
    if (!router.state.location.state.pushed || !router.history.canGoBack())
      return false
    event?.preventDefault()
    router.history.back()
    return true
  }
}

// The boards' bar on a screen inside You: the parent's name to go back,
// the title centred, and an action on the right. Solid, as all chrome is.
export function PageBar({
  back,
  title,
  end,
}: {
  back: { label: string } & Pick<LinkProps, "to" | "search" | "params">
  title?: ReactNode
  end?: ReactNode
}) {
  const goBack = useBack()
  const { label, ...to } = back
  return (
    <header className="sticky top-0 z-30 grid h-[calc(3.25rem+env(safe-area-inset-top))] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center bg-background px-2 pt-[env(safe-area-inset-top)]">
      {/* Exact, or the parent would match this screen's path and claim to
          be the current page. */}
      <Link
        {...(to as LinkProps)}
        replace
        activeOptions={{ exact: true }}
        onClick={(event) => void goBack(event)}
        className="inline-flex h-11 items-center gap-0.5 justify-self-start pr-2 pl-0.5 text-base font-medium text-primary transition-opacity duration-150 select-none [-webkit-touch-callout:none] hover:opacity-70 active:opacity-50 active:duration-0"
      >
        <IconChevronLeft aria-hidden className="size-5.5 stroke-[2.25]" />
        {label}
      </Link>
      {typeof title === "string" ? (
        <h1 className="max-w-50 truncate text-base font-semibold tracking-[-0.015em]">
          {title}
        </h1>
      ) : (
        (title ?? <span />)
      )}
      <span className="justify-self-end">{end}</span>
    </header>
  )
}
