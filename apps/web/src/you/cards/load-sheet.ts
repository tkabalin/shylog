import { lazy } from "react"
import { cardImageTypes } from "@shylog/core"

// The image types the server takes, for the photo picker. A computer's
// file dialog hides HEIC unless it is named; a phone's mustn't name it, or
// iOS stops handing Photos' HEIC over as JPEG.
export const accept = (desk: boolean) =>
  cardImageTypes.join(",") + (desk ? ",.heic,.heif" : "")

// The sheet carries Motion's drag and layout code, needed only once a card
// is added or edited, so it loads on the press that opens it.
export const loadCardSheet = () => import("./card-sheet")
export const CardSheet = lazy(() =>
  loadCardSheet().then((module) => ({ default: module.CardSheet }))
)
