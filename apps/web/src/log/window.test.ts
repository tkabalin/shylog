import { describe, expect, it } from "vitest"

import { cardHeight } from "@/components/dive-card"

import {
  cardsIn,
  covers,
  groupHeight,
  nextSpan,
  spacerHeight,
  type Span,
} from "./window"

// Where card k of a month starts, laid out as MonthGroup does: the 24px
// heading, then cards 8px apart.
const cardTop = (k: number) => 24 + 8 + k * (cardHeight + 8)

describe("month geometry", () => {
  it("keeps the cards after a spacer where they would be", () => {
    for (const k of [1, 2, 7])
      expect(cardTop(0) + spacerHeight(k) + 8).toBe(cardTop(k))
  })

  it("gives a month of spacers alone the height of its cards", () => {
    for (const n of [1, 6, 15])
      expect(cardTop(0) + spacerHeight(n)).toBe(groupHeight(n))
    expect(cardTop(14) + cardHeight).toBe(groupHeight(15))
  })
})

describe("cards in a span", () => {
  // The seed's newest months: tops at 0, 132 and 724, 16px apart.
  const counts = [1, 6, 15]

  it("mounts whole months inside the span and none of those outside", () => {
    expect(cardsIn(counts, { top: 0, bottom: 700 })).toEqual([
      [0, 1],
      [0, 6],
      [0, 0],
    ])
  })

  it("mounts only the overlapping cards of a month the span cuts", () => {
    // Card 9 ends at 944 and card 22 starts at 2056.
    expect(cardsIn([40], { top: 1000, bottom: 2000 })).toEqual([[10, 22]])
    // An edge that only touches a card leaves it out.
    expect(
      cardsIn([40], { top: cardTop(3) + cardHeight, bottom: 2000 })
    ).toEqual([[4, 22]])
  })

  it("mounts nothing for a span above the list or past its end", () => {
    expect(cardsIn(counts, { top: -3000, bottom: -10 })).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ])
    expect(cardsIn(counts, { top: 5000, bottom: 9000 })).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ])
  })
})

describe("the mounted span", () => {
  const screen = 800

  it("reaches two screens past each edge of the screen", () => {
    expect(nextSpan(undefined, { top: 0, bottom: 800 })).toEqual({
      top: -1600,
      bottom: 2400,
    })
  })

  it("stays put while a screen and a half past each edge is mounted", () => {
    const mounted = nextSpan(undefined, { top: 0, bottom: 800 })
    expect(nextSpan(mounted, { top: 400, bottom: 1200 })).toBe(mounted)
    expect(nextSpan(mounted, { top: -400, bottom: 400 })).toBe(mounted)
    expect(nextSpan(mounted, { top: 401, bottom: 1201 })).toEqual({
      top: -1199,
      bottom: 2801,
    })
  })

  it("tells a screen inside the span from one past its edge", () => {
    const mounted = { top: -1600, bottom: 2400 }
    expect(covers(mounted, { top: 1600, bottom: 2400 })).toBe(true)
    expect(covers(mounted, { top: 1601, bottom: 2401 })).toBe(false)
    expect(covers(mounted, { top: -1700, bottom: -900 })).toBe(false)
  })

  // A long log with months of every size from 1 to 22 dives, scrolled down
  // and back up in steps of a brisk thumb (40px a frame) and of a hard
  // fling (300px).
  const months = Array.from({ length: 60 }, (_, i) => 1 + ((i * 7) % 22))
  const tops = months.map((_, i) =>
    months.slice(0, i).reduce((sum, n) => sum + groupHeight(n) + 16, 0)
  )
  const end = tops.at(-1)! + groupHeight(months.at(-1)!)

  for (const step of [40, 300])
    it(`holds every card within a screen and a half, ${step}px a step`, () => {
      const steps = Math.ceil(end / step)
      const positions = [
        ...Array.from({ length: steps }, (_, i) => i * step),
        ...Array.from({ length: steps }, (_, i) => end - i * step),
      ]
      const missing: string[] = []
      const extra: string[] = []
      let span: Span | undefined
      for (const y of positions) {
        span = nextSpan(span, { top: y, bottom: y + screen })
        const mounted = cardsIn(months, span)
        months.forEach((count, i) => {
          const [from, to] = mounted[i]
          for (let k = 0; k < count; k++) {
            const top = tops[i] + cardTop(k)
            const isMounted = k >= from && k < to
            // Within the margin it keeps, and within the most a step
            // leaves behind: two screens and a half.
            const within = (screens: number) =>
              top < y + screen * (1 + screens) &&
              top + cardHeight > y - screen * screens
            if (!isMounted && within(1.5)) missing.push(`${y}: ${i}/${k}`)
            if (isMounted && !within(2.5)) extra.push(`${y}: ${i}/${k}`)
          }
        })
      }
      expect(missing).toEqual([])
      expect(extra).toEqual([])
    })
})
