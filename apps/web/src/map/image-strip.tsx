import type { CSSProperties } from "react"
import { cn } from "cn"

import { useSiteImages, type ImageKind } from "./site-images"
import type { Site } from "./sites"

// What a thumbnail is to a screen reader where its page gave no caption.
export const kindNames: Record<ImageKind, string> = {
  map: "Site map",
  sonar: "Sonar image",
  aerial: "Aerial photo",
  plan: "Plan of the wreck",
}

// The thumbnails' height, which scripts/map/images.ts makes them for at 3×,
// and the widths a wide or tall one is cropped to.
const height = 112
const narrowest = 84
const widest = 252

// A site's maps and images in a row that scrolls sideways, under its
// summary, each opening the viewer; from desk: up a grid of even tiles
// three across, as a mouse can't easily scroll sideways and mixed widths
// wrap raggedly in the card. Nothing where its page has none.
export function ImageStrip({
  site,
  onOpen,
  className,
}: {
  site: Site
  onOpen: (index: number) => void
  className?: string
}) {
  const images = useSiteImages(site.id)
  if (!images?.length) return null
  return (
    <ul
      aria-label="Maps and images"
      className={cn(
        "flex snap-x [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain desk:grid desk:grid-cols-3 desk:overflow-visible",
        className
      )}
    >
      {images.map((image, i) => {
        const width = Math.round(
          Math.min(
            widest,
            Math.max(narrowest, (height * image.width) / image.height)
          )
        )
        return (
          <li key={image.key} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => onOpen(i)}
              aria-label={image.caption || kindNames[image.kind]}
              className="block overflow-hidden rounded-[10px] bg-muted ring-1 ring-border transition-opacity duration-150 active:opacity-70 active:duration-0 desk:w-full desk:hover:opacity-85"
            >
              <img
                src={image.thumb}
                alt=""
                width={width}
                height={height}
                loading="lazy"
                decoding="async"
                draggable={false}
                // White behind line drawings, often transparent.
                className="h-28 w-(--width) bg-white object-cover desk:aspect-[4/3] desk:h-auto desk:w-full"
                style={{ "--width": `${width}px` } as CSSProperties}
              />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
