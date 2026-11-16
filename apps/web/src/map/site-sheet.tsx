import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { IconExternalLink, IconFish, IconX } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { useDesk } from "@/hooks/use-desk"
import { localValue } from "@/lib/local-value"

import { SiteText } from "./site-text"
import { areas, siteTypes, wikivoyage, type Site } from "./sites"
import { zoneAt } from "./zone-at"
import { zoneRules } from "./zone-rules"

// How much of the map the sheet or card hides, which camera moves aim
// beside: the phone's sheet from the bottom, the desktop card from the left.
export type Cover = { left: number; bottom: number }

// A picked site: on a phone a sheet over the map's lower part, which a drag
// raises to the page's text; from desk: up a card over the map's left side.
type SheetProps = {
  site?: Site
  // The map's box, which the phone's sheet stays inside, above the tabs.
  container: HTMLElement | null
  // What the sheet or card covers, for the site it shows.
  onCover: (cover: Cover, site: string) => void
  // A swipe down past the peek, or Escape.
  onClose: () => void
}

export function SiteSheet(props: SheetProps) {
  const desk = useDesk()
  if (!desk) return <PhoneSheet {...props} />
  return props.site ? (
    <SiteCard site={props.site} onCover={props.onCover} />
  ) : null
}

function PhoneSheet({ site, container, onCover, onClose }: SheetProps) {
  // The last site shown, kept while the sheet slides away.
  const [shown, setShown] = useState(site)
  if (site && site !== shown) setShown(site)
  // State, not a ref: the portal mounts the sheet a render after it opens.
  const [summary, setSummary] = useState<HTMLDivElement | null>(null)
  const content = useRef<HTMLDivElement>(null)
  // The peek is as tall as the summary; a drag raises the sheet to the
  // map's full height, with the page's text below it.
  const [peek, setPeek] = useState<string>()
  // Raised for one site: another, from a pin or a link in the text, opens
  // at the peek, so the map shows where it is.
  const [raisedFor, setRaisedFor] = useState<string>()
  const raised = !!site && raisedFor === site.id
  // Put down, it forgets, so the same site picked again opens at its peek.
  if (!site && raisedFor) setRaisedFor(undefined)

  // Measured before it paints, so the sheet opens at its peek, and again as
  // the summary changes height (a longer description, a zone row).
  // Layout sizes, which the sheet's slide doesn't move: from the sheet's
  // top, past the grabber, to the summary's end.
  const shownId = shown?.id
  useLayoutEffect(() => {
    if (!summary || !shownId) return
    const measure = () => {
      const height = summary.offsetTop + summary.offsetHeight
      setPeek(`${height}px`)
      onCover({ left: 0, bottom: height }, shownId)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(summary)
    return () => observer.disconnect()
  }, [summary, onCover, shownId])

  // At the top of its text whenever it's at its peek, lowered after
  // reading or showing another site.
  useEffect(() => {
    if (!raised) content.current?.scrollTo({ top: 0 })
  }, [raised, site?.id])

  // A site with no page has nothing to raise it for.
  const snapPoints = peek ? (shown?.page ? [peek, 1] : [peek]) : undefined
  return (
    <DrawerPrimitive.Root
      open={!!site}
      onOpenChange={(open) => !open && onClose()}
      // The map under it stays live: a tap there picks another pin or puts
      // this one down, which the map handles.
      modal={false}
      disablePointerDismissal
      snapPoints={snapPoints}
      // A flick moves one step, so a swipe down from the text stops at the
      // peek rather than putting the site down.
      snapToSequentialPoints
      snapPoint={snapPoints?.[raised ? 1 : 0] ?? null}
      onSnapPointChange={(point) =>
        setRaisedFor(point === 1 ? site?.id : undefined)
      }
    >
      <DrawerPrimitive.Portal container={container}>
        <DrawerPrimitive.Viewport className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          <DrawerPrimitive.Popup
            className={cn(
              "pointer-events-auto absolute inset-x-0 bottom-0 flex h-full flex-col rounded-t-[14px] border-t bg-popover text-popover-foreground shadow-[0_-10px_30px_-12px_oklch(0.2_0.02_225/22%)] outline-none",
              // Pulled past the top, its colour carries on below, so no map
              // shows between it and the tabs.
              "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-popover",
              "transform-[translate3d(0,calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)),0)] transition-[transform,opacity] duration-450 ease-drawer data-swiping:duration-0",
              "data-ending-style:transform-[translate3d(0,100%,0)] data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)] data-starting-style:transform-[translate3d(0,100%,0)]",
              // With less motion it fades in and out where it rests.
              "motion-reduce:duration-200 motion-reduce:data-ending-style:opacity-0 motion-reduce:data-ending-style:duration-200 motion-reduce:data-starting-style:opacity-0",
              "motion-reduce:data-ending-style:transform-[translate3d(0,calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)),0)] motion-reduce:data-starting-style:transform-[translate3d(0,var(--drawer-snap-point-offset,0px),0)]"
            )}
          >
            {/* The iOS grabber, 36 × 5. */}
            <div
              aria-hidden="true"
              className="flex h-3 shrink-0 items-end justify-center after:block after:h-1.25 after:w-9 after:rounded-full after:bg-muted-foreground/30"
            />
            <DrawerPrimitive.Content
              ref={content}
              data-scroll-top
              className={cn(
                "min-h-0 flex-1 overscroll-contain px-4 select-text",
                // Text scrolling up fades out under the grabber.
                raised
                  ? "overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_0.5rem)]"
                  : "overflow-hidden"
              )}
            >
              {shown && (
                <>
                  <div ref={setSummary} className="pt-2 pb-3.5">
                    <Summary site={shown} />
                  </div>
                  <SiteText site={shown} className="pt-2 pb-8" />
                </>
              )}
            </DrawerPrimitive.Content>
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  )
}

// The card's width, which a drag on its edge sets, kept on this device.
const narrowest = 360
const widest = 640
const clampWidth = (width: number) =>
  Math.min(widest, Math.max(narrowest, width))
const cardWidth = localValue(
  "explore-card-width",
  (stored) => {
    const width = Number(stored ?? narrowest)
    return Number.isFinite(width) ? clampWidth(width) : narrowest
  },
  String
)

// From desk: up, a card over the map's left side, as tall as its summary
// until Read more grows it to the window's height for the page's text.
function SiteCard({
  site,
  onCover,
}: {
  site: Site
  onCover: SheetProps["onCover"]
}) {
  // Read more for one site: another opens collapsed, in the same card, so
  // only the first opening slides in.
  const [moreFor, setMoreFor] = useState<string>()
  const more = moreFor === site.id
  const close = useRef<HTMLAnchorElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stored = useSyncExternalStore(cardWidth.subscribe, cardWidth.get)
  // Held while the edge is dragged, and stored once it's let go.
  const [dragged, setDragged] = useState<number>()
  const width = dragged ?? stored
  // Its inset and width, as drawn: a narrow window caps it.
  const card = useRef<HTMLElement>(null)
  // The most a narrow window leaves it (60% of the map), so the handle
  // reports and steps from the width drawn, not the one stored.
  const [cap, setCap] = useState(widest)
  const drawn = Math.min(width, cap)
  useLayoutEffect(() => {
    const element = card.current
    if (!element) return
    const report = () => {
      const map = element.parentElement?.parentElement?.clientWidth ?? 0
      setCap(Math.min(map - 24, map * 0.6))
      onCover({ left: 12 + element.offsetWidth, bottom: 0 }, site.id)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  }, [onCover, site.id])
  // Escape puts the site down, as it closes a dialog, unless it's for a
  // field or a menu.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      const target = event.target as HTMLElement
      if (target.closest("input, textarea, [role=dialog], [role=listbox]")) {
        return
      }
      close.current?.click()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  // A drag on the card's right edge widens it, or the arrow keys on the
  // handle, with the cursor kept as the edge's once it stops at a limit.
  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget
    const from = event.clientX - width
    let to = width
    handle.setPointerCapture(event.pointerId)
    document.documentElement.style.cursor = "col-resize"
    const move = (moved: PointerEvent) => {
      to = clampWidth(moved.clientX - from)
      setDragged(to)
    }
    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
      document.documentElement.style.cursor = ""
      cardWidth.set(to)
      setDragged(undefined)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }
  const nudge = (event: ReactKeyboardEvent) => {
    const step = { ArrowLeft: -16, ArrowRight: 16 }[event.key]
    if (!step) return
    event.preventDefault()
    cardWidth.set(clampWidth(drawn + step))
  }
  return (
    // At most 60% of the map, so some of it shows beside the card.
    <div
      className={cn(
        "absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] max-w-[min(calc(100%-1.5rem),60%)]",
        "transition-[opacity,translate] duration-200 ease-out starting:-translate-x-2 starting:opacity-0 motion-reduce:starting:translate-x-0",
        more && "h-[calc(100%-1.5rem)]"
      )}
      style={{ width }}
    >
      <section
        ref={card}
        aria-labelledby="site-name"
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      >
        <div className="flex h-13 shrink-0 items-center gap-2 border-b pr-3 pl-5">
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem>
                {/* Back to the map alone, for now; the site list will stand
                    here once it exists. */}
                <BreadcrumbLink
                  className="-mx-1 rounded-sm px-1 outline-offset-2"
                  render={
                    <Link
                      ref={close}
                      to="/explore"
                      search={{ site: undefined }}
                      replace
                    />
                  }
                >
                  Explore
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">
                  {site.name}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="text-muted-foreground"
            render={<Link to="/explore" search={{ site: undefined }} replace />}
            nativeButton={false}
          >
            <IconX />
          </Button>
        </div>
        {/* The scrollbar's room kept from the start, so the text doesn't
            rewrap when Read more makes it scroll, and on both sides, so the
            text sits in the middle. */}
        <div
          ref={scroller}
          data-scroll-top
          className="min-h-0 flex-1 [scrollbar-width:thin] [scrollbar-gutter:stable_both-edges] overflow-y-auto overscroll-contain px-2.5 py-5"
        >
          <Summary
            site={site}
            desk
            more={
              <Button
                variant="outline"
                aria-expanded={more}
                onClick={() => {
                  setMoreFor(more ? undefined : site.id)
                  scroller.current?.scrollTo({ top: 0 })
                }}
              >
                {/* As wide as Read more either way, so its neighbour
                    stays put. */}
                <span className="grid">
                  <span className="invisible col-start-1 row-start-1">
                    Read more
                  </span>
                  <span className="col-start-1 row-start-1">
                    {more ? "Read less" : "Read more"}
                  </span>
                </span>
              </Button>
            }
          />
          {more && <SiteText site={site} className="mt-5" />}
        </div>
      </section>
      {/* shadcn's resizable handle with its grip: a pill on the card's
          right edge, halfway down, that says the edge moves; a shade
          darker than shadcn's, to read over the map. It reaches out from
          the edge, clear of the card's scrollbar. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize"
        aria-valuemin={narrowest}
        aria-valuemax={widest}
        aria-valuenow={drawn}
        tabIndex={0}
        onPointerDown={resize}
        onKeyDown={nudge}
        className="group/edge absolute inset-y-3 -right-2.5 flex w-2.5 cursor-col-resize touch-none items-center outline-none"
      >
        <div className="-ml-0.5 h-6 w-1 rounded-lg bg-ring transition-colors group-hover/edge:bg-muted-foreground group-focus-visible/edge:bg-muted-foreground group-focus-visible/edge:ring-3 group-focus-visible/edge:ring-ring/50 group-active/edge:bg-foreground" />
      </div>
    </div>
  )
}

function Summary({
  site,
  desk = false,
  more,
}: {
  site: Site
  desk?: boolean
  // The desktop card's Read more, beside Read on Wikivoyage, and like it
  // left out for a site with no page.
  more?: React.ReactNode
}) {
  // Kept per site: the card re-renders on every move of a drag on its edge.
  const zone = useMemo(() => zoneAt([site.lon, site.lat]), [site])
  const rule = zone && zoneRules[zone.id]
  const noDive = zone?.kind === "no-dive"
  const page = wikivoyage(site)
  const Title = desk ? "h2" : DrawerPrimitive.Title
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">
            {areas[site.area]}
          </p>
          <Title
            id={desk ? "site-name" : undefined}
            className={cn(
              "mt-0.5 font-semibold tracking-[-0.02em] text-balance",
              desk ? "text-[22px] leading-7" : "text-xl leading-[26px]"
            )}
          >
            {site.name}
          </Title>
        </div>
        {/* Puts the site down, which the sheet follows from the address. */}
        {!desk && (
          <Link
            to="/explore"
            search={{ site: undefined }}
            replace
            aria-label="Close"
            className="-mt-2 -mr-3 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted"
          >
            <IconX className="size-5" />
          </Link>
        )}
      </div>
      <dl
        className={cn(
          "grid grid-cols-[repeat(2,max-content)] gap-x-10",
          desk ? "mt-4 mb-3.5" : "mt-3.5 mb-3"
        )}
      >
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Max depth</dt>
          <dd className="text-[17px] font-semibold tracking-[-0.01em] whitespace-nowrap tabular-nums">
            {site.depth === undefined ? (
              "–"
            ) : (
              <>
                {site.approximate && "≈ "}
                {site.depth}
                <small className="ml-px text-[13px] font-medium text-muted-foreground">
                  {" "}
                  m
                </small>
              </>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Type</dt>
          <dd className="text-[17px] font-semibold tracking-[-0.01em]">
            {siteTypes[site.type]}
          </dd>
        </div>
      </dl>
      {site.description && (
        <p
          className={cn(
            desk ? "text-sm leading-[21px]" : "text-[15px] leading-[21px]"
          )}
        >
          {site.description}
        </p>
      )}
      {rule && (
        <div
          className={cn(
            "flex items-start gap-2.5 text-[13px] leading-[18px] text-muted-foreground",
            desk ? "mt-3.5 rounded-[10px] border p-3" : "mt-3 border-t pt-3"
          )}
        >
          <IconFish
            className={cn("mt-px size-4.25 shrink-0", noDive && "text-warn")}
          />
          <div className="min-w-0 flex-1">
            <b
              className={cn(
                "block text-sm font-medium",
                noDive ? "text-warn" : "text-foreground"
              )}
            >
              {rule.name}
            </b>
            {rule.rule}
          </div>
        </div>
      )}
      {/* Nothing to read where Wikivoyage has no page. */}
      {!page ? null : desk ? (
        <div className="mt-3.5 flex gap-2">
          {more}
          <Button
            variant="outline"
            render={<a href={page} target="_blank" rel="noopener" />}
            nativeButton={false}
          >
            Read on Wikivoyage
            <IconExternalLink
              data-icon="inline-end"
              className="text-muted-foreground"
            />
          </Button>
        </div>
      ) : (
        <a
          href={page}
          target="_blank"
          rel="noopener"
          className="mt-3 flex h-11 items-center justify-between rounded-[10px] bg-muted px-3 text-[15px] font-medium active:opacity-70"
        >
          Read on Wikivoyage
          <IconExternalLink className="size-4.5 text-muted-foreground" />
        </a>
      )}
    </>
  )
}
