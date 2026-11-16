import { createElement, Fragment } from "react"
import { cardAspect } from "@shylog/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { render } from "@/dive/form/testing"

import { coverOf, PageImage, thumbBox } from "./card-thumb"

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

describe("PageImage of a picked file", () => {
  // jsdom has no object URLs: numbered stand-ins, put back after each test.
  const original = {
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  }
  const made: string[] = []
  const revoked: string[] = []
  beforeEach(() => {
    made.length = 0
    revoked.length = 0
    URL.createObjectURL = () => {
      made.push(`blob:${made.length}`)
      return made.at(-1)!
    }
    URL.revokeObjectURL = (url) => void revoked.push(url)
  })
  afterEach(() => Object.assign(URL, original))

  it("shares one object URL, let go after the last image", () => {
    const file = new File(["x"], "card.png")
    const images = (count: number) =>
      createElement(
        Fragment,
        null,
        Array.from({ length: count }, (_, i) =>
          createElement(PageImage, { key: i, source: { file } })
        )
      )
    const { container, rerender, unmount } = render(images(3))
    const sources = () =>
      [...container.querySelectorAll("img")].map((img) =>
        img.getAttribute("src")
      )

    expect(made).toEqual(["blob:0"])
    expect(sources()).toEqual(["blob:0", "blob:0", "blob:0"])
    rerender(images(1))
    expect(revoked).toEqual([])
    rerender(images(0))
    expect(revoked).toEqual(["blob:0"])
    // Shown again, it gets a new URL rather than the revoked one.
    rerender(images(1))
    expect(sources()).toEqual(["blob:1"])
    unmount()
    expect(revoked).toEqual(["blob:0", "blob:1"])
  })
})
