import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { cn } from "cn"
import {
  IconArrowUpRight,
  IconChevronLeft,
  IconChevronRight,
  IconX,
} from "@tabler/icons-react"

import { useSize } from "@/chart/size"
import { ImagePages, type PageImageProps } from "@/components/image-pages"
import { PageControl } from "@/components/page-control"
import { useOnline } from "@/lib/online"
import { useFullScreen } from "@/hooks/use-full-screen"
import { useEdgeSwipeBlock } from "@/lib/edge-swipe"

import { kindNames } from "./image-strip"
import { useSiteImages, type SiteImage } from "./site-images"
import type { Site } from "./sites"

// The images the viewer shows and the one shown, for its pages.
const Shown = createContext<{ images: SiteImage[]; page: number } | null>(null)

// Only the shown image and its neighbours load: a site map is up to
// 9 megapixels decoded, too many to hold a page of them at once on a phone.
function Picture({ i, style, ...props }: PageImageProps) {
  const { images, page } = use(Shown)!
  const image = images[i]
  const [loaded, setLoaded] = useState<string>()
  // Fitted to the stage from the size the credits give, so its box is laid
  // out (and can be pinched) before the file decodes; a small one grows.
  const fit = Math.min(
    Number(style.maxWidth) / image.width,
    Number(style.maxHeight) / image.height
  )
  return (
    <img
      {...props}
      // The thumbnail, already kept, stands in until the full image has
      // loaded, then goes, as it would blur a transparent drawing's lines;
      // white behind either.
      style={{
        width: image.width * fit,
        height: image.height * fit,
        background:
          loaded === image.src
            ? "white"
            : `url("${image.thumb}") center / 100% 100% no-repeat, white`,
      }}
      src={Math.abs(i - page) <= 1 ? image.src : undefined}
      onLoad={() => setLoaded(image.src)}
      alt={image.caption || kindNames[image.kind]}
      decoding="async"
      draggable={false}
    />
  )
}

// How far an image can be pinched in: until its own pixels are each about
// two and a half of the screen's, so a 3840 px map reaches its smallest
// depth labels (8×, the most) while a 1200 px one stops before it blurs
// (2× at least). Its fitted width is read from the window, near enough.
function zoomFor(image: SiteImage, insetY: number) {
  const room = Math.min(
    window.innerWidth - 32,
    ((window.innerHeight - insetY * 2) * image.width) / image.height
  )
  const sharp = image.width / (room * window.devicePixelRatio)
  return Math.min(8, Math.max(2, sharp * 2.5))
}

type ViewerProps = {
  site: Pick<Site, "id" | "name">
  start: number
  onClose: () => void
  // The image shown, for the address, so a reload opens it again.
  onShow: (index: number) => void
}

// A site's maps and images full screen, once their lists have come. An
// address naming an image the site doesn't have (an old link) closes it
// rather than leave the app inert under nothing.
export function ImageViewer(props: ViewerProps) {
  const images = useSiteImages(props.site.id)
  const none = images?.length === 0
  const close = useEffectEvent(props.onClose)
  useEffect(() => {
    if (none) close()
  }, [none])
  if (!images?.length) return null
  return <Viewer {...props} images={images} />
}

// Dark whatever the theme as a photo viewer is, swiped between and pinched
// in on, with each one's caption and credit under it. It opens and closes
// at once, as the card viewer does.
function Viewer({
  site,
  start,
  onClose,
  onShow,
  images,
}: ViewerProps & { images: SiteImage[] }) {
  const [page, setPage] = useState(start)
  // The address can name one past the end.
  const shown = Math.max(0, Math.min(page, images.length - 1))
  const image = images[shown]
  const online = useOnline()
  useFullScreen()
  // iOS's back swipe would take the viewer and the site under it away, as
  // it would the card viewer's.
  useEdgeSwipeBlock()

  // The bars make way while a picture is zoomed in, and come back with it
  // at rest. A picture at rest keeps clear of both by the taller's height
  // each side, so it sits in the middle, where the pinch's sums put it.
  const [zoomed, setZoomed] = useState(false)
  const top = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const insetY = Math.max(useSize(top).height, useSize(bottom).height) + 16
  const bars = cn(
    "transition-opacity duration-150 ease-out",
    zoomed && "pointer-events-none opacity-0"
  )

  // The address follows once a turn settles, not for every dot a scrub
  // crosses, as each write renders the map's whole screen again.
  const show = useEffectEvent(() => {
    if (shown !== start) onShow(shown)
  })
  useEffect(() => {
    const settled = setTimeout(show, 300)
    return () => clearTimeout(settled)
  }, [shown])

  // Focus goes back to the thumbnail that opened it, once the app under
  // it is no longer inert.
  const [opener] = useState(() => document.activeElement)
  useEffect(
    () => () => {
      setTimeout(() => {
        if (opener instanceof HTMLElement && opener.isConnected)
          opener.focus({ preventScroll: true })
      })
    },
    [opener]
  )

  // Escape closes it, as a dialog would; the arrow keys turn the pages.
  // Caught on the way down and stopped there, so neither the phone's sheet
  // nor the desktop card under it takes the same Escape and puts the site
  // down.
  // Before paint, so a viewer on screen is already listening.
  const close = useEffectEvent(onClose)
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
      else if (event.key === "ArrowLeft") {
        setPage((was) => Math.max(0, Math.min(was, images.length - 1) - 1))
      } else if (event.key === "ArrowRight") {
        setPage((was) => Math.min(images.length - 1, was + 1))
      } else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [images.length])

  // Links where there's a signal to follow them. The arrow marks one that
  // goes to this picture's own page, not the site's front page.
  const link = (href: string | undefined, text: string, own = false) =>
    online && href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
      >
        {text}
        {own && (
          <IconArrowUpRight
            aria-hidden
            className="ml-0.5 inline size-3 align-[-1px]"
          />
        )}
      </a>
    ) : (
      text
    )
  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label={`Maps and images of ${site.name}`}
      data-slot="image-viewer"
      className="dark fixed inset-0 z-50 bg-neutral-950 text-neutral-50"
    >
      {/* The pictures run the whole screen, so a zoomed one fills it once
          the bars have gone. */}
      <div className="absolute inset-0 flex flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <Shown value={{ images, page: shown }}>
          <ImagePages
            count={images.length}
            page={shown}
            onPage={setPage}
            maxScale={zoomFor(image, insetY)}
            keyOf={(i) => images[i].key}
            image={Picture}
            insetY={insetY}
            onZoom={setZoomed}
          />
        </Shown>
      </div>
      {/* Fixed rather than absolute, which sits the same, so iOS colours the
          status bar from this bar. Under a box that fills the screen, as the
          viewer does, it keeps the status bar's old colour. */}
      <div
        ref={top}
        className={cn(
          "fixed inset-x-0 top-0 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 bg-neutral-950 pt-[calc(env(safe-area-inset-top)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)] pl-[calc(env(safe-area-inset-left)+1rem)]",
          bars
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          // Focus moves into the viewer, out of the app gone inert under it.
          autoFocus
          className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 transition-opacity duration-150 outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-white/60 active:opacity-50 active:duration-0"
        >
          <IconX aria-hidden className="size-5" />
        </button>
        <h2
          aria-hidden
          className="line-clamp-2 text-center text-base leading-tight font-semibold tracking-[-0.015em] break-words"
        >
          {site.name}
        </h2>
      </div>
      {/* With a mouse, the way to the next image besides the keys. */}
      {shown > 0 && (
        <Turn label="Previous image" onClick={() => setPage(shown - 1)} />
      )}
      {shown < images.length - 1 && (
        <Turn next label="Next image" onClick={() => setPage(shown + 1)} />
      )}
      <div
        ref={bottom}
        className={cn(
          "absolute inset-x-0 bottom-0 bg-neutral-950 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]",
          bars
        )}
      >
        {/* Every image's words in one cell, the others hidden, so it is as
          tall as the longest and the pictures above don't move as they
          turn. */}
        <div className="mx-auto grid w-full max-w-xl shrink-0 px-4 pt-1 text-center">
          {images.map((each, i) => (
            <div
              key={each.key}
              className={cn(
                "col-start-1 row-start-1",
                i !== shown && "invisible"
              )}
            >
              {each.caption && (
                <p className="line-clamp-4 text-sm leading-5">{each.caption}</p>
              )}
              {/* The licence and the link kept whole, so a credit wraps
                between them, or within an author's long name. */}
              <p className="mt-1 text-xs leading-4 text-neutral-400">
                {each.author} ·{" "}
                <span className="whitespace-nowrap">
                  {link(each.licenceUrl, each.licence)} ·
                </span>{" "}
                <span className="whitespace-nowrap">
                  {link(each.page, "Wikimedia Commons", true)}
                </span>
              </p>
            </div>
          ))}
        </div>
        {images.length > 1 ? (
          <PageControl
            count={images.length}
            shown={shown}
            onPage={setPage}
            label="Maps and images"
            itemLabel={(i) => `Image ${i + 1}`}
          />
        ) : (
          <div aria-hidden className="h-4 shrink-0" />
        )}
        <div aria-hidden className="h-4" />
      </div>
    </div>,
    document.body
  )
}

function Turn({
  next = false,
  label,
  onClick,
}: {
  next?: boolean
  label: string
  onClick: () => void
}) {
  const Icon = next ? IconChevronRight : IconChevronLeft
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        // Solid and dark, as the image under it can be white.
        "absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-800 shadow-md ring-1 ring-white/15 transition-opacity duration-150 hover:opacity-80 active:opacity-60 active:duration-0 desk:inline-flex",
        next ? "right-4" : "left-4"
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  )
}
