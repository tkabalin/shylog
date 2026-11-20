// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  apart,
  deepest,
  decode,
  dropPermit,
  features,
  findEnd,
  findStart,
  guideLinks,
  landings,
  markers,
  nbsp,
  note,
  ownWords,
  pageLines,
  pictures,
  printed,
  quotes,
  sentences,
  statedDepth,
  tidy,
} from "../../scripts/map/wikitext"

// The refresh script's reading of Wikivoyage, on snippets of the pages it
// reads (scripts/map/wikitext.ts). Its tests live here, where the web
// project's tests are found.

const guide = "Diving the Cape Peninsula and False Bay"

describe("markers", () => {
  const list = [
    `* {{marker|type=navy|name=[[${guide}/Hermes|''Hermes'']]|lat=-33.870167|long=018.337583|zoom=15}}: S33°52.210' E018°20.255'.`,
    `<!--* {{marker|type=navy|name=[[${guide}/Nerine|''Nerine'']]|lat=-33.845417|long=018.314433}}-->`,
    `*:{{marker|type=red|name=[[${guide}/Whittle Rock#Gullies|Gullies]]|lat=-34.247867|long=18.575667}}: S34°14.872' E18°33.454'`,
  ].join("\n")

  it("reads the list's markers, less those in comments", () => {
    const [hermes, gullies, ...rest] = markers(list)
    expect(rest).toEqual([])
    expect(hermes).toMatchObject({
      title: `${guide}/Hermes`,
      name: "Hermes",
      ship: true,
      lat: -33.870167,
      lon: 18.337583,
    })
    expect(gullies).toMatchObject({ section: "Gullies", ship: false })
  })

  // The list's Gullies is 1.7 km off the reef its page prints.
  it("keeps the position printed after each, which shows a typo", () => {
    const [hermes, gullies] = markers(list)
    expect(apart(hermes.printed!, [hermes.lon, hermes.lat])).toBeLessThan(10)
    expect(apart(gullies.printed!, [gullies.lon, gullies.lat])).toBeGreaterThan(
      1600
    )
  })
})

describe("printed", () => {
  it("reads the ways the pages print a position", () => {
    for (const [text, lon, lat] of [
      ["S34°12.484’ E018°27.662’", 18.461033, -34.208067],
      // º for °, a stray digit after the minutes, and S for E.
      ["S34º04.6578' E018º18.9312'", 18.31552, -34.07763],
      ["S34°09.070'9 E18°38.7644'", 18.646073, -34.151167],
      ["S34°15.280' S18°33.351'", 18.55585, -34.254667],
      ["S34° 24.929', E18° 36.496'", 18.608267, -34.415483],
    ] as const) {
      const at = printed(text)!
      expect(apart(at, [lon, lat]), text).toBeLessThan(5)
    }
  })
})

describe("guideLinks and landings", () => {
  it("collects the guide's links, curly apostrophes and all", () => {
    const text = `Launch from [[${guide}/Miller’s Point|Miller's Point]], see [[${guide}/Drop Zone#North|Drop Zone]]. <!--[[${guide}/Nerine]]-->`
    expect([...guideLinks(text)]).toEqual([
      `${guide}/Miller’s Point`,
      `${guide}/Drop Zone`,
    ])
  })

  it("follows redirects to the section they name", () => {
    const titles = [
      `${guide}/Miller’s Point`,
      `${guide}/Drop Zone`,
      `${guide}/A-Frame`,
    ]
    const redirects = [
      { from: titles[0], to: `${guide}/Miller's Point` },
      {
        from: titles[1],
        to: `${guide}/Steenbras Ridge`,
        tofragment: "Drop Zone",
      },
    ]
    expect(landings(titles, [], redirects)).toEqual({
      "Drop Zone": "Steenbras Ridge#Drop Zone",
      "Miller’s Point": "Miller's Point",
    })
  })
})

describe("decode", () => {
  it("reads the misspelt non-breaking spaces the pages use", () => {
    expect(decode("24&npsp;m, 705&bsp;m, 27&npbp;m, 36&nbdp;m")).toBe(
      `24${nbsp}m, 705${nbsp}m, 27${nbsp}m, 36${nbsp}m`
    )
  })
})

describe("quotes", () => {
  it("nests bold and italics as MediaWiki reads them", () => {
    expect(quotes("'''SS ''Maori''''' or often just '''The ''Maori'''''")).toBe(
      "**SS *Maori*** or often just **The *Maori***"
    )
    expect(quotes("'''''Ker Yar Vor'' and the ''Jo May'''''")).toBe(
      "***Ker Yar Vor* and the *Jo May***"
    )
    expect(quotes("'''ST ''Bulby'', or Eastern trawler wreck'''")).toBe(
      "**ST *Bulby*, or Eastern trawler wreck**"
    )
  })

  it("keeps spaces outside the marks", () => {
    expect(quotes("the Pre-Cambrian ''Peninsula ''pluton")).toBe(
      "the Pre-Cambrian *Peninsula* pluton"
    )
  })

  it("parts a mark ending in punctuation from the word after it", () => {
    expect(quotes("'''Cavern:'''From the gully")).toBe(
      "**Cavern:** From the gully"
    )
    expect(quotes("'''Kelly's anchor'''* A large")).toBe(
      "**Kelly's anchor*** A large"
    )
  })
})

describe("pageLines", () => {
  it("drops only the sentences holding a placeholder", () => {
    expect(
      pageLines(
        "Maximum depth is about 42&nbsp;m. and the shallowest point is about (depth)&nbsp;m."
      )
    ).toEqual(["Maximum depth is about 42&nbsp;m."])
    expect(
      pageLines("The site is about (distance)km from Simon's Town jetty")
    ).toEqual([])
  })

  it("keeps a site's own words around a placeholder", () => {
    const line =
      "{{marker|type=do|name=Sterretjies Reef|lat=-34.156067|long=18.75065}}: S34°09.364' E18°45.039'. Depth range 18 to 25&nbsp;m. The site is about 10&nbsp;km from Harbour Island, or (distance)&nbsp;km from Gordon's Bay old harbour. Indigo Divers reported lots of fish."
    const [kept] = pageLines(line)
    expect(kept).toContain("Depth range 18 to 25&nbsp;m.")
    expect(kept).toContain("Indigo Divers reported lots of fish.")
    expect(kept).not.toContain("(distance)")
  })

  it("drops gallery pointers, hatnotes and the closing navigation", () => {
    const page = [
      ":''Noah's Ark redirects here. For the geological formation, see [[Doğubayazıt]].''",
      "The dive site '''Noah's Ark'''.",
      "Ecology typical of reef in this area. [[#Steenbras Ridge Outpost gallery|see Outpost gallery]]",
      "==Nearby==",
      "'''Back to the [[A|list]]'''",
      "*[[Dive sites of False Bay east coast]]",
    ].join("\n")
    expect(pageLines(page)).toEqual([
      "The dive site '''Noah's Ark'''.",
      "Ecology typical of reef in this area.",
      "==Nearby==",
      "",
    ])
  })
})

describe("sentences", () => {
  it("runs past the abbreviations and initials the pages use", () => {
    expect(
      sentences(
        'The "SS Thomas T. Tucker" was laid down at Lobnitz and Co. Renfrewshire, in 1942. It sank.'
      )
    ).toEqual([
      'The "SS Thomas T. Tucker" was laid down at Lobnitz and Co. Renfrewshire, in 1942.',
      "It sank.",
    ])
  })

  it("ends one before an aside in brackets", () => {
    expect(
      sentences(
        "48.0 - 60.0 m depth range. (aka Northeast Buttress) A buttress."
      )
    ).toEqual([
      "48.0 - 60.0 m depth range.",
      "(aka Northeast Buttress) A buttress.",
    ])
    expect(tidy("(aka Northeast Buttress) A buttress,")).toBe("A buttress.")
  })
})

describe("ownWords", () => {
  it("takes the name and position off a section's words", () => {
    expect(
      ownWords("**Labyrinth**: S34°15.004' E18°33.580'. A compact cluster.")
    ).toBe("A compact cluster.")
    expect(
      ownWords("- **Georgina's anchor** A large iron anchor on the boulders.")
    ).toBe("A large iron anchor on the boulders.")
  })

  it("keeps the name where the words go on from it", () => {
    expect(
      ownWords(
        "**Whaleback Rock**: S34°14.840' E18°33.600', is at the southeastern end of Whaleback Ridge."
      )
    ).toBe("Whaleback Rock is at the southeastern end of Whaleback Ridge.")
    expect(
      ownWords(
        "**Anchor Reef**: S34°11.575' E018°27.600', or Maidstone Reef, is a large reef."
      )
    ).toBe("Anchor Reef, or Maidstone Reef, is a large reef.")
    expect(
      ownWords(
        "**Bruce's Reef**: S34°14.950' E18°33.200'. Also known as Stingray HQ, is a reef."
      )
    ).toBe("Bruce's Reef, also known as Stingray HQ, is a reef.")
  })
})

describe("depths", () => {
  it("takes the deepest of the maxima and ranges a page gives", () => {
    expect(
      statedDepth(
        "Maximum depth is about 18 m to the south, and 22 m to the north."
      )
    ).toEqual({ depth: 22 })
    expect(statedDepth("Depth range 15 to 23 m. The top is at 12 m.")).toEqual({
      depth: 23,
    })
    expect(statedDepth("Maximum depth is over 30 m.")).toEqual({ depth: 30 })
  })

  it("doesn't take a maximum width for a depth", () => {
    expect(
      statedDepth("The maximum width is at 6 to 9 m in most places.")
    ).toBeUndefined()
    expect(
      statedDepth(
        "It has a minimum depth of about 15 m, and maximum of nearly 21 m on the sand. The reef is about 140 m long, and maximum width is about 40 m."
      )
    ).toEqual({ depth: 21 })
  })

  it("marks a depth the words bound or doubt approximate", () => {
    expect(deepest("Fairly shallow, mostly less than 10 m.")).toEqual({
      depth: 10,
      approximate: true,
    })
    expect(
      deepest("Fairly shallow, probably not more than about 8 m.")
    ).toEqual({ depth: 8, approximate: true })
    expect(statedDepth("Maximum depth is about (48?) m.")).toEqual({
      depth: 48,
      approximate: true,
    })
    expect(statedDepth("Maximum depth is about 4(?) m.")).toEqual({
      depth: 4,
      approximate: true,
    })
    expect(deepest("The bottom is generally from 5 to 10 m deep.")).toEqual({
      depth: 10,
    })
  })

  it("leaves out distances, sizes, heights, tops and contours", () => {
    for (const text of [
      "About 50 m due west of the main pinnacle",
      "About 30 m to the north, across an area of sand",
      "at a distance of about 88 m These pillars are high",
      "small ridges along an overall length of about 426 m",
      "The starboard side projects out of the sand about 3 m at the bow",
      "an almost vertical granite wall of about 25 m height",
      "with its top at about 26 m with some engine structure",
      "the big overhang on the 15 m contour is worth a visit",
      "Visibility estimated at about 15 m",
      // How much the depth varies, on Steenbras Ridge's page.
      "However, the local depth variation is not usually large, and is usually less than about 10 m over quite large areas.",
    ]) {
      expect(deepest(text), text).toBeUndefined()
    }
  })

  it("keeps depths that read like those", () => {
    for (const [text, depth] of [
      ["Rugged outcrop with sand bottom at about 29 m to the West.", 29],
      ["a boulder resting on top of the bedrock reef at about 25 m depth", 25],
      ["Two small steel barges, lying on sand at 23 m.", 23],
      ["a pinnacle rising from about 23 m on the sand", 23],
    ] as const) {
      expect(deepest(text), text).toEqual({ depth })
    }
  })
})

describe("notes", () => {
  it("passes over a section's notes for its description", () => {
    for (const sentence of [
      "About 8.6 km west (276°true) of Harbour Island.",
      "This site is not in a Marine Protected Area.",
      "The sites are entirely outside, but very close to the eastern border of the Boulders Restricted Zone.",
      "Depth range 15 to 23 m.",
    ]) {
      expect(note.test(sentence), sentence).toBe(true)
    }
    expect(
      note.test(
        "About 50 m due west of the main pinnacle, and at 7 m, the second shallowest point of the reef."
      )
    ).toBe(false)
  })
})

describe("a site's own section", () => {
  const seek = (name: string, lat = 0, lon = 0) => ({ name, lat, lon })

  it("starts at its own marker, before a bold name or heading elsewhere", () => {
    const lines = [
      "'''Seal Rock''' is popular with visitors who want to dive with seals.",
      "==Do==",
      "{{marker|type=do|name=Seal Rock|lat=-34.255617|long=18.481533}}: S34°15.337' E018°28.892'.",
      "The reef just to the east and south of Seal rock is quite shallow.",
      "==See==",
      "====Seal Rock====",
      "Seals are an obvious feature.",
    ]
    expect(findStart(lines, seek("Seal Rock"))).toBe(2)
  })

  it("runs past an image to its words", () => {
    const lines = [
      "{{anchor|Labyrinth}}",
      "[[File:Large gully at the Labyrinth reef.jpg|thumb|Large gully]]",
      "",
      "{{marker|type=do|name=Labyrinth|lat=-34.250067|long=18.559667}}: S34°15.004' E18°33.580'. A compact cluster.",
      "",
      "{{anchor|Sponge Gardens}}",
    ]
    expect(findEnd(lines, findStart(lines, seek("Labyrinth")))).toBe(5)
  })

  it("ends where a neighbour's paragraph opens on its name in bold", () => {
    const lines = [
      "{{anchor|Bus-stop}}",
      "{{marker|type=do|name=Bus-stop overhang|lat=-34.24908|long=18.55955}}: S34°14.945' E18°33.573', is a feature on the Gnarly Wall.",
      "",
      "'''Geology:''' Granite, which is part of the section.",
      "",
      "'''Aoife's Reef patch''' is a relatively small patch of reef.",
    ]
    expect(findEnd(lines, findStart(lines, seek("Bus-stop")))).toBe(5)
  })
})

describe("pictures", () => {
  it("takes maps, sonar, aerial photos and plans, in page order", () => {
    const page = [
      "{{Toggle dive maps",
      "| regionmap=Anvil Rock Reef map.png",
      "| regionmaptext=Map of the reef at [[Anvil Rock]]",
      "}}",
      "[[File:Ultima_Thule_Reef.png|thumb|upright=1.5|Multibeam sonar image of ''Ultima Thule'']]",
      "[[File:Ledges Aerial.jpg|400px|thumb|Aerial view of the dive site at Ledges. (Photo CDS&amp;M)]]",
      "[[File:MV Orotava general arrangement plan.png|thumb|General arrangement plan of the wreck]]",
      "[[File:Noah%27s Ark map.png|thumb|Map of the dive sites]]",
      "[[File:Caf%C3%A9 Reef map.png|thumb|Map of the reef]]",
    ].join("\n")
    expect(pictures(page)).toEqual([
      {
        file: "Anvil Rock Reef map.png",
        kind: "map",
        caption: "Map of the reef at Anvil Rock",
      },
      {
        file: "Ultima Thule Reef.png",
        kind: "sonar",
        caption: "Multibeam sonar image of Ultima Thule",
      },
      {
        file: "Ledges Aerial.jpg",
        kind: "aerial",
        caption: "Aerial view of the dive site at Ledges. (Photo CDS&M)",
      },
      {
        file: "MV Orotava general arrangement plan.png",
        kind: "plan",
        caption: "General arrangement plan of the wreck",
      },
      {
        file: "Noah's Ark map.png",
        kind: "map",
        caption: "Map of the dive sites",
      },
      { file: "Café Reef map.png", kind: "map", caption: "Map of the reef" },
    ])
  })

  it("leaves out photos, placeholders, galleries and comments", () => {
    const page = [
      "[[File:Map or aerial photo|upright=2|thumb|Map (or aerial photo) of the site]]",
      "[[File:Horsefish DSC09127.JPG|thumb|A horsefish on the reef]]",
      "[[File:Coral Gardens from the road.jpg|thumb|View showing the route to the entry]]",
      "<gallery>",
      "Reef map.png|Map of the reef",
      "</gallery>",
      "<!-- [[File:Old map.svg|thumb|Map of the dive sites]] -->",
    ].join("\n")
    expect(pictures(page)).toEqual([])
  })

  it("takes a file once, however often the page shows it", () => {
    const line = "[[File:Long Beach map.png|thumb|Map of the dive site]]"
    expect(pictures(`${line}\n${line}`)).toHaveLength(1)
  })
})

describe("dropPermit", () => {
  it("drops the permit from a paragraph in the Table Mountain MPA", () => {
    expect(
      dropPermit(
        "This site is in a Marine Protected Area (2004). A permit is required.\nThe site is partly inside the Boulders Restricted Zone."
      )
    ).toBe(
      "This site is in a Marine Protected Area (2004).\nThe site is partly inside the Boulders Restricted Zone."
    )
    expect(
      dropPermit(
        "It is in the Table Mountain National Park MPA. A permit is required to dive, and spearfishing is prohibited."
      )
    ).toBe(
      "It is in the Table Mountain National Park MPA. Spearfishing is prohibited."
    )
    expect(dropPermit("In the MPA since 2004. A permit is  required")).toBe(
      "In the MPA since 2004."
    )
  })

  it("keeps Robben Island's, and a permit to launch a boat", () => {
    const robben =
      "This site is in the Robben Island Marine Protected Area since 2019. A permit is required."
    expect(dropPermit(robben)).toBe(robben)
    const slip = "Dived from the local slip if you have the required permit."
    expect(dropPermit(slip)).toBe(slip)
  })
})

describe("features", () => {
  it("reads a page's own markers inside its sites, with the rest of the line", () => {
    const text = [
      "{{marker|type=do|name=Percy's Hole cave|lat=-34.28658|long=18.82483|zoom=15}}: S34°17.195' E018°49.490'. The cave is most easily reached from the north entry.",
      `{{marker|type=vicinity|name=[[${guide}/Ankers|Ankers]]|lat=-34.308767|long=18.813583}}`,
      "<!-- {{marker|type=do|name=Hidden|lat=-34.1|long=18.4}} -->",
      "{{marker|type=see|name=Kelly's anchor|lat=-34.24|long=}}",
    ].join("\n")
    expect(features(text)).toEqual([
      {
        name: "Percy's Hole cave",
        lon: 18.82483,
        lat: -34.28658,
        after:
          ": S34°17.195' E018°49.490'. The cave is most easily reached from the north entry.",
      },
    ])
  })

  it("ends a marker's words at the next marker on its line", () => {
    const text =
      "{{marker|type=see|name=Bow|lat=-34.1|long=18.4}} The bow, {{m|12}} deep. {{marker|type=see|name=Stern|lat=-34.2|long=18.5}} The stern."
    expect(features(text).map(({ name, after }) => [name, after])).toEqual([
      ["Bow", " The bow, {{m|12}} deep. "],
      ["Stern", " The stern."],
    ])
  })
})
