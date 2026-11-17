import { cardHeight } from "@/components/dive-card"

// The Log's layout: each month a heading, then cards 8px apart, with 16px
// between months. MonthGroup and the list take these as styles, so the
// maths below can't drift from what is drawn.
export const headingHeight = 24
export const cardGap = 8
export const monthGap = 16
const stride = cardHeight + cardGap

export const groupHeight = (cards: number) => headingHeight + cards * stride

// The room a run of cards takes, less the gap after the last, which the
// group's own gap gives back, so the cards around a spacer stay in place.
export const spacerHeight = (cards: number) => cards * stride - cardGap

// A stretch of the list in pixels from its top.
export interface Span {
  top: number
  bottom: number
}

export const covers = (outer: Span, inner: Span) =>
  outer.top <= inner.top && outer.bottom >= inner.bottom

// Cards stay mounted a screen and a half beyond each edge, and a scroll
// that eats into that mounts two screens' worth. A fling then has well over
// a screen to cover before a blank month could show, and each step mounts
// about half a screen of cards, a few at a time rather than a month at once.
const keep = 1.5
const reach = 2

export function nextSpan(mounted: Span | undefined, visible: Span): Span {
  const screen = visible.bottom - visible.top
  if (
    mounted &&
    covers(mounted, {
      top: visible.top - keep * screen,
      bottom: visible.bottom + keep * screen,
    })
  )
    return mounted
  return {
    top: visible.top - reach * screen,
    bottom: visible.bottom + reach * screen,
  }
}

// For each month, the cards that overlap the span, as [from, to) indexes:
// [0, 0] for a month with none, so it renders the same while out of reach.
export function cardsIn(counts: readonly number[], span: Span) {
  let top = 0
  return counts.map((count): [number, number] => {
    const first = top + headingHeight + cardGap
    top += groupHeight(count) + monthGap
    const from = Math.max(
      0,
      Math.floor((span.top - first - cardHeight) / stride) + 1
    )
    const to = Math.min(count, Math.ceil((span.bottom - first) / stride))
    return from < to ? [from, to] : [0, 0]
  })
}
