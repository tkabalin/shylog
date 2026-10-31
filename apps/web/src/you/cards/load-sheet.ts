import { cardImageTypes } from "@shylog/core"

import { preloadable } from "@/lib/preloadable"

// The image types the server takes, for the photo picker. A computer's
// file dialog hides HEIC unless it is named; a phone's mustn't name it, or
// iOS stops handing Photos' HEIC over as JPEG.
export const accept = (desk: boolean) =>
  cardImageTypes.join(",") + (desk ? ",.heic,.heif" : "")

// The sheet carries Motion's drag and layout code, needed only once a card
// is added or edited, so it loads on the press that opens it.
export const { Component: CardSheet, preload: loadCardSheet } = preloadable(
  () => import("./card-sheet").then((module) => module.CardSheet)
)
