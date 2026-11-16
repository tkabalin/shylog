// @vitest-environment node
import { describe, expect, it } from "vitest"

import { dropEmptyHeadings, siteText } from "./page-text"

describe("dropEmptyHeadings", () => {
  it("drops the template's sections nobody filled in, nested ones too", () => {
    const page = [
      "## See",
      "",
      "### Marine life",
      "",
      "### Photography",
      "",
      "## Stay safe",
      "",
      "### Hazards",
      "",
      "Surge.",
    ].join("\n")
    expect(dropEmptyHeadings(page)).toBe(
      "## Stay safe\n\n### Hazards\n\nSurge."
    )
  })

  it("keeps a heading over deeper ones that hold text", () => {
    const page = "## Do\n\n### Main reef\n\nPinnacles."
    expect(dropEmptyHeadings(page)).toBe(page)
  })
})

describe("siteText", () => {
  const parts = [
    "## Understand\n\nA big reef.\n\n## Do\n\n### Pinnacles",
    { sites: ["reef/north"], text: "### North\n\nThe north pinnacle." },
    "### Gullies\n\nSand gullies.",
    { sites: ["reef/south", "reef/far-south"], text: "The south pinnacle." },
  ]

  it("puts a site's own section first, without its heading", () => {
    expect(siteText(parts, "reef/north")).toEqual({
      own: "The north pinnacle.",
      rest: "## Understand\n\nA big reef.\n\n## Do\n\n### Gullies\n\nSand gullies.\n\nThe south pinnacle.",
    })
  })

  it("finds a section two sites share", () => {
    expect(siteText(parts, "reef/far-south").own).toBe("The south pinnacle.")
  })

  it("gives the whole page to a site with no section of its own", () => {
    const { own, rest } = siteText(["## Understand\n\nA reef."], "reef")
    expect(own).toBe("")
    expect(rest).toBe("## Understand\n\nA reef.")
  })
})
