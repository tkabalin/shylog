import { describe, expect, it } from "vitest"

import { thumbEdit } from "./thumb-edit"

const crop = { x: 0.5, y: 0.3, scale: 2, aspect: 0.46 }
const opened = { key: "a", crop }

describe("thumbEdit", () => {
  it("leaves an untouched crop out, so the server keeps its own", () => {
    expect(thumbEdit(opened, opened, "a")).toEqual({
      thumb: crop,
      touched: false,
      send: undefined,
    })
    expect(thumbEdit(null, null, "a").send).toBeUndefined()
  })

  it("sends a crop made or moved in the sheet", () => {
    const moved = { key: "a", crop: { ...crop, x: 0.6 } }
    expect(thumbEdit(opened, moved, "a")).toMatchObject({
      touched: true,
      send: moved.crop,
    })
    expect(thumbEdit(null, opened, "a").send).toEqual(crop)
  })

  it("sends null for a crop reset in the sheet", () => {
    expect(thumbEdit(opened, null, "a")).toEqual({
      thumb: null,
      touched: true,
      send: null,
    })
  })

  it("shows the crop only while its page is first, and back when it returns", () => {
    // Untouched, another page first: left out, which the server drops.
    expect(thumbEdit(opened, opened, "b")).toEqual({
      thumb: null,
      touched: false,
      send: undefined,
    })
    expect(thumbEdit(opened, opened, "a").thumb).toEqual(crop)
    // Made on a page that is no longer first: cleared.
    const made = { key: "c", crop }
    expect(thumbEdit(null, made, "a")).toMatchObject({
      thumb: null,
      send: null,
    })
    expect(thumbEdit(opened, opened, undefined).thumb).toBeNull()
  })
})
