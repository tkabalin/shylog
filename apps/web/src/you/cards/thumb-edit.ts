import type { CardCrop } from "@shylog/core"

// A crop in the card sheet, with the key of the page it was made on.
export type KeyedCrop = { key: string; crop: CardCrop } | null

const same = (a: KeyedCrop, b: KeyedCrop) =>
  a?.key === b?.key &&
  a?.crop.x === b?.crop.x &&
  a?.crop.y === b?.crop.y &&
  a?.crop.scale === b?.crop.scale

// What the sheet's crop means for its first page: the crop to show, whether
// it was changed since the sheet opened, and what to send. Unchanged it is
// left out, so the server keeps what it has, rather than a crop read when
// the sheet opened overwriting one another phone saved meanwhile.
export function thumbEdit(opened: KeyedCrop, now: KeyedCrop, first?: string) {
  const thumb = first !== undefined && now?.key === first ? now.crop : null
  const touched = !same(opened, now)
  return { thumb, touched, send: touched ? thumb : undefined }
}
