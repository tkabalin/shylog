import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"
import { IconChevronLeft } from "@tabler/icons-react"
import { Link, useRouter, type LinkProps } from "@tanstack/react-router"

import { plainClick } from "@/components/app-nav"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useDesk } from "@/hooks/use-desk"

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
// On a desktop (desk:) it reads as the dive's bar does: the parent and
// this screen as a breadcrumb, and the action as a shadcn button.
export function PageBar({
  back,
  title,
  crumb,
  end,
}: {
  back: { label: string } & Pick<LinkProps, "to" | "search" | "params">
  title?: ReactNode
  // This screen in the breadcrumb, where the phone's bar has no title.
  crumb?: string
  end?: ReactNode
}) {
  const goBack = useBack()
  const desk = useDesk()
  const { label, ...to } = back
  // Exact, or the parent would match this screen's path and claim to be
  // the current page.
  const link = (
    <Link
      {...(to as LinkProps)}
      replace
      activeOptions={{ exact: true }}
      onClick={(event) => void goBack(event)}
    />
  )
  return (
    // Wide screens line the bar up with the screen's centred column.
    <header className="sticky top-0 z-30 grid h-[calc(3.25rem+env(safe-area-inset-top))] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center bg-background px-2 pt-[env(safe-area-inset-top)] md:px-[max(0.5rem,calc((100%-36rem)/2))] desk:grid-cols-[minmax(0,1fr)_auto] desk:gap-x-4">
      {desk ? (
        <>
          <Breadcrumb className="min-w-0 pl-4">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="-mx-1 rounded-sm px-1 outline-offset-2"
                  render={link}
                >
                  {label}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">
                  {crumb ?? title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {/* The breadcrumb names the screen, so its heading is left for
              screen readers. */}
          {typeof title === "string" && <h1 className="sr-only">{title}</h1>}
          {end && (
            <div className="mr-4 flex items-center gap-2 justify-self-end">
              {end}
            </div>
          )}
        </>
      ) : (
        <>
          <BackLink
            to={to as LinkProps}
            label={label}
            onClick={(event) => void goBack(event)}
          />
          {typeof title === "string" ? (
            <h1 className="max-w-50 truncate text-base font-semibold tracking-[-0.015em]">
              {title}
            </h1>
          ) : (
            (title ?? <span />)
          )}
          <span className="flex items-center justify-self-end">{end}</span>
        </>
      )}
    </header>
  )
}

// The phone bar's back button. As on iOS, a parent's name too long for the
// space beside the title reads "Back" rather than wrapping onto two lines.
function BackLink({
  to,
  label,
  onClick,
}: {
  to: LinkProps
  label: string
  onClick: (event: MouseEvent) => void
}) {
  const cell = useRef<HTMLSpanElement>(null)
  const link = useRef<HTMLAnchorElement>(null)
  const shown = useRef<HTMLSpanElement>(null)
  const full = useRef<HTMLSpanElement>(null)
  const [fits, setFits] = useState(true)
  useLayoutEffect(() => {
    const check = () => {
      // The chevron and padding, whichever label is showing, and clear
      // space before the title, which iOS keeps too.
      const chrome = link.current!.offsetWidth - shown.current!.offsetWidth
      setFits(
        full.current!.offsetWidth + chrome + 12 <= cell.current!.clientWidth
      )
    }
    check()
    // jsdom, which the unit tests run in, has none.
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(check)
    observer.observe(cell.current!)
    return () => observer.disconnect()
  }, [label])
  return (
    <span ref={cell} className="relative flex min-w-0 justify-self-stretch">
      <span
        ref={full}
        aria-hidden
        className="invisible absolute text-base font-medium whitespace-nowrap"
      >
        {label}
      </span>
      <Link
        ref={link}
        {...to}
        replace
        activeOptions={{ exact: true }}
        aria-label={label}
        onClick={onClick}
        className="inline-flex h-11 max-w-full items-center gap-0.5 pr-2 pl-0.5 text-base font-medium whitespace-nowrap text-primary transition-opacity duration-150 select-none [-webkit-touch-callout:none] hover:opacity-70 active:opacity-50 active:duration-0"
      >
        <IconChevronLeft
          aria-hidden
          className="size-5.5 shrink-0 stroke-[2.25]"
        />
        <span ref={shown} className="truncate">
          {fits ? label : "Back"}
        </span>
      </Link>
    </span>
  )
}
