import { useEffect, useRef, type ComponentProps } from "react"
import { cardAspect, type CardCrop } from "@shylog/core"
import { cn } from "cn"

import { CardImage } from "@/you/cards/card-image"

// A page to show: one a card has, or a picked file not uploaded yet.
export type PageSource =
  { cardId: string; n: number; hash: string; file?: undefined } | { file: File }

// The image's size at a zoom of 1, as fractions of the card-shaped frame:
// just covering it, as object-fit: cover would.
export const coverOf = (aspect: number) =>
  aspect < cardAspect
    ? { width: 1, height: cardAspect / aspect }
    : { width: aspect / cardAspect, height: 1 }

// Where the image goes in the frame for a crop, as fractions of the frame,
// kept covering it however the numbers came.
export function thumbBox(crop: CardCrop) {
  const cover = coverOf(crop.aspect)
  const width = cover.width * crop.scale
  const height = cover.height * crop.scale
  const clamp = (value: number, size: number) =>
    Math.min(0, Math.max(1 - size, value))
  return {
    width,
    height,
    left: clamp(0.5 - crop.x * width, width),
    top: clamp(0.5 - crop.y * height, height),
  }
}

// With `retry`, a card's page says it's loading or couldn't be had, as the
// viewer does; a picked file is already on the phone.
export function PageImage({
  source,
  retry,
  ...props
}: { source: PageSource; retry?: boolean } & Omit<
  ComponentProps<"img">,
  "src" | "ref"
>) {
  if (source.file) return <FileImage file={source.file} {...props} />
  return (
    <CardImage
      cardId={source.cardId}
      n={source.n}
      hash={source.hash}
      retry={retry}
      {...props}
    />
  )
}

// One object URL per picked file, shared by the strip, the names and the
// crop, so the browser can share one decode of a ~14 MB screenshot rather
// than make one per URL. Let go once the last image showing it unmounts.
const fileUrls = new WeakMap<File, { url: string; users: number }>()

// A picked file shown before it uploads. Its URL is set on the element in
// an effect, so StrictMode's second mount makes a new one rather than
// reusing one the first unmount revoked.
function FileImage({
  file,
  ...props
}: { file: File } & Omit<ComponentProps<"img">, "src" | "ref">) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const held = fileUrls.get(file) ?? {
      url: URL.createObjectURL(file),
      users: 0,
    }
    held.users++
    fileUrls.set(file, held)
    image.current?.setAttribute("src", held.url)
    return () => {
      if (--held.users) return
      URL.revokeObjectURL(held.url)
      fileUrls.delete(file)
    }
  }, [file])
  return <img ref={image} alt="" draggable={false} {...props} />
}

// A card's first page at a bank card's shape: its centre, or its crop
// placed by percentages of the clipped frame (WebKit has no
// object-view-box). The crop carries the page's shape, so it is placed on
// the first render. The frame's size and corners come from `className`.
export function CardThumb({
  source,
  crop,
  className,
}: {
  source: PageSource
  crop: CardCrop | null
  className?: string
}) {
  const box = crop && thumbBox(crop)
  return (
    <span
      className={cn(
        "relative block aspect-[1.586] shrink-0 overflow-hidden",
        className
      )}
    >
      <PageImage
        source={source}
        style={
          box
            ? {
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
                left: `${box.left * 100}%`,
                top: `${box.top * 100}%`,
                maxWidth: "none",
              }
            : undefined
        }
        className="absolute inset-0 size-full object-cover"
      />
    </span>
  )
}
