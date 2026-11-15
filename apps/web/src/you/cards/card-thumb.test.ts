import { cardAspect } from "@shylog/core"
import { describe, expect, it } from "vitest"

import { coverOf, thumbBox } from "./card-thumb"

// A phone screenshot, taller than a card, and a photo wider than one.
const portrait = 1290 / 2796
const wide = 2

describe("coverOf", () => {
  it("just covers the card's shape, as object-fit: cover does", () => {
    expect(coverOf(portrait).width).toBe(1)
    expect(coverOf(portrait).height).toBeCloseTo(cardAspect / portrait)
    expect(coverOf(wide)).toEqual({ width: wide / cardAspect, height: 1 })
  })
})

describe("thumbBox", () => {
  it("at the centre and a zoom of 1 is the centred cover", () => {
    const box = thumbBox({ x: 0.5, y: 0.5, scale: 1, aspect: portrait })
    expect(box.width).toBe(1)
    expect(box.left).toBe(0)
    expect(box.top).toBeCloseTo((1 - box.height) / 2)
  })

  it("puts the crop's centre in the frame's centre", () => {
    const crop = { x: 0.3, y: 0.4, scale: 3, aspect: portrait }
    const box = thumbBox(crop)
    expect(box.width).toBe(3)
    expect(box.left + crop.x * box.width).toBeCloseTo(0.5)
    expect(box.top + crop.y * box.height).toBeCloseTo(0.5)
  })

  it("keeps the image covering the frame for a centre too near an edge", () => {
    const corner = thumbBox({ x: 0, y: 1, scale: 1, aspect: wide })
    expect(corner.left).toBe(0)
    expect(corner.top).toBe(0)
    const far = thumbBox({ x: 1, y: 0, scale: 2, aspect: wide })
    expect(far.left).toBeCloseTo(1 - far.width)
    expect(far.top).toBe(0)
  })
})
