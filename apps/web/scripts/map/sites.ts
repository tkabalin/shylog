import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { format, resolveConfig } from "prettier"

import { dropEmptyHeadings, type Part } from "../../src/map/page-text.ts"
import {
  apart,
  blocks,
  capital,
  clean,
  deepest,
  describe,
  findEnd,
  findStart,
  firstSentence,
  guide,
  guideLinks,
  landings,
  leadKind,
  loose,
  markers,
  note,
  opening,
  ownWords,
  pageLines,
  plain,
  section,
  sentences,
  slug,
  statedDepth,
  subpage,
  tidy,
  type Kind,
  type Marker,
} from "./wikitext.ts"

// Writes src/map/sites.geojson and src/map/pages.json, the dive site map's
// sites and their pages' text, from Wikivoyage's dive site list for the Cape
// Peninsula and False Bay and the pages it links to (CC BY-SA). The
// revisions read are pinned in wikivoyage.json, so a rebuild reads the same
// text; `pnpm --filter @shylog/web map:sites --latest` moves the pins to
// Wikivoyage's newest. site-fixes.json, written by hand, goes on top.

const api = "https://en.wikivoyage.org/w/api.php"
const listTitle = `${guide}/Dive sites`
const cache = join(import.meta.dirname, ".cache/wikivoyage")
const pinsPath = join(import.meta.dirname, "wikivoyage.json")
const fixesPath = join(import.meta.dirname, "site-fixes.json")
const sitesPath = join(import.meta.dirname, "../../src/map/sites.geojson")
const pagesPath = join(import.meta.dirname, "../../src/map/pages.json")

type Revision = {
  title: string
  revid: number
  timestamp: string
  text: string
}

type Pins = {
  fetched: string
  list: number
  // Each page's revision, by the subpage's name.
  pages: Record<string, number>
  // Where each link to a redirect lands, with the section where the
  // redirect names one: "Steenbras Ridge#Drop Zone".
  redirects: Record<string, string>
  missing: string[]
}

// As src/map/sites.ts has it, which imports a ?raw module Node can't read.
type Area = "atlantic" | "false-bay" | "offshore" | "east" | "fresh"

type Site = {
  id: string
  name: string
  area: Area
  type: Kind
  depth?: number
  approximate?: true
  description?: string
  page: string
  section?: string
  // A site of its own on a page it shares, which has a part of that page.
  own: boolean
  lon: number
  lat: number
  marker: Marker
}

type Fix = {
  // Wikivoyage's own words the fix was read from, checked on each refresh.
  said: string | string[]
  name?: string
  depth?: number | null
  approximate?: true
  type?: Kind
  description?: string
  // Where the list's position has a typo, as [longitude, latitude]; also
  // where its printed position is the typo, so the refresh stops warning.
  position?: [number, number]
}

// ---- Fetching

// One request for up to 50 titles or revisions, the API's limit. maxlag
// asks to be turned away while the wiki's databases are busy.
async function call(params: Record<string, string>) {
  const response = await fetch(api, {
    method: "POST",
    headers: { "User-Agent": "map-data-refresh/1.0 (Node.js)" },
    body: new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      maxlag: "5",
      ...params,
    }),
  })
  if (!response.ok) throw new Error(`${response.status} from Wikivoyage`)
  const answer = (await response.json()) as {
    error?: unknown
    query: {
      normalized?: { from: string; to: string }[]
      redirects?: { from: string; to: string; tofragment?: string }[]
      pages: {
        title: string
        missing?: true
        revisions?: {
          revid: number
          timestamp: string
          slots: { main: { content: string } }
        }[]
      }[]
    }
  }
  if (answer.error) throw new Error(JSON.stringify(answer.error))
  return answer.query
}

async function query(params: Record<string, string>) {
  const answer = await call({
    prop: "revisions",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    ...params,
  })
  const revisions: Revision[] = []
  const missing: string[] = []
  for (const page of answer.pages) {
    const revision = page.revisions?.[0]
    if (page.missing || !revision) {
      missing.push(page.title)
      continue
    }
    const { revid, timestamp } = revision
    const text = revision.slots.main.content
    revisions.push({ title: page.title, revid, timestamp, text })
  }
  for (const each of revisions) keep(each)
  return { revisions, missing }
}

// A revision never changes, so each is kept by its id, outside git.
const cached = (revid: number) => join(cache, `${revid}.json`)
function keep(revision: Revision) {
  mkdirSync(cache, { recursive: true })
  writeFileSync(cached(revision.revid), JSON.stringify(revision))
}

async function byIds(ids: number[]) {
  const found = new Map<number, Revision>()
  const wanted = ids.filter((id) => {
    if (!existsSync(cached(id))) return true
    found.set(id, JSON.parse(readFileSync(cached(id), "utf8")) as Revision)
    return false
  })
  for (let i = 0; i < wanted.length; i += 50) {
    const answer = await query({ revids: wanted.slice(i, i + 50).join("|") })
    for (const each of answer.revisions) found.set(each.revid, each)
  }
  return ids.map((id) => {
    const revision = found.get(id)
    if (!revision) throw new Error(`Wikivoyage has no revision ${id}`)
    return revision
  })
}

async function byTitles(titles: string[]) {
  const revisions: Revision[] = []
  const missing: string[] = []
  for (let i = 0; i < titles.length; i += 50) {
    const answer = await query({
      titles: titles.slice(i, i + 50).join("|"),
      redirects: "1",
    })
    revisions.push(...answer.revisions)
    missing.push(...answer.missing)
  }
  return { revisions, missing }
}

// Where each title lands, redirects followed, for the links the list and
// the pages make: "Simon's Town jetty", "Miller’s Point", "Drop Zone".
async function resolve(titles: string[]) {
  const normalized: { from: string; to: string }[] = []
  const redirects: { from: string; to: string; tofragment?: string }[] = []
  for (let i = 0; i < titles.length; i += 50) {
    const answer = await call({
      titles: titles.slice(i, i + 50).join("|"),
      redirects: "1",
    })
    normalized.push(...(answer.normalized ?? []))
    redirects.push(...(answer.redirects ?? []))
  }
  return landings(titles, normalized, redirects)
}

async function read() {
  if (!process.argv.includes("--latest")) {
    if (!existsSync(pinsPath)) {
      throw new Error("Nothing is pinned yet: run with --latest")
    }
    const pins = JSON.parse(readFileSync(pinsPath, "utf8")) as Pins
    const names = Object.keys(pins.pages)
    const [list, ...pages] = await byIds([
      pins.list,
      ...names.map((name) => pins.pages[name]),
    ])
    // Named as pinned: a page moved since reads back under its new title.
    const named = pages.map((page, i) => ({
      ...page,
      title: `${guide}/${names[i]}`,
    }))
    return { pins, list, pages: named, written: [] }
  }
  const [list] = (await byTitles([listTitle])).revisions
  if (!list) throw new Error(`${listTitle} is missing`)
  const linked = [...new Set(markers(list.text).map((each) => each.title))]
  const { revisions, missing } = await byTitles(linked)
  const titles = new Set([
    ...linked,
    ...revisions.flatMap((each) => [...guideLinks(each.text)]),
  ])
  const pins: Pins = {
    fetched: new Date().toISOString().slice(0, 10),
    list: list.revid,
    pages: Object.fromEntries(
      revisions
        .map(({ title, revid }) => [subpage(title), revid] as const)
        .sort(([a], [b]) => a.localeCompare(b))
    ),
    redirects: await resolve([...titles].sort()),
    missing: missing.map(subpage).sort(),
  }
  // Pages the last pins found missing that someone has written since.
  const before = existsSync(pinsPath)
    ? (JSON.parse(readFileSync(pinsPath, "utf8")) as Pins).missing
    : []
  const written = before.filter((name) => name in pins.pages)
  return { pins, list, pages: revisions, written }
}

// ---- Sites

// The list colours its markers by area.
const areas: Record<string, Area> = {
  blue: "atlantic",
  navy: "atlantic",
  maroon: "false-bay",
  purple: "false-bay",
  red: "offshore",
  magenta: "offshore",
  orange: "offshore",
  black: "east",
  do: "fresh",
}

function kindOf(lead: string, marker: Marker, area: Area, own = false): Kind {
  if (area === "fresh") return "fresh"
  // A ship's name, or a reef's, for a site of its own on a shared page (a
  // pinnacle on the Lusitania's page is a reef) or a page that's missing.
  const { name } = marker
  const prefix = /^(?:SS|MV|MFV|FV|SAS|SATS|HMS|HMSAS|RMS|TS|ST)\s/.test(name)
  if (marker.ship || prefix || /\b(?:wrecks?|barges?)\b/i.test(name))
    return "wreck"
  if (own && /\b(?:reef|rock|pinnacles?|ridge|shoal|bank)\b/i.test(name)) {
    return "reef"
  }
  return leadKind(lead)
}

const { pins, list, pages: revisions, written } = await read()
const fixes = JSON.parse(readFileSync(fixesPath, "utf8")) as Record<string, Fix>
const raw = new Map(revisions.map((each) => [subpage(each.title), each.text]))

// The page a link lands on, and the section where a redirect names one.
const landed = (name: string) =>
  (pins.redirects[name] ?? name).split("#") as [string, string?]

// ---- Sites from the list, before any page is read, so a page's links to
// other sites can be told apart from its other links.

const listed = markers(list.text).filter(
  (each) =>
    Number.isFinite(each.lat) &&
    Number.isFinite(each.lon) &&
    each.lat &&
    each.lon
)

// Pages the list places more than one site on.
const placed = new Map<string, number>()
for (const marker of listed) {
  const [page] = landed(subpage(marker.title))
  placed.set(page, (placed.get(page) ?? 0) + 1)
}

// A page's anchor or heading by that name, for a site the list names
// without one, so Read on Wikivoyage lands on it.
function anchorFor(page: string, name: string) {
  const text = raw.get(page) ?? ""
  const anchors = [...text.matchAll(/\{\{\s*anchor\s*\|([^}]*)\}\}/gi)].flatMap(
    ([, inner]) => inner.split("|")
  )
  const headings = [...text.matchAll(/^=+\s*(.+?)\s*=+\s*$/gm)].map(
    ([, heading]) => heading
  )
  return [...anchors, ...headings]
    .map((each) => each.trim())
    .find((each) => loose(each) === loose(name))
}

const sites: Site[] = []
for (const marker of listed) {
  const [page, landing] = landed(subpage(marker.title))
  const area = areas[marker.type]
  if (!area) throw new Error(`No area for ${marker.type} (${marker.name})`)
  // On a page the list places several sites on, one it links with no
  // section is a site of its own by its name, unless named after the page.
  const linked = marker.section ?? landing
  const own =
    linked !== undefined ||
    (placed.get(page)! > 1 && loose(marker.name) !== loose(page))
  const key = linked ?? (own ? marker.name : undefined)
  let id = key ? `${slug(page)}/${slug(key)}` : slug(page)
  if (sites.some((each) => each.id === id))
    id = `${slug(page)}/${slug(marker.name)}`
  if (sites.some((each) => each.id === id))
    throw new Error(`Two sites are ${id}`)
  const section = linked ?? (own ? anchorFor(page, marker.name) : undefined)
  sites.push({
    id,
    name: marker.name,
    area,
    type: "reef",
    page,
    ...(section !== undefined && { section }),
    own,
    lon: marker.lon,
    lat: marker.lat,
    marker,
  })
}

// A fixed position goes in before the pages are read, as a site's own part
// is found by its position too.
for (const site of sites) {
  const position = fixes[site.id]?.position
  if (position) [site.lon, site.lat] = position
}

// A link to a page opens the site its section or its words name ("Shark
// Alley" on Pyramid Rock's page), or else the page's own site, the site
// named after it, or the first of the sites in it.
function siteFor(name: string, fragment?: string, label?: string) {
  const [page, landing] = landed(name)
  const on = sites.filter((each) => each.page === page)
  const called = (text?: string) => (each: Site) =>
    text !== undefined &&
    [each.section, each.name].some(
      (one) => one !== undefined && loose(one) === loose(text)
    )
  return (
    on.find(called(fragment ?? landing)) ??
    on.find(called(label)) ??
    on.find((each) => !each.own) ??
    on.find((each) => loose(each.name) === loose(page)) ??
    on[0]
  )?.id
}

function link(inner: string) {
  const bar = inner.indexOf("|")
  const target = (bar < 0 ? inner : inner.slice(0, bar))
    .trim()
    .replace(/_/g, " ")
  if (/^:?(?:file|image|media|category)\s*:/i.test(target)) return ""
  const [title, fragment] = target.replace(/^:/, "").split("#")
  const label =
    bar < 0
      ? fragment || subpage(title).replace(/^[a-z]+:/i, "")
      : inner.slice(bar + 1)
  if (title.startsWith(`${guide}/`)) {
    const id = siteFor(subpage(title), fragment, label)
    if (id) return `[${label.trim()}](site:${id})`
  }
  return label
}

// ---- Each page's text, split where a site of its own starts, so a site
// on a shared page can show its own words first.

const pageText: Record<string, Part[]> = {}
const pageWords = new Map<string, string>()

for (const [name, text] of raw) {
  const body = pageLines(text)
  const ranges = sites
    .filter((each) => each.page === name && each.own)
    .map((each) => ({ site: each, start: findStart(body, each) }))
    .filter((each) => each.start >= 0)
    .sort((a, b) => a.start - b.start)
  const parts: Part[] = []
  let at = 0
  for (const [i, { site, start }] of ranges.entries()) {
    const same = parts.at(-1)
    if (typeof same === "object" && start < at) {
      // Two sites in one section, as both names of one pinnacle.
      if (!same.sites.includes(site.id)) same.sites.push(site.id)
      continue
    }
    // The next site's start, past any found at this same line.
    const next =
      ranges.slice(i + 1).find((each) => each.start > start)?.start ??
      body.length
    const end = Math.min(findEnd(body, start), Math.max(next, start + 1))
    if (start > at) parts.push(body.slice(at, start).join("\n"))
    parts.push({ sites: [site.id], text: body.slice(start, end).join("\n") })
    at = end
  }
  if (at < body.length) parts.push(body.slice(at).join("\n"))
  // Converted whole, so a heading over a site's section isn't taken for an
  // empty one, then split again where the sites were.
  const cut = "\n\nSPLIT-PART\n\n"
  const markdown = dropEmptyHeadings(
    parts
      .map((part) =>
        blocks(clean(typeof part === "string" ? part : part.text, link))
      )
      .join(cut)
  )
  const pieces = markdown.split(/\s*SPLIT-PART\s*/)
  pageText[name] = parts
    .map((part, i): Part => {
      const words = pieces[i].trim()
      return typeof part === "string"
        ? words
        : { sites: part.sites, text: words }
    })
    .filter((part) => (typeof part === "string" ? part : part.text))
  pageWords.set(name, plain(markdown.replace(/SPLIT-PART/g, "")))
}

// ---- Each site's figures, from its own section where it has them, and
// otherwise its page's.

for (const site of sites) {
  const parts = pageText[site.page]
  if (!parts) {
    // The few whose page doesn't exist: a name, a place and a type.
    site.type = kindOf("", site.marker, site.area)
    continue
  }
  const whole = parts
    .map((part) => (typeof part === "string" ? part : part.text))
    .join("\n\n")
  const lead = firstSentence(plain(whole.split(/^#+ /m)[0]))
  site.type = kindOf(lead, site.marker, site.area, site.own)
  const depthText = plain(section(whole, "Depth"))
  let depth = statedDepth(depthText) ?? deepest(depthText)
  site.description = describe(
    firstSentence(plain(opening(section(whole, "Understand")))),
    lead
  )
  const own = parts.find(
    (part) => typeof part === "object" && part.sites.includes(site.id)
  )
  if (typeof own === "object") {
    const words = ownWords(own.text)
    // A section is part of its page's area, so its figures can deepen the
    // page's depth, while only a maximum or range it states makes it less.
    const found = deepest(words)
    depth =
      statedDepth(words) ??
      (found && (!depth || found.depth > depth.depth) ? found : depth)
    // Its own first sentence past the notes on where it lies and how deep;
    // failing that, its page's account, where the page calls it the same
    // kind of site (a reef on a wreck's page is no wreck).
    const said = sentences(words).find((sentence) => !note.test(sentence))
    if (said && said.length <= 220) site.description = capital(tidy(said))
    else if (leadKind(lead) !== site.type) delete site.description
  }
  if (depth) site.depth = depth.depth
  if (depth?.approximate) site.approximate = true
  if (!site.description) delete site.description
}

for (const [id, fix] of Object.entries(fixes)) {
  const site = sites.find((each) => each.id === id)
  if (!site) throw new Error(`A fix for ${id}, which isn't a site`)
  // A fix read from words that have since changed needs reading again.
  const words = pageWords.get(site.page) ?? ""
  for (const said of [fix.said].flat()) {
    if (!words.includes(said.replace(/\s+/g, " "))) {
      console.warn(`${id}: the page no longer says "${said}"`)
    }
  }
  const { said: _, depth, approximate, position: __, ...rest } = fix
  void [_, __]
  // One the script has come to read for itself can go.
  if (
    depth !== undefined &&
    depth === (site.depth ?? null) &&
    !approximate === !site.approximate
  ) {
    console.warn(`${id}: the fix's depth is what the page gives`)
  }
  Object.assign(site, rest)
  if (depth === null) {
    delete site.depth
    delete site.approximate
  } else if (depth !== undefined) {
    site.depth = depth
    if (approximate) site.approximate = true
    else delete site.approximate
  }
}

// A marker whose position and the one printed after it disagree has a typo
// in one of them, which the fixes say which.
for (const { id, lon, lat, marker } of sites) {
  if (!marker.printed || fixes[id]?.position) continue
  const off = apart(marker.printed, [lon, lat])
  if (off > 150) {
    console.warn(
      `${id}: the list prints its position ${Math.round(off)} m from its marker's`
    )
  }
}

// ---- Output

// One site to a line, so a refresh's diff shows each site that changed.
const features = sites.map((site) => {
  const { id, name, area, type, section, depth, description } = site
  return JSON.stringify({
    type: "Feature",
    geometry: { type: "Point", coordinates: [site.lon, site.lat] },
    properties: {
      id,
      name,
      area,
      type,
      // No page where the list links one nobody has written.
      page: pins.missing.includes(site.page) ? undefined : site.page,
      section,
      depth,
      description,
      approximate: site.approximate,
    },
  })
})
writeFileSync(
  sitesPath,
  `{"type":"FeatureCollection","fetched":"${pins.fetched}","features":[\n${features.join(",\n")}\n]}\n`
)

const write = async (path: string, data: unknown) =>
  writeFileSync(
    path,
    await format(JSON.stringify(data), {
      ...(await resolveConfig(path)),
      filepath: path,
    })
  )
await write(pagesPath, pageText)
await write(pinsPath, pins)

const sections = sites.filter((each) => each.own)
const own = sections.filter((each) =>
  pageText[each.page]?.some(
    (part) => typeof part === "object" && part.sites.includes(each.id)
  )
)
console.log(
  `${sites.length} sites (${listed.length} of ${markers(list.text).length} markers placed), ` +
    `${Object.keys(pageText).length} pages, ${pins.missing.length} missing; ` +
    `${own.length} of ${sections.length} sections found in their pages; ` +
    `${sites.filter((each) => each.depth === undefined).length} without a depth`
)
if (written.length) {
  console.log(`Written since the last refresh: ${written.join(", ")}`)
}
