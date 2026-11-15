import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"

import {
  cardHash,
  cardMaxPages,
  type CardCrop,
  type CardThumb,
} from "@shylog/core"

import { Rejected } from "../apply/rejected.ts"
import { schemaVersion } from "../db/migrate.ts"
import type { Db } from "../db/open.ts"
import { prepared } from "../db/prepared.ts"
import { syncDir } from "../fs.ts"
import type { Entry } from "../journal.ts"
import { logger } from "../log.ts"

export interface Image {
  hash: string
  contentType: string
}

// A page as sent: a new image, or the hash of one the card already has.
export type Page = string | { bytes: Uint8Array; contentType: string }

export const cardsDir = (dataDir: string) => join(dataDir, "cards")

export function readCards(db: Db) {
  // Added by migration 12. A database that failed its check isn't migrated
  // but the log is still served from it, so it may not have the column yet.
  const thumb = schemaVersion(db) >= 12 ? "thumb" : "NULL AS thumb"
  return prepared<
    [],
    { id: string; name: string; images: string; thumb: string | null }
  >(
    db,
    `SELECT id, name, (SELECT json_group_array(hash ORDER BY n)
       FROM certification_images WHERE card_id = id) AS images, ${thumb}
     FROM certifications ORDER BY position`
  )
    .all()
    .map((card) => ({
      ...card,
      images: JSON.parse(card.images) as string[],
      thumb: card.thumb === null ? null : (JSON.parse(card.thumb) as CardThumb),
    }))
}

function readThumb(db: Db, id: string) {
  const json = prepared<[string], string | null>(
    db,
    "SELECT thumb FROM certifications WHERE id = ?"
  )
    .pluck()
    .get(id)
  return json ? (JSON.parse(json) as CardThumb) : null
}

export const imagesOf = (db: Db, id: string) =>
  prepared<[string], Image>(
    db,
    "SELECT hash, content_type AS contentType FROM certification_images WHERE card_id = ? ORDER BY n"
  ).all(id)

export const hashOf = (bytes: Uint8Array) =>
  cardHash(createHash("sha256").update(bytes).digest())

type Commit<T> = (apply: () => boolean, entry: Entry) => T

// Files named by their hash are written, flushed, and renamed into place
// before the commit, and the ones the card no longer uses are removed only
// after, so a crash never leaves the database naming a missing file.
export function saveCard<T>(
  db: Db,
  dir: string,
  id: string,
  name: string,
  pages: Page[],
  // The crop of the first page as sent, null to clear it, or none to keep
  // the stored one.
  crop: CardCrop | null | undefined,
  commit: Commit<T>
): T {
  if (pages.length === 0 || pages.length > cardMaxPages) {
    throw new Rejected(`A card has 1 to ${cardMaxPages} images`, 400, [
      "images",
    ])
  }
  const current = imagesOf(db, id)
  const next = pages.map((page, i): Image & { bytes?: Uint8Array } => {
    if (typeof page !== "string") {
      return { ...page, hash: hashOf(page.bytes) }
    }
    const kept = current.find((image) => image.hash === page)
    if (!kept) {
      throw new Rejected("This card has no such image", 400, ["images", i])
    }
    return kept
  })

  const folder = join(dir, id)
  try {
    let wrote = false
    const newCardsDir = !existsSync(dir)
    for (const page of next) {
      const file = join(folder, page.hash)
      if (!page.bytes || existsSync(file)) continue
      mkdirSync(folder, { recursive: true })
      writeFileSync(`${file}.tmp`, page.bytes, { flush: true })
      renameSync(`${file}.tmp`, file)
      wrote = true
    }
    // The folder may be new, so its own entry in cards/ is flushed as well,
    // and cards/ in the data folder when it is new too.
    if (wrote) {
      syncDir(folder)
      syncDir(dir)
      if (newCardsDir) syncDir(dirname(dir))
    }
    const images = next.map(({ hash, contentType }) => ({ hash, contentType }))
    const first = images[0]!.hash
    // Keyed here, so the phone needs no hash of a page it is still sending.
    // Left out, the stored crop stays while its page is first, so an app
    // that never touched it (an older one, a stale sheet) doesn't drop it.
    const stored = readThumb(db, id)
    const thumb =
      crop === undefined
        ? stored?.hash === first
          ? stored
          : null
        : crop && { hash: first, ...crop }
    return commit(
      () => writeCard(db, id, name, images, true, thumb),
      // With their types, so a replay can rebuild the rows, and where a new
      // card goes, as entries from before new cards went first put it last.
      { type: "putCard", payload: { id, name, images, first: true, thumb } }
    )
  } finally {
    prune(db, folder, id)
  }
}

// The rows alone, which a replay applies too: the files are already in
// cards/. True when the card changed, so a repeated save writes nothing.
export function writeCard(
  db: Db,
  id: string,
  name: string,
  images: Image[],
  first: boolean,
  thumb: CardThumb | null
): boolean {
  const stored = prepared<[string], { name: string; thumb: string | null }>(
    db,
    "SELECT name, thumb FROM certifications WHERE id = ?"
  ).get(id)
  const hashes = (list: Image[]) => list.map((image) => image.hash).join()
  const json = thumb && JSON.stringify(thumb)
  if (
    stored?.name === name &&
    stored.thumb === json &&
    hashes(imagesOf(db, id)) === hashes(images)
  ) {
    return false
  }
  // A new card goes first in the list, as the latest earned is likeliest
  // the one a dive centre asks for.
  prepared(
    db,
    `INSERT INTO certifications (id, name, position, thumb)
     VALUES (?, ?, (SELECT CASE WHEN ? THEN coalesce(min(position), 1) - 1
       ELSE coalesce(max(position), -1) + 1 END FROM certifications), ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, thumb = excluded.thumb`
  ).run(id, name, first ? 1 : 0, json)
  prepared(db, "DELETE FROM certification_images WHERE card_id = ?").run(id)
  images.forEach((image, n) =>
    prepared(
      db,
      "INSERT INTO certification_images (card_id, n, content_type, hash) VALUES (?, ?, ?, ?)"
    ).run(id, n, image.contentType, image.hash)
  )
  return true
}

// The cards in the owner's order, named every one once, so an order made
// before another phone added or deleted a card is refused, not half kept.
// True when it changed.
export function writeOrder(db: Db, ids: string[]): boolean {
  const current = prepared<[], string>(
    db,
    "SELECT id FROM certifications ORDER BY position"
  )
    .pluck()
    .all()
  const known = new Set(current)
  if (
    ids.length !== current.length ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => known.has(id))
  ) {
    throw new Rejected("The cards have changed; try again", 409, ["ids"])
  }
  if (ids.join() === current.join()) return false
  ids.forEach((id, position) =>
    prepared(db, "UPDATE certifications SET position = ? WHERE id = ?").run(
      position,
      id
    )
  )
  return true
}

export function removeCard(db: Db, id: string): boolean {
  prepared(db, "DELETE FROM certification_images WHERE card_id = ?").run(id)
  return (
    prepared(db, "DELETE FROM certifications WHERE id = ?").run(id).changes > 0
  )
}

export function deleteCard<T>(
  db: Db,
  dir: string,
  id: string,
  commit: Commit<T>
): T {
  try {
    return commit(() => removeCard(db, id), {
      type: "deleteCard",
      payload: { id },
    })
  } finally {
    prune(db, join(dir, id), id)
  }
}

// Removes the files in a card's folder that the database doesn't name, and
// the folder once empty. It runs after the commit, so a failure is only
// logged: the change stands, and the card's next save prunes again.
function prune(db: Db, folder: string, id: string) {
  try {
    if (!existsSync(folder)) return
    const used = new Set(imagesOf(db, id).map((image) => image.hash))
    if (!used.size) {
      rmSync(folder, { recursive: true, force: true })
      return
    }
    for (const file of readdirSync(folder)) {
      if (!used.has(file)) rmSync(join(folder, file), { force: true })
    }
  } catch (error) {
    logger.error(
      { event: "card_prune_failed", cardId: id, err: error },
      "Couldn’t remove a card’s unused images"
    )
  }
}
