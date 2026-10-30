import type { ComponentProps } from "react"
import { IconLoader2, IconPhotoOff } from "@tabler/icons-react"
import { cn } from "cn"

import { retryCardImage, useCardImage } from "@/data/cards"

// One page of a card from the phone's copy, fetched the first time. Blank
// while it loads (from the phone it is a frame or two), and a crossed-out
// photo when it can't be had; with `retry`, as the viewer has, it says so
// and offers to try again.
export function CardImage({
  cardId,
  n,
  hash,
  retry,
  className,
  ...props
}: { cardId: string; n: number; hash: string; retry?: boolean } & Omit<
  ComponentProps<"img">,
  "src"
>) {
  const url = useCardImage(cardId, n, hash)
  if (url.status === "rejected" && retry)
    return (
      <span
        role="status"
        className="flex flex-col items-center gap-3 text-center text-sm text-neutral-400"
      >
        <IconPhotoOff aria-hidden className="size-6" />
        This screenshot couldn’t be loaded.
        <button
          type="button"
          onClick={() => retryCardImage(cardId, hash)}
          className="inline-flex h-11 items-center rounded-full bg-white/10 px-4 text-[15px] font-medium text-neutral-50 transition-opacity duration-150 hover:opacity-70 active:opacity-50 active:duration-0"
        >
          Try again
        </button>
      </span>
    )
  if (url.status === "rejected")
    return (
      <span
        className={cn(
          "flex items-center justify-center text-muted-foreground/60",
          className
        )}
      >
        <IconPhotoOff aria-hidden className="size-5" />
      </span>
    )
  // The viewer says it's loading once it's been a moment, as the profile
  // card waits 150 ms, so a page from the phone never flashes it.
  if (url.status !== "fulfilled" && retry)
    return (
      <span
        role="status"
        className="animate-in delay-150 duration-200 fade-in-0 fill-mode-both"
      >
        <IconLoader2
          aria-hidden
          className="size-6 animate-spin text-neutral-500 motion-reduce:animate-none"
        />
        <span className="sr-only">Loading the screenshot</span>
      </span>
    )
  if (url.status !== "fulfilled") return <span className={className} />
  return (
    <img
      src={url.value}
      alt=""
      draggable={false}
      className={className}
      {...props}
    />
  )
}
