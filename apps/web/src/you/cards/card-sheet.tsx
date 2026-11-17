import { useEffect, useRef, useState, type Ref } from "react"
import { cardCrop, cardMaxPages, newId } from "@shylog/core"
import {
  IconChevronRight,
  IconPhotoPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { AnimatePresence, motion, MotionConfig, Reorder } from "motion/react"
import { cn } from "cn"

import {
  BarButton,
  FullSheetContent,
  keyboardPad,
  SheetBar,
} from "@/components/pickers/sheet"
import { DiscardSheet } from "@/components/discard-sheet"
import { OfflineMark } from "@/components/offline-mark"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { deleteCard, readPicks, saveCard, type Picks } from "@/data/card-edits"
import type { Card } from "@/data/db"
import { Segmented } from "@/dive/form/rows"
import { useConnected } from "@/data/sync-status"
import { useDesk } from "@/hooks/use-desk"
import { isReturn } from "@/lib/keys"
import { useHoldUpdate } from "@/update"
import { CardThumb, PageImage, type PageSource } from "@/you/cards/card-thumb"
import { CropSheet } from "@/you/cards/crop-sheet"
import { thumbEdit, type KeyedCrop } from "@/you/cards/thumb-edit"
import { accept } from "@/you/cards/load-sheet"
import { useLift } from "@/you/cards/use-lift"
import { pressable } from "@/you/parts"

// A page in the sheet: one the card has (by its hash and place on the
// server), or a picked file. Each picked file has a card id of its own for
// saving as a separate card, kept across a retry so a save whose reply was
// lost isn't made twice.
type Page = { key: string; cardId: string } & (
  | { hash: string; n: number; file?: undefined }
  | { file: File; hash?: undefined }
)

const filePages = (files: readonly File[]): Page[] =>
  files.map((file) => ({ key: newId("card"), cardId: newId("card"), file }))

// CertsHifi's New card and Edit card, as a full-height sheet over the list
// or the viewer. New opens with the screenshots just picked; several
// can be one card with pages or a card each. A long press lifts a page to
// drag it into a new place.
export function CardSheet({
  open,
  onOpenChange,
  card,
  picked,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The card being edited, or none for a new one.
  card?: Card
  // A new card's first screenshots, read by readPicks, and what was wrong
  // with any it left out.
  picked?: Picks
  onDeleted?: () => void
}) {
  const desk = useDesk()
  // Mounted by the tap that opens it, so it starts closed for a frame:
  // a drawer that mounts open skips its entrance.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const [pages, setPages] = useState((): Page[] =>
    card
      ? card.images.map((hash, n) => ({
          key: `${n} ${hash}`,
          cardId: card.id,
          hash,
          n,
        }))
      : filePages(picked?.good ?? [])
  )
  const [name, setName] = useState(card?.name ?? "")
  const [names, setNames] = useState<Record<string, string>>({})
  const [separate, setSeparate] = useState(false)
  // Set once a separate save has stored one, so the last page left keeps
  // its own name and card id rather than becoming a new one-card save.
  const [split, setSplit] = useState(false)
  const [newCardId] = useState(() => newId("card"))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(picked?.problem)
  const [asking, setAsking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // The thumbnail's crop with the page it was made on, so it applies only
  // while that page is first and comes back if it returns there; and as it
  // was when the sheet opened, so a sync meanwhile isn't taken for an edit.
  const [opened] = useState((): KeyedCrop => {
    const kept = card && cardCrop(card)
    return kept ? { key: pages[0]!.key, crop: kept } : null
  })
  const [crop, setCrop] = useState(opened)
  const [cropping, setCropping] = useState(false)
  const more = useRef<HTMLInputElement>(null)
  const shots = useRef<HTMLDivElement>(null)
  // Pages added with Add more go at the end, out of sight once there are a
  // few: the strip is brought there, and kept there as they load.
  const following = useRef(false)
  const toEnd = () =>
    shots.current?.scrollTo({
      left: shots.current.scrollWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    })

  const editing = !!card
  const many = pages.length > 1
  const apart = !editing && (many || split) && separate
  const tooMany = !apart && pages.length > cardMaxPages
  const first = pages[0]
  const { thumb, touched, send } = thumbEdit(opened, crop, first?.key)
  const changed = editing
    ? name !== card.name ||
      pages.map((page) => page.hash ?? page.key).join() !==
        card.images.join() ||
      touched
    : pages.length > 0
  const named = apart
    ? pages.every((page) => names[page.key]?.trim())
    : !!name.trim()
  // Cards are saved on the server, so Save and Delete wait for it.
  const connected = useConnected()
  const ready = changed && named && pages.length > 0 && !tooMany && connected
  useHoldUpdate(open && changed)

  const save = async () => {
    setBusy(true)
    setError(undefined)
    try {
      if (apart) {
        // One at a time, each leaving the sheet once saved, so a failure
        // keeps only those still to go. Only the last waits for the log,
        // whose sync brings them all.
        for (const [i, page] of pages.entries()) {
          // The first goes under the one-card id, so a one-card save whose
          // reply was lost is turned into this card rather than left beside.
          const id = i === 0 && !split ? newCardId : page.cardId
          await saveCard(id, names[page.key]!.trim(), [page.file!], {
            settle: i === pages.length - 1,
          })
          setSplit(true)
          setPages((was) => was.filter((one) => one.key !== page.key))
        }
      } else {
        await saveCard(
          card?.id ?? newCardId,
          name.trim(),
          pages.map((page) => page.file ?? page.hash),
          { thumb: send }
        )
      }
      onOpenChange(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (busy) return
    if (changed) setAsking(true)
    else onOpenChange(false)
  }

  return (
    <>
      <Drawer
        showSwipeHandle
        open={open && mounted}
        // Picked screenshots or edits would be lost to a swipe or a tap
        // outside, so only Cancel or Save close it, as iOS holds a sheet.
        disablePointerDismissal
        onOpenChange={(next, details) => {
          if (next) return onOpenChange(true)
          if (details.reason === "swipe" || details.reason === "escape-key")
            close()
          else if (!changed) onOpenChange(false)
        }}
      >
        <FullSheetContent
          // As a dialog it fits what it holds, up to the sheet's height.
          className={cn(
            "desk:h-auto desk:max-h-[min(40rem,calc(100dvh-4rem))]",
            editing && overViewer
          )}
        >
          <SheetBar
            title={editing ? "Edit card" : "New card"}
            start={<BarButton onClick={close}>Cancel</BarButton>}
            end={
              <BarButton strong disabled={!ready || busy} onClick={save}>
                Save
              </BarButton>
            }
            mark={<OfflineMark show={!connected} className="mx-1 desk:mx-0" />}
          />
          <div
            ref={keyboardPad}
            // A drag in the sheet scrolls or reorders, never pulls it down.
            data-base-ui-swipe-ignore=""
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 pt-2 pb-[max(2rem,env(safe-area-inset-bottom),var(--keyboard,0px))]"
          >
            <section aria-labelledby="card-shots" className="flex flex-col">
              <h3
                id="card-shots"
                className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground"
              >
                Screenshots
              </h3>
              {/* Under reduced motion the pages swap places at once. */}
              <MotionConfig reducedMotion="user">
                <Reorder.Group
                  as="div"
                  axis="x"
                  values={pages}
                  onReorder={setPages}
                  layoutScroll
                  ref={shots}
                  // Each new page widens as its image loads, so the strip
                  // keeps to its end until a finger takes it.
                  onLoadCapture={() => following.current && toEnd()}
                  onPointerDown={() => (following.current = false)}
                  // Room above and below for a lifted page and its shadow,
                  // which the scroller would clip, given back by the margin.
                  className="-mx-4 -mt-3.5 -mb-2.5 flex [scrollbar-width:none] gap-2.5 overflow-x-auto overscroll-x-contain px-4.5 py-4"
                >
                  {/* Pages added or removed fade in and out while the rest
                    slide over, rather than the strip jumping; the pages it
                    opens with are simply there. */}
                  <AnimatePresence initial={false} mode="popLayout">
                    {pages.map((page, i) => (
                      <Shot
                        key={page.key}
                        page={page}
                        card={card}
                        label={`Screenshot ${i + 1}`}
                        onRemove={() =>
                          setPages((was) => was.filter((one) => one !== page))
                        }
                      />
                    ))}
                  </AnimatePresence>
                  {pages.length < cardMaxPages || apart ? (
                    <motion.button
                      layout="position"
                      transition={strip}
                      type="button"
                      onClick={() => more.current?.click()}
                      className="flex h-33 w-23 shrink-0 flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-muted-foreground/50 text-[13px] font-medium text-primary transition-opacity duration-150 hover:opacity-70 active:opacity-50 active:duration-0"
                    >
                      <IconPhotoPlus aria-hidden className="size-5.5" />
                      Add more
                    </motion.button>
                  ) : null}
                </Reorder.Group>
              </MotionConfig>
              <input
                ref={more}
                type="file"
                accept={accept(desk)}
                multiple
                hidden
                onChange={async (event) => {
                  const files = [...(event.target.files ?? [])]
                  event.target.value = ""
                  const { good, problem } = await readPicks(files)
                  setPages((was) => [...was, ...filePages(good)])
                  setError(problem)
                  following.current = true
                  requestAnimationFrame(toEnd)
                }}
              />
            </section>

            {!editing && many && (
              <Segmented
                labelledBy="card-shots"
                value={separate ? "separate" : "one"}
                // Tapping the chosen one again keeps it: there's no empty.
                onChange={(next) => next && setSeparate(next === "separate")}
                options={[
                  { value: "one", label: `One card, ${pages.length} pages` },
                  {
                    value: "separate",
                    label: `${pages.length} separate cards`,
                  },
                ]}
                className="-mt-2"
              />
            )}

            {/* The first page as the tiles show it, opening its crop; under
                the one-or-separate choice, so its going doesn't move that from
                under the finger. Cards saved apart are cropped in Edit card. */}
            {first && !apart && (
              <button
                type="button"
                onClick={() => setCropping(true)}
                className={cn(
                  "-mt-2 flex min-h-12 w-full items-center gap-3 rounded-[14px] bg-card px-3 py-2 text-left ring-1 ring-foreground/10 transition-colors duration-150 select-none [-webkit-touch-callout:none]",
                  pressable
                )}
              >
                <CardThumb
                  source={sourceOf(first, card)}
                  crop={thumb}
                  className="w-24 rounded-[9px] bg-muted ring-1 ring-foreground/10"
                />
                <span className="flex-1 text-base font-medium">Thumbnail</span>
                <IconChevronRight
                  aria-hidden
                  className="size-4.5 shrink-0 text-muted-foreground/60"
                />
              </button>
            )}

            {apart ? (
              <section aria-labelledby="card-names" className="flex flex-col">
                <h3
                  id="card-names"
                  className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground"
                >
                  Names
                </h3>
                <div className="flex flex-col divide-y overflow-hidden rounded-[14px] bg-card ring-1 ring-foreground/10">
                  {pages.map((page, i) => (
                    <label
                      key={page.key}
                      className="flex min-h-11.5 items-center gap-3 px-4"
                    >
                      {/* At the card's shape, as every thumbnail is. */}
                      <CardThumb
                        source={sourceOf(page)}
                        crop={null}
                        className="w-10 rounded-md bg-muted ring-1 ring-foreground/10"
                      />
                      <input
                        type="text"
                        // A card's name: no identity autofill (see RowInput),
                        // nor iOS's contact AutoFill, which Safari leaves off
                        // a field whose name says search.
                        data-bwignore
                        autoComplete="off"
                        name={`search-card-${i + 1}`}
                        value={names[page.key] ?? ""}
                        onChange={(event) =>
                          setNames((was) => ({
                            ...was,
                            [page.key]: event.target.value,
                          }))
                        }
                        placeholder={`Name for screenshot ${i + 1}`}
                        aria-label={`Name for screenshot ${i + 1}`}
                        maxLength={120}
                        autoCapitalize="words"
                        autoCorrect="off"
                        spellCheck={false}
                        // Return moves on to the next page's name, and
                        // closes the keyboard after the last.
                        enterKeyHint={i < pages.length - 1 ? "next" : "done"}
                        onKeyDown={(event) => {
                          if (!isReturn(event)) return
                          event.preventDefault()
                          const next = event.currentTarget
                            .closest("label")
                            ?.nextElementSibling?.querySelector("input")
                          if (next) next.focus()
                          else event.currentTarget.blur()
                        }}
                        className="h-11.5 min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : (
              <label className="flex flex-col gap-2">
                <span className="px-1 text-[13px] font-semibold text-muted-foreground">
                  Name
                </span>
                <input
                  type="text"
                  data-bwignore
                  autoComplete="off"
                  name="search-card"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Rescue Diver"
                  maxLength={120}
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  onKeyDown={(event) => {
                    if (!isReturn(event)) return
                    event.preventDefault()
                    event.currentTarget.blur()
                  }}
                  className="h-11.5 rounded-xl bg-card px-3.5 text-base ring-1 ring-foreground/10 outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </label>
            )}

            {(error || tooMany) && (
              <p
                role="alert"
                className="-mt-2 px-1 text-[13px] text-destructive"
              >
                {error ??
                  `A card has up to ${cardMaxPages} screenshots. ${editing ? "Remove some." : "Save them as separate cards, or remove some."}`}
              </p>
            )}

            {editing && (
              <button
                type="button"
                disabled={!connected}
                onClick={() => setDeleting(true)}
                className="mt-2 inline-flex h-11 items-center gap-2 self-center px-4 text-[15px] font-medium text-destructive transition-[opacity,color] duration-150 hover:opacity-70 active:opacity-50 active:duration-0 disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-60"
              >
                <IconTrash aria-hidden className="size-4.5" />
                Delete card
              </button>
            )}
          </div>
        </FullSheetContent>
      </Drawer>

      {first && (
        <CropSheet
          open={cropping}
          onOpenChange={setCropping}
          source={sourceOf(first, card)}
          crop={thumb}
          // Done with no crop on a page that had none changes nothing, so a
          // crop on a page moved back from first still returns with it.
          onDone={(made) => {
            if (made) setCrop({ key: first.key, crop: made })
            else if (thumb) setCrop(null)
          }}
          className={editing ? overViewer : undefined}
        />
      )}
      <DiscardSheet
        open={asking}
        title={editing ? "Discard changes?" : "Discard this card?"}
        note={
          editing
            ? "The card stays as it was."
            : "The screenshots you picked aren’t saved."
        }
        cta={editing ? "Discard changes" : "Discard card"}
        className={editing ? overViewer : undefined}
        onKeep={() => setAsking(false)}
        onDiscard={() => {
          setAsking(false)
          onOpenChange(false)
        }}
      />
      {card && (
        <DeleteCardSheet
          open={deleting}
          onOpenChange={setDeleting}
          cardId={card.id}
          onDeleted={() => {
            setDeleting(false)
            onOpenChange(false)
            onDeleted?.()
          }}
        />
      )}
    </>
  )
}

function sourceOf(page: Page, card?: Card): PageSource {
  if (page.file) return { file: page.file }
  // Fetched at its place in the card as the log has it now: another phone
  // may have reordered it since the sheet opened, and the server refuses
  // a page asked for at its old place.
  const now = card?.images.indexOf(page.hash) ?? -1
  return { cardId: card!.id, n: now >= 0 ? now : page.n, hash: page.hash }
}

// The strip's pages and its Add more settle together: critically damped,
// as nothing was thrown, and quick, so a swap keeps up with the finger.
const strip = { type: "spring", bounce: 0, visualDuration: 0.12 } as const

// Edit card and what it asks open over the viewer, which covers the
// sidebar too, so as dialogs they centre on the window, not the column.
const overViewer = "desk:left-1/2"

// A page in the strip, lifted by a long press to drag along it (useLift).
function Shot({
  ref,
  page,
  card,
  label,
  onRemove,
}: {
  // AnimatePresence's, to take a removed page out of the flow.
  ref?: Ref<HTMLDivElement>
  page: Page
  card?: Card
  label: string
  onRemove: () => void
}) {
  const { item, ref: liftRef, lifted } = useLift()

  return (
    <Reorder.Item
      as="div"
      ref={(element: HTMLDivElement | null) => {
        liftRef(element)
        if (typeof ref === "function") ref(element)
        else if (ref) ref.current = element
      }}
      value={page}
      {...item}
      // Added and removed, it fades; opacity alone, which Motion hands to
      // the compositor, as the drag already moves it on the main thread.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={strip}
      className={cn(
        "relative shrink-0 select-none [-webkit-touch-callout:none]",
        // Its own layer while dragged, so each frame moves it rather than
        // repainting its screenshot and shadow.
        lifted && "z-10 will-change-transform"
      )}
    >
      {/* Lifted, it grows a little and its deeper shadow fades in, as a
          dragged item's does on iOS: scale and opacity, which the compositor
          draws, not a box-shadow repainted each frame. */}
      <span
        className={cn(
          "relative block rounded-[10px] shadow-xs transition-[scale] duration-150 ease-out after:pointer-events-none after:absolute after:inset-0 after:rounded-[10px] after:shadow-lg after:transition-opacity after:duration-150 after:ease-out motion-reduce:transition-none",
          lifted
            ? "scale-105 after:opacity-100 motion-reduce:scale-100"
            : "after:opacity-0"
        )}
      >
        <PageImage
          source={sourceOf(page, card)}
          className="block h-33 w-auto max-w-50 min-w-16 rounded-[10px] bg-muted object-cover ring-1 ring-foreground/10"
        />
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label.toLowerCase()}`}
        className="absolute top-1.5 right-1.5 inline-flex size-6.5 items-center justify-center rounded-full bg-black/55 text-white transition-opacity duration-150 after:absolute after:-inset-2.5 hover:opacity-80 active:opacity-60 active:duration-0"
      >
        <IconX aria-hidden className="size-3.5 stroke-[2.5]" />
      </button>
    </Reorder.Item>
  )
}

// As the dive's delete sheet asks. Calls `onDeleted` once the server has
// it, before the sync drops it from the log.
function DeleteCardSheet({
  open,
  onOpenChange,
  cardId,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardId: string
  onDeleted: () => void
}) {
  const desk = useDesk()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const body =
    "It goes from Shylog on every device. Your agency’s app still has the card."

  const connected = useConnected()
  const confirm = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await deleteCard(cardId)
      onDeleted()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  const change = (next: boolean) => {
    if (busy) return
    if (!next) setError(undefined)
    onOpenChange(next)
  }
  const errorLine = error && (
    <p
      role="alert"
      className="text-center text-[13px] text-destructive desk:text-left"
    >
      {error}
    </p>
  )

  return (
    <Drawer showSwipeHandle open={open} onOpenChange={change}>
      {desk ? (
        <DrawerContent role="alertdialog" className={overViewer}>
          <DrawerHeader>
            <DrawerTitle>Delete this card?</DrawerTitle>
            <DrawerDescription>{body}</DrawerDescription>
            {errorLine}
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !connected}
              onClick={confirm}
            >
              {error ? "Try again" : "Delete card"}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      ) : (
        <DrawerContent role="alertdialog">
          <DrawerHeader className="pb-4">
            <DrawerTitle>Delete this card?</DrawerTitle>
            <DrawerDescription>{body}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {errorLine}
            <Button
              variant="destructive"
              className="h-12 rounded-[14px] bg-destructive text-base font-semibold text-white hover:bg-destructive/90 dark:bg-red-600 dark:hover:bg-red-600/90"
              disabled={busy || !connected}
              onClick={confirm}
            >
              {error ? "Try again" : "Delete card"}
            </Button>
            <Button
              variant="ghost"
              className="h-12 rounded-[14px] text-base font-semibold text-primary"
              onClick={() => change(false)}
            >
              Cancel
            </Button>
          </div>
        </DrawerContent>
      )}
    </Drawer>
  )
}
