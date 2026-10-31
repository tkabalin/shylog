import { useEffect, useReducer } from "react"

import { db as defaultDb, type Card, type LogDb } from "./db"
import { downloader } from "./downloads"
import { outcome, settled, type Settled } from "./samples"

export type Options = { db?: LogDb; fetch?: typeof globalThis.fetch }

export const keyOf = (cardId: string, hash: string) => `${cardId} ${hash}`

// The key of every page the cards name.
const namedKeys = (cards: readonly Card[]) =>
  new Set(
    cards.flatMap((card) => card.images.map((hash) => keyOf(card.id, hash)))
  )

// Fetched with the hash, so the server can let the browser keep it a year
// and refuses a stale one rather than answering with newer bytes. Built by
// hand, as Hono's client can't type a query the route doesn't validate.
async function fetchImage(
  cardId: string,
  n: number,
  hash: string,
  fetch: typeof globalThis.fetch = globalThis.fetch
) {
  const res = await fetch(
    `/api/cards/${encodeURIComponent(cardId)}/images/${n}?v=${hash}`,
    { headers: { "X-Shylog": "1" } }
  )
  if (!res.ok) {
    throw Object.assign(new Error(`Couldn’t load the card (${res.status})`), {
      status: res.status,
    })
  }
  return res.blob()
}

// Keeps a fetched page only while the log still names it: a sync since may
// have pruned it, and a row no card names would stay until the next one.
const keep = (db: LogDb, cardId: string, hash: string, blob: Blob) =>
  db.transaction("rw", db.cards, db.cardImages, async () => {
    const now = await db.cards.get(cardId)
    if (now?.images.includes(hash))
      await db.cardImages.put({ cardId, hash, blob })
  })

// One object URL per page, made once and shared by every screen showing it,
// so a card opens without a flash after its first time. A failure is kept
// until retried, since a fresh request on each render would loop.
const urls = new Map<string, Promise<string>>()
// The screens showing a failed page, drawn again on a retry.
const failed = new Set<() => void>()

// Lets the next imageUrl try again after a failure: Try again, or a
// download that has since kept the page.
export function retryCardImage(cardId: string, hash: string) {
  const key = keyOf(cardId, hash)
  const url = urls.get(key)
  if (!url || outcome(url).status !== "rejected") return
  urls.delete(key)
  for (const rerender of failed) rerender()
}

export function imageUrl(
  cardId: string,
  n: number,
  hash: string,
  { db = defaultDb, fetch }: Options = {}
): Promise<string> {
  const key = keyOf(cardId, hash)
  let url = urls.get(key)
  if (url) return url
  url = settled(
    (async () => {
      // A browser that refuses IndexedDB (a private window) still fetches.
      const kept = await db.cardImages
        .get([cardId, hash])
        .catch(() => undefined)
      if (kept) return URL.createObjectURL(kept.blob)
      const blob = await fetchImage(cardId, n, hash, fetch)
      // Kept in the background: the screen needn't wait for the write.
      keep(db, cardId, hash, blob).catch(() => {})
      return URL.createObjectURL(blob)
    })()
  )
  urls.set(key, url)
  return url
}

// How many cards the You tab shows, by their first page.
export const youCards = 3

// The You tab's pages, decoded and held. WebKit decodes a full-size
// screenshot as its tile mounts, blank meanwhile, unless an image it is
// still holding has already decoded it.
const held = new Map<string, HTMLImageElement>()

// Read and decoded as the log is, so the tab draws its cards at once, the
// first time it opens after a launch too.
export function warmCardImages(cards: readonly Card[], options?: Options) {
  const shown = new Map(
    cards
      .slice(0, youCards)
      .map((card) => [keyOf(card.id, card.images[0]!), card])
  )
  for (const key of held.keys()) if (!shown.has(key)) held.delete(key)
  for (const [key, card] of shown) {
    if (held.has(key)) continue
    const image = new Image()
    held.set(key, image)
    imageUrl(card.id, 0, card.images[0]!, options)
      .then((url) => {
        image.src = url
        return image.decode()
      })
      // Offline before the page was ever kept: the next sync's read tries
      // again.
      .catch(() => {
        if (held.get(key) === image) held.delete(key)
      })
  }
}

// A page's object URL, read without waiting once it has been made, so a
// card seen before draws on its first render.
export function useCardImage(
  cardId: string,
  n: number,
  hash: string
): Settled<string> {
  const url = imageUrl(cardId, n, hash)
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const now = outcome(url)
  useEffect(() => {
    if (now.status === "pending") url.then(rerender, rerender)
    if (now.status !== "rejected") return
    failed.add(rerender)
    return () => {
      failed.delete(rerender)
    }
  }, [url, now.status])
  return now
}

// Drops the copies of pages no card names any more, in the same transaction
// as a sync that writes the log, but not one a save still holds (in any
// tab: the log this sync fetched may predate it). By key, so no image is read.
export async function pruneCardImages(db: LogDb, cards: readonly Card[]) {
  const named = namedKeys(cards)
  const held = new Set(
    (
      await db.cardImages.where("heldUntil").above(Date.now()).primaryKeys()
    ).map(([cardId, hash]) => keyOf(cardId, hash))
  )
  const keys = await db.cardImages.toCollection().primaryKeys()
  await db.cardImages.bulkDelete(
    keys.filter(([cardId, hash]) => {
      const key = keyOf(cardId, hash)
      return !named.has(key) && !held.has(key)
    })
  )
}

// Once the log is read again, in every tab, as each keeps its own: forgets
// the URLs of pages no card names. Not revoked, as a screen opened before
// the change (Edit card) may still show one; each goes with the tab.
export function forgetCardUrls(cards: readonly Card[]) {
  const named = namedKeys(cards)
  for (const key of urls.keys()) if (!named.has(key)) urls.delete(key)
}

// After a sync: every page the phone doesn't keep yet, one at a time, so a
// card opens with no signal even if it was never opened on this phone. A
// page the server no longer has is skipped; anything else, the connection
// lost or the server down, ends the run, and the next sync tries again.
export const downloadCardImages = downloader(
  "Card",
  (cards: readonly Card[], options: Options = {}) => download(cards, options)
)

async function download(
  cards: readonly Card[],
  { db = defaultDb, fetch }: Options
) {
  const kept = new Set(
    (await db.cardImages.toCollection().primaryKeys()).map(([id, hash]) =>
      keyOf(id, hash)
    )
  )
  for (const card of cards) {
    for (const [n, hash] of card.images.entries()) {
      const key = keyOf(card.id, hash)
      if (kept.has(key)) continue
      // A screen already fetching it keeps it; only a failed one is fetched
      // again here.
      const shown = urls.get(key)
      if (shown && outcome(shown).status !== "rejected") {
        await shown.catch(() => {})
        continue
      }
      let blob: Blob
      try {
        blob = await fetchImage(card.id, n, hash, fetch)
      } catch (error) {
        // A 404 is a page changed since the log was read; a 502 while the
        // server restarts would fail for every page after it too.
        if ((error as { status?: number }).status !== 404) throw error
        console.debug(error)
        continue
      }
      await keep(db, card.id, hash, blob)
      retryCardImage(card.id, hash)
    }
  }
}

// For tests: forget the object URLs, so each starts from the phone's copy.
export function forgetCardImages() {
  urls.clear()
  failed.clear()
  held.clear()
  downloadCardImages.reset()
}
