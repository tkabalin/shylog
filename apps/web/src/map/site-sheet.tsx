import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import {
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconFish,
  IconWifiOff,
  IconX,
} from "@tabler/icons-react"
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
import { useOnline } from "@/data/sync-status"
import { localValue } from "@/lib/local-value"

import { useMapFrame } from "./basemap"
import { withSite } from "./search"
import { SiteText } from "./site-text"
import { areas, siteById, siteTypes, wikivoyage, type Site } from "./sites"
import { zoneAt } from "./zone-at"
import { zoneRules, type Mpa } from "./zone-rules"

// The zone rules, opened at a marine protected area from a site's zone row.
type OnRules = (mpa: Mpa) => void

// A link in the text opens another site in place of this one, so the sheet
// keeps the way back: each step's site and how far down its text it was.
type Step = { from: string; to: string; scroll: number }
function useTrail(
  id: string | undefined,
  scroller: RefObject<HTMLElement | null>,
  // Runs as the site gone back to shows, in the same render, so it opens
  // raised with nothing in between.
  arrive: (id: string) => void
) {
  const [trail, setTrail] = useState<Step[]>([])
  // The step gone back along, taken off once its site shows, so the back
  // row stays until then.
  const [leaving, setLeaving] = useState<Step>()
  const [seen, setSeen] = useState(id)
  if (id !== seen) {
    setSeen(id)
    setLeaving(undefined)
    if (leaving && id === leaving.from) {
      setTrail(trail.slice(0, -1))
      arrive(id)
    } else if (trail.length && trail.at(-1)!.to !== id) {
      // A site reached any other way, from a pin or after a close, ends it.
      setTrail([])
    }
  }
  const follow = useCallback(
    (to: string) => {
      if (!id) return
      const step = { from: id, to, scroll: scroller.current?.scrollTop ?? 0 }
      setTrail((steps) => [...(steps.at(-1)?.to === id ? steps : []), step])
    },
    [id, scroller]
  )
  const back = trail.at(-1)?.to === id ? trail.at(-1) : undefined
  const restore = useRef<Step>(undefined)
  const goBack = () => {
    restore.current = back
    setLeaving(back)
  }
  // Back at the same place in its text once that site shows. The back
  // links don't let the router put the scroller at its top.
  useLayoutEffect(() => {
    const step = restore.current
    if (!step || step.from !== id) return
    restore.current = undefined
    scroller.current?.scrollTo({ top: step.scroll })
  }, [id, scroller])
  return { back, follow, goBack }
}

// A picked site on a phone: a sheet over the map's lower part, which a drag
// raises to the page's text.
export function SiteSheet({
  site,
  onClose,
  onRules,
}: {
  site?: Site
  // A swipe down past the peek.
  onClose: () => void
  onRules: OnRules
}) {
  const { container, onCover } = useMapFrame()
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
  const { back, follow, goBack } = useTrail(site?.id, content, setRaisedFor)
  const [title, setTitle] = useState<HTMLElement | null>(null)
  // A new element each render would undo SiteText's memo.
  const end = useMemo(() => shown && <WikivoyageRow site={shown} />, [shown])
  const backTo = back && { id: back.from, onClick: goBack }

  // The peek, from the sheet's top to the summary's end, measured before it
  // paints and as the summary rewraps; not while raised, when the
  // description is whole and Read more goes. Layout sizes the slide can't move.
  const shownId = shown?.id
  useLayoutEffect(() => {
    if (!summary || !shownId || raised) return
    const measure = () => {
      const height = summary.offsetTop + summary.offsetHeight
      setPeek(`${height}px`)
      onCover({ left: 0, bottom: height }, shownId)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(summary)
    return () => observer.disconnect()
  }, [summary, onCover, shownId, raised])

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
            {shown && (
              <CompactBar
                site={shown}
                raised={raised}
                scroller={content}
                title={title}
                back={backTo}
              />
            )}
            <div className="relative flex min-h-0 flex-1 flex-col">
              <DrawerPrimitive.Content
                ref={content}
                data-scroll-top
                className={cn(
                  "min-h-0 flex-1 overscroll-contain px-4 select-text",
                  raised ? "overflow-y-auto" : "overflow-hidden"
                )}
              >
                {shown && (
                  <>
                    <div ref={setSummary} className="pt-2 pb-3.5">
                      <Summary
                        site={shown}
                        titleRef={setTitle}
                        clamp={!raised}
                        back={backTo}
                        onRules={onRules}
                        raise={
                          raised ? undefined : () => setRaisedFor(shown.id)
                        }
                      />
                    </div>
                    <SiteText
                      site={shown}
                      className="pt-2 pb-8"
                      onFollow={follow}
                      end={end}
                    />
                  </>
                )}
              </DrawerPrimitive.Content>
              {/* Text scrolling up fades out under the grabber: a still
                overlay in the sheet's colour, not a mask WebKit may repaint
                every scroll. */}
              {raised && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-[linear-gradient(var(--popover),transparent)]"
                />
              )}
            </div>
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
export function SiteCard({ site, onRules }: { site: Site; onRules: OnRules }) {
  const { container, onCover } = useMapFrame()
  // Read more for one site: another opens collapsed, in the same card, so
  // only the first opening slides in.
  const [moreFor, setMoreFor] = useState<string>()
  const more = moreFor === site.id
  const close = useRef<HTMLAnchorElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const { back, follow, goBack } = useTrail(site.id, scroller, setMoreFor)
  const online = useOnline()
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
      const map = container?.clientWidth ?? 0
      setCap(Math.min(map - 24, map * 0.6))
      onCover({ left: 12 + element.offsetWidth, bottom: 0 }, site.id)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  }, [container, onCover, site.id])
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
              <BreadcrumbItem className="shrink-0 whitespace-nowrap">
                {/* Back to the list, putting the site down. */}
                <BreadcrumbLink
                  className="-mx-1 rounded-sm px-1 outline-offset-2"
                  render={
                    <Link
                      ref={close}
                      to="/explore"
                      search={withSite(undefined)}
                      replace
                    />
                  }
                >
                  Dive sites
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
          {!online && <Offline />}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="text-muted-foreground"
            render={<Link to="/explore" search={withSite(undefined)} replace />}
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
            onRules={onRules}
            back={back && { id: back.from, onClick: goBack }}
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
          {more && <SiteText site={site} className="mt-5" onFollow={follow} />}
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

type Back = { id: string; onClick: () => void }

// Back to the site a link came from, which keeps its own place in the text,
// so the router mustn't put the scroller at its top.
function BackLink({
  back,
  ...props
}: { back: Back } & Omit<React.ComponentProps<"a">, "href">) {
  return (
    <Link
      to="/explore"
      search={withSite(back.id)}
      replace
      resetScroll={false}
      onClick={back.onClick}
      {...props}
    />
  )
}

// Raised, the title scrolls away under a bar with the name and close, and
// the way back. It fades as the scroll decides, and goes at once when the
// sheet lowers or shows another site, so it never lies over a summary.
function CompactBar({
  site,
  raised,
  scroller,
  title,
  back,
}: {
  site: Site
  raised: boolean
  scroller: RefObject<HTMLElement | null>
  title: HTMLElement | null
  back?: Back
}) {
  const [titleGone, setTitleGone] = useState(false)
  useEffect(() => {
    const root = scroller.current
    if (!title || !root) return
    const observer = new IntersectionObserver(
      ([entry]) => setTitleGone(!entry.isIntersecting),
      // Gone once it's under the bar.
      { root, rootMargin: "-44px 0px 0px 0px" }
    )
    observer.observe(title)
    return () => observer.disconnect()
  }, [title, scroller])
  const shown = raised && titleGone
  return (
    <div
      aria-hidden={!shown}
      inert={!shown}
      className={cn(
        "absolute inset-x-0 top-3 z-10 flex h-11 items-center gap-1 border-b bg-popover pr-1 pl-4 transition-[opacity,visibility] duration-150 ease-out",
        back && "pl-1",
        !raised && "duration-0",
        !shown && "invisible opacity-0"
      )}
    >
      {back && (
        <BackLink
          back={back}
          aria-label={`Back to ${siteById.get(back.id)?.name}`}
          className="grid size-11 shrink-0 place-items-center rounded-full text-primary active:opacity-50 active:duration-0"
        >
          <IconChevronLeft className="size-5.5" />
        </BackLink>
      )}
      <p className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em]">
        {site.name}
      </p>
      <Close />
    </div>
  )
}

// Puts the site down, which the sheet follows from the address.
function Close() {
  const online = useOnline()
  return (
    <>
      {!online && <Offline />}
      <Link
        to="/explore"
        search={withSite(undefined)}
        replace
        aria-label="Close"
        className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted"
      >
        <IconX className="size-5" />
      </Link>
    </>
  )
}

// Wikivoyage needs signal, so with none it's there but can't be pressed.
function Offline() {
  return (
    <IconWifiOff
      role="img"
      aria-label="Offline"
      className="size-4 shrink-0 text-muted-foreground"
    />
  )
}

// The phone's Read on Wikivoyage, after the text, which reads offline.
function WikivoyageRow({ site }: { site: Site }) {
  const online = useOnline()
  const page = wikivoyage(site)
  if (!page) return null
  return (
    <a
      href={online ? page : undefined}
      // With no href it's no longer a link to a screen reader.
      role={online ? undefined : "link"}
      aria-disabled={!online || undefined}
      target="_blank"
      rel="noopener"
      className="mt-8 flex h-11 items-center justify-between rounded-[10px] bg-muted px-3 text-[15px] font-medium select-none active:opacity-70 aria-disabled:opacity-50"
    >
      Read on Wikivoyage
      <IconExternalLink className="size-4.5 text-muted-foreground" />
    </a>
  )
}

function Summary({
  site,
  desk = false,
  more,
  raise,
  back,
  clamp = false,
  titleRef,
  onRules,
}: {
  site: Site
  desk?: boolean
  // The rules at the site's marine protected area, from its zone row.
  onRules: OnRules
  // Read more on the desktop card, a button beside Read on Wikivoyage.
  // Left out, as raise is, for a site with no page.
  more?: React.ReactNode
  // On a phone at its peek: Read more at the description's end raises it.
  raise?: () => void
  // The site a link in the text came from, in place of the area line.
  back?: Back
  // The description to three lines, at the phone's peek.
  clamp?: boolean
  titleRef?: (element: HTMLElement | null) => void
}) {
  // Kept per site: the card re-renders on every move of a drag on its edge.
  const zone = useMemo(() => zoneAt([site.lon, site.lat]), [site])
  const rule = zone && zoneRules[zone.id]
  const noDive = zone?.kind === "no-dive"
  const page = wikivoyage(site)
  const online = useOnline()
  const read = page ? raise : undefined
  // Whether the clamp hides Read more at the description's end, which then
  // ends in "more" over its last line, as on the App Store. Measured for
  // each site, as a cut one and a whole one can be the same height.
  const [description, setDescription] = useState<HTMLElement | null>(null)
  const [inline, setInline] = useState<HTMLElement | null>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    if (!description || !inline) return
    const observer = new ResizeObserver(() =>
      setCut(
        inline.getBoundingClientRect().bottom >
          description.getBoundingClientRect().bottom + 1
      )
    )
    observer.observe(description)
    return () => observer.disconnect()
  }, [description, inline, site.id, clamp])
  const readMore = (
    label: string,
    className?: string,
    ref?: (element: HTMLElement | null) => void
  ) =>
    read && (
      <button
        ref={ref}
        type="button"
        aria-label="Read more"
        onClick={read}
        // A finger's reach past the words.
        className={cn(
          "relative font-medium text-primary after:absolute after:-inset-x-2 after:-inset-y-3 active:opacity-50 active:duration-0",
          className
        )}
      >
        {label}
      </button>
    )
  const Title = desk ? "h2" : DrawerPrimitive.Title
  // A site on a shared page, named for a part of it ("Deep End"), says
  // which page: the reef or wreck it's on.
  const on =
    site.section &&
    site.page &&
    !site.name.toLowerCase().includes(site.page.toLowerCase())
      ? site.page
      : undefined
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {back ? (
            // 44 px tall, over the title's top, for a wet finger.
            <BackLink
              back={back}
              className="relative z-10 -mx-1 -my-[13px] flex w-fit max-w-full items-center rounded-sm px-1 py-[13px] text-[13px] leading-[18px] font-medium text-primary outline-offset-2 active:opacity-50 active:duration-0"
            >
              <IconChevronLeft className="-ml-1 size-4 shrink-0" />
              <span className="truncate">{siteById.get(back.id)?.name}</span>
            </BackLink>
          ) : (
            <p className="text-[13px] text-pretty text-muted-foreground">
              {areas[site.area]}
              {on && ` · ${on}`}
            </p>
          )}
          <Title
            ref={titleRef}
            id={desk ? "site-name" : undefined}
            className={cn(
              "mt-0.5 font-semibold tracking-[-0.02em] text-balance",
              desk ? "text-[22px] leading-7" : "text-xl leading-[26px]"
            )}
          >
            {site.name}
          </Title>
        </div>
        {!desk && (
          <div className="-mt-2 -mr-3 flex items-center gap-1">
            <Close />
          </div>
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
      {site.description ? (
        <div className="relative">
          <p
            ref={setDescription}
            className={cn(
              desk ? "text-sm leading-[21px]" : "text-[15px] leading-[21px]",
              clamp && "line-clamp-3"
            )}
          >
            {site.description}
            {/* Kept in the line while the clamp hides it, so a cut can't
                come and go as it shows. */}
            {read && " "}
            {readMore("Read more", cut ? "invisible" : undefined, setInline)}
          </p>
          {cut &&
            readMore(
              "more",
              "absolute right-0 bottom-0 bg-[linear-gradient(to_right,transparent,var(--color-popover)_2.5rem)] pl-10 text-[15px] leading-[21px]"
            )}
        </div>
      ) : (
        read && (
          <p className="text-[15px] leading-[21px]">{readMore("Read more")}</p>
        )
      )}
      {rule && (
        // Opens the rules at the zone's marine protected area.
        <button
          type="button"
          onClick={() => onRules(rule.mpa)}
          className={cn(
            "mt-3.5 flex w-full items-start gap-2.5 rounded-[10px] border p-3 text-left text-[13px] leading-[18px] text-muted-foreground transition-[opacity,background-color] duration-150 ease-out data-press:opacity-60 data-press:duration-0",
            desk && "hover:bg-muted/70"
          )}
        >
          <IconFish
            className={cn("mt-px size-4.25 shrink-0", noDive && "text-warn")}
          />
          <span className="min-w-0 flex-1">
            <b
              className={cn(
                "block text-sm font-medium",
                noDive ? "text-warn" : "text-foreground"
              )}
            >
              {rule.title ?? rule.name}
            </b>
            {rule.title && `${rule.name}. `}
            {rule.rule}
          </span>
          <IconChevronRight className="size-4.5 shrink-0 self-center" />
        </button>
      )}
      {/* Nothing to read where Wikivoyage has no page. */}
      {page && desk && (
        <div className="mt-3.5 flex gap-2">
          {more}
          <Button
            variant="outline"
            disabled={!online}
            {...(online && {
              render: <a href={page} target="_blank" rel="noopener" />,
              nativeButton: false,
            })}
          >
            Read on Wikivoyage
            <IconExternalLink
              data-icon="inline-end"
              className="text-muted-foreground"
            />
          </Button>
        </div>
      )}
    </>
  )
}
