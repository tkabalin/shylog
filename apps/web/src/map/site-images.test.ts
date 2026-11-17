// @vitest-environment node
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import credits from "./image-credits.json"
import list from "./images.json"
import { sites } from "./sites"

// What the refresh scripts write (scripts/map/sites.ts lists the images,
// scripts/map/images.ts downloads them), checked as it lands in a pull
// request.
const dir = join(import.meta.dirname, "images")
const files = list.files as Record<string, { kind: string; caption: string }>
const credited = credits as Record<
  string,
  {
    key: string
    author: string
    licence: string
    page: string
    width: number
    height: number
  }
>

describe("site images", () => {
  it("lists images only for sites on the map", () => {
    const ids = new Set(sites.map((site) => site.id))
    for (const id of Object.keys(list.sites)) expect(ids, id).toContain(id)
  })

  it("has every listed image downloaded, credited and licensed", () => {
    for (const file of Object.keys(files)) {
      const credit = credited[file]
      expect(credit, file).toBeDefined()
      expect(credit.author, file).not.toBe("")
      expect(credit.licence, file).toMatch(/CC|Public domain|PD/i)
      expect(credit.page, file).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
      for (const name of [credit.key, `${credit.key}-thumb`]) {
        expect(existsSync(join(dir, `site-${name}.webp`)), name).toBe(true)
      }
    }
  })

  it("keeps no image the pages no longer show", () => {
    const keys = new Set(Object.values(credited).map((credit) => credit.key))
    for (const name of readdirSync(dir)) {
      expect(keys, name).toContain(
        name.replace(/^site-/, "").replace(/(-thumb)?\.webp$/, "")
      )
    }
    expect(Object.keys(credited).sort()).toEqual(Object.keys(files).sort())
  })

  it("keeps each image within 3840 px, which iOS decodes whole", () => {
    for (const [file, { width, height }] of Object.entries(credited)) {
      expect(Math.max(width, height), file).toBeLessThanOrEqual(3840)
    }
    for (const name of readdirSync(dir)) {
      // 3840 px at quality 60 is a few hundred KB; a thumbnail far less.
      const limit = name.endsWith("-thumb.webp") ? 120_000 : 2_500_000
      expect(statSync(join(dir, name)).size, name).toBeLessThan(limit)
    }
  })

  it("gives a section of a shared page its own images first", () => {
    const own = list.sites["whittle-rock/ultima-thule"].map(
      (file) => files[file].caption
    )
    expect(own[0]).toMatch(/Ultima Thule/)
    // Then its page's, but not the other sections' own.
    expect(own.some((caption) => /Aoife/i.test(caption))).toBe(false)
  })
})
