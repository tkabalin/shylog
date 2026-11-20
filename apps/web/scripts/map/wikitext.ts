// How sites.ts reads Wikivoyage's wikitext: pure functions from a page to
// Markdown, plain words, positions, depths and descriptions, apart from the
// script so tests reach them. No imports, as Node runs it unbundled.

export const nbsp = String.fromCharCode(160)
export const guide = "Diving the Cape Peninsula and False Bay"

// The subpage's own name, which is how the map's files name a page.
export const subpage = (title: string) =>
  title.slice(title.lastIndexOf("/") + 1)

// Comments, which Wikivoyage doesn't show; an unclosed one runs to the end.
export const uncomment = (text: string) =>
  text.replace(/<!--[\s\S]*?(?:-->|$)/g, "")

// ---- Brackets and templates

// Where each span between balanced brackets starts and ends, nesting
// included (a template whose parameters hold links), brackets and all.
function spans(text: string, open: string, close: string) {
  const found: [number, number][] = []
  let i = 0
  for (;;) {
    const start = text.indexOf(open, i)
    if (start < 0) break
    let depth = 0
    let end = -1
    for (let j = start; j < text.length; j++) {
      if (text.startsWith(open, j)) {
        depth++
        j += open.length - 1
      } else if (text.startsWith(close, j)) {
        depth--
        j += close.length - 1
        if (depth === 0) {
          end = j + 1
          break
        }
      }
    }
    // An unclosed bracket is left as it is.
    if (end < 0) break
    found.push([start, end])
    i = end
  }
  return found
}

// Each span replaced by what fn returns for its inside.
export function balanced(
  text: string,
  open: string,
  close: string,
  fn: (inner: string) => string
) {
  let out = ""
  let at = 0
  for (const [start, end] of spans(text, open, close)) {
    out += text.slice(at, start)
    out += fn(text.slice(start + open.length, end - close.length))
    at = end
  }
  return out + text.slice(at)
}

// A template's name and arguments, split on the bars outside the links
// and templates nested in it; unnamed ones are numbered from 1.
export function template(inner: string) {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (let i = 0; i < inner.length; i++) {
    // A pair is taken whole, so "]]]" counts one close, not two.
    const pair = inner.slice(i, i + 2)
    if (["[[", "{{", "]]", "}}"].includes(pair)) {
      depth += pair === "[[" || pair === "{{" ? 1 : -1
      current += pair
      i++
    } else if (inner[i] === "|" && depth === 0) {
      parts.push(current)
      current = ""
    } else current += inner[i]
  }
  parts.push(current)
  const [name, ...rest] = parts
  const args: Record<string, string> = {}
  let position = 0
  for (const part of rest) {
    const eq = part.indexOf("=")
    if (eq > 0 && /^[\w ]+$/.test(part.slice(0, eq))) {
      args[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim()
    } else args[String(++position)] = part.trim()
  }
  return { name: name.trim().toLowerCase(), args }
}

export const linkPattern = /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/

// ---- Positions

// A position as the pages print it after a marker, S34°16.775’ E018°28.830’.
// Some mistype the longitude's E as S, write º for °, or leave a gap after
// the decimal point.
export const position =
  /([NS])\s?(\d{1,2})\s?[°º]\s?(\d{1,2}(?:[.,]\s?\d+)?)['’′]?\d*\s*,?\s*[EWS]E?\s?(\d{1,3})\s?[°º]\s?(\d{1,2}(?:[.,]\s?\d+)?)['’′]?/

// The first position printed in the text, as [longitude, latitude].
export function printed(text: string): [number, number] | undefined {
  const at = position.exec(text)
  if (!at) return undefined
  const minutes = (part: string) =>
    Number(part.replace(",", ".").replace(/\s/g, ""))
  const lat = (Number(at[2]) + minutes(at[3]) / 60) * (at[1] === "S" ? -1 : 1)
  return [Number(at[4]) + minutes(at[5]) / 60, lat]
}

// Metres between two positions, near enough for a few kilometres here.
export function apart(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number]
) {
  const east = (lon1 - lon2) * 111_320 * Math.cos((lat1 * Math.PI) / 180)
  return Math.hypot(east, (lat1 - lat2) * 110_574)
}

// ---- The list's markers

export type Marker = {
  type: string
  title: string
  section?: string
  name: string
  // In italics, as Wikivoyage writes a ship's name.
  ship: boolean
  lon: number
  lat: number
  // The position printed after it, which a typo in either one shows up.
  printed?: [number, number]
}

// The list's {{marker}}s: each links its site's page, or a section of a
// page several sites share, and its colour is the site's area. Those in
// comments, which Wikivoyage doesn't show, are left out.
export function markers(wikitext: string) {
  const text = uncomment(wikitext)
  const found: Marker[] = []
  const all = spans(text, "{{", "}}")
  all.forEach(([start, end], i) => {
    const { name, args } = template(text.slice(start + 2, end - 2))
    // Text after the link is the name's too: "[[…|The Roc]]k" on one.
    const link = /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\](.*)$/.exec(args.name ?? "")
    if (name !== "marker" || !link) return
    const [title, section] = link[1].replace(/_/g, " ").split("#")
    const label = link[2] ?? ""
    const line = text.indexOf("\n", end)
    const after = text.slice(
      end,
      Math.min(all[i + 1]?.[0] ?? text.length, line < 0 ? text.length : line)
    )
    found.push({
      type: args.type ?? "",
      title: title.trim(),
      section: section?.trim() || undefined,
      name: decode(
        plain(quotes((link[2] ?? section ?? subpage(title)) + link[3]))
      ),
      ship: label.includes("''"),
      lon: Number(args.long),
      lat: Number(args.lat),
      printed: printed(after),
    })
  })
  return found
}

// A page's own {{marker}}s for the features inside its sites (a pinnacle, a
// swim-through, a wreck's bow, the entry point), where a name with no link
// isn't another site, with the rest of the marker's line, which says what
// it is.
export type Feature = { name: string; lon: number; lat: number; after: string }
export function features(wikitext: string) {
  const text = uncomment(wikitext)
  const found: Feature[] = []
  const all = spans(text, "{{", "}}").map(([start, end]) => ({
    start,
    end,
    ...template(text.slice(start + 2, end - 2)),
  }))
  all.forEach(({ end, name, args }, i) => {
    const label = args.name ?? ""
    if (name !== "marker" || !["do", "see"].includes(args.type ?? "")) return
    if (!label || label.includes("[[")) return
    const lon = Number(args.long)
    const lat = Number(args.lat)
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !lon || !lat) return
    // Up to the next marker on its line, which says what that one is.
    const line = text.indexOf("\n", end)
    const next = all.slice(i + 1).find((each) => each.name === "marker")?.start
    found.push({
      name: decode(plain(quotes(label))),
      lon,
      lat,
      after: text.slice(
        end,
        Math.min(next ?? text.length, line < 0 ? text.length : line)
      ),
    })
  })
  return found
}

// The pages a text links in the guide, by their full titles.
export function guideLinks(wikitext: string) {
  const found = new Set<string>()
  const pattern = new RegExp(String.raw`\[\[\s*:?\s*(${guide}/[^|\]#]+)`, "gi")
  for (const [, title] of uncomment(wikitext).matchAll(pattern)) {
    found.add(title.replace(/_/g, " ").trim())
  }
  return found
}

// Where each title lands, from the API's normalized titles and redirects:
// subpage to subpage, with the section a redirect points at, for those that
// land elsewhere ("Drop Zone" is "Steenbras Ridge#Drop Zone").
export function landings(
  titles: Iterable<string>,
  normalized: { from: string; to: string }[],
  redirects: { from: string; to: string; tofragment?: string }[]
) {
  const named = new Map(normalized.map(({ from, to }) => [from, to]))
  const redirected = new Map(redirects.map((each) => [each.from, each]))
  const landed: Record<string, string> = {}
  for (const title of titles) {
    const name = named.get(title) ?? title
    const to = redirected.get(name)
    const lands = to
      ? `${subpage(to.to)}${to.tofragment ? `#${to.tofragment}` : ""}`
      : subpage(name)
    if (lands !== subpage(title)) landed[subpage(title)] = lands
  }
  return Object.fromEntries(
    Object.entries(landed).sort(([a], [b]) => a.localeCompare(b))
  )
}

// ---- Text

const entities: Record<string, string> = {
  nbsp,
  // Misspellings of nbsp the pages use.
  npsp: nbsp,
  bsp: nbsp,
  npbp: nbsp,
  nbdp: nbsp,
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  mdash: "—",
  ndash: "–",
  deg: "°",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  times: "×",
  frac12: "½",
  minus: "−",
  prime: "′",
  hellip: "…",
}
export const decode = (text: string) =>
  text.replace(/&(#x?)?(\w+);/g, (whole, number: string, name: string) => {
    if (number)
      return String.fromCodePoint(parseInt(name, number === "#x" ? 16 : 10))
    return entities[name.toLowerCase()] ?? whole
  })

// Text with its markup and entities but not its structure: comments,
// references, galleries and embedded maps go; templates become their words.
export function clean(text: string, link: (inner: string) => string) {
  let out = uncomment(text)
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<(gallery|maplink)[^>]*>[\s\S]*?<\/\1>/gi, "")
  out = balanced(out, "{{", "}}", (inner) => {
    const { name, args } = template(inner)
    switch (name) {
      // A dive site's own position, a feature inside it, or a nearby site:
      // its name, which links that site where it is one.
      case "marker":
      case "listing": {
        const label = (args.name ?? "").trim()
        if (!label) return ""
        return linkPattern.test(label) ? label : `'''${label}'''`
      }
      case "metre":
      case "m":
        return `${args[1]}${nbsp}m`
      case "ft":
        return `${args[1]}${nbsp}ft`
      case "km":
        return `${args[1]}${nbsp}km`
      case "isbn":
        return `ISBN ${args[1]}`
      // Banners, maps, "see also" boxes, anchors, status and navigation.
      default:
        return ""
    }
  })
  out = balanced(out, "[[", "]]", link)
  return decode(
    out
      .replace(/\[(?:https?:)?\/\/[^\s\]]+(?:\s+([^\]]*))?\]/g, "$1")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?[a-z][^>]*>/gi, "")
  )
}

// Bold and italics as MediaWiki reads a line's runs of apostrophes (its
// Parser::doQuotes): "'''SS ''Maori'''''" is "**SS *Maori***", and
// "''Peninsula ''pluton" is "*Peninsula* pluton".
export function quotes(line: string) {
  const runs = line.split(/('{2,})/)
  if (runs.length === 1) return line
  let italics = 0
  let bolds = 0
  for (let i = 1; i < runs.length; i += 2) {
    // Four is an apostrophe and bold, more than five apostrophes and both.
    if (runs[i].length === 4) {
      runs[i - 1] += "'"
      runs[i] = "'''"
    } else if (runs[i].length > 5) {
      runs[i - 1] += "'".repeat(runs[i].length - 5)
      runs[i] = "'''''"
    }
    if (runs[i].length !== 3) italics++
    if (runs[i].length !== 2) bolds++
  }
  // An odd number of each: one bold is an apostrophe and italics, best one
  // after a single letter ("l'''"), then after a word, then after a space.
  if (italics % 2 && bolds % 2) {
    let letter = -1
    let word = -1
    let space = -1
    for (let i = 1; i < runs.length; i += 2) {
      if (runs[i].length !== 3) continue
      const [before, last] = [runs[i - 1].at(-2), runs[i - 1].at(-1)]
      if (last === " ") {
        if (space < 0) space = i
      } else if (before === " " || before === undefined) {
        letter = i
        break
      } else if (word < 0) word = i
    }
    const at = letter >= 0 ? letter : word >= 0 ? word : space
    if (at >= 0) {
      runs[at - 1] += "'"
      runs[at] = "''"
    }
  }
  // Each stretch of text with whether it's bold and italic.
  const stretches: { text: string; bold: boolean; italic: boolean }[] = []
  let bold = false
  let italic = false
  runs.forEach((run, i) => {
    if (i % 2 === 0) stretches.push({ text: run, bold, italic })
    else if (run.length === 2) italic = !italic
    else if (run.length === 3) bold = !bold
    else {
      bold = !bold
      italic = !italic
    }
  })
  // Marks open and close around the words, nested as they were, with spaces
  // kept outside them, where Markdown needs them to see a mark.
  let out = ""
  let spaces = ""
  const open: string[] = []
  for (const { text, bold, italic } of stretches) {
    const [, before, words, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!
    spaces += before
    if (!words) {
      spaces += after
      continue
    }
    const want = [...(bold ? ["**"] : []), ...(italic ? ["*"] : [])]
    let keep = 0
    while (keep < open.length && want.includes(open[keep])) keep++
    const closing = open.splice(keep).reverse().join("")
    // Markdown doesn't close a mark after punctuation that runs into a word
    // ("**Cavern:**From" shows its asterisks), so a space goes between.
    if (
      closing &&
      !spaces &&
      /[^\p{L}\p{N}]$/u.test(out) &&
      /^[\p{L}\p{N}]/u.test(words)
    )
      spaces = " "
    out += closing + spaces
    const opening = want.filter((mark) => !open.includes(mark))
    open.push(...opening)
    out += opening.join("") + words
    spaces = after
  }
  return out + open.reverse().join("") + spaces
}

// Markdown's own marks at the start of a line of text, which would make a
// heading, a quote or a list of it.
const escape = (line: string) =>
  line.replace(/^([#>+-]|\d+[.)])(?=\s)/, (mark) =>
    /\d/.test(mark) ? `${mark.slice(0, -1)}\\${mark.at(-1)}` : `\\${mark}`
  )

// A ship's particulars, the only tables the pages hold: a name and a value
// split over a few cells ("5", ".5", "m"), with a caption. A cell's words
// follow its attributes and a bar ("align=right | 2220").
function table(lines: string[]) {
  let caption = ""
  const rows: string[][] = []
  let row: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith("|+")) caption = line.slice(2).trim()
    else if (line.startsWith("|-")) {
      if (row.length) rows.push(row)
      row = []
    } else if (/^[|!]/.test(line)) {
      for (const cell of line.slice(1).split(/\|\||!!/)) {
        const bar = cell.indexOf("|")
        row.push((bar >= 0 ? cell.slice(bar + 1) : cell).trim())
      }
    }
  }
  if (row.length) rows.push(row)
  const cell = (text: string) => quotes(text).replace(/\|/g, "\\|")
  const body = rows
    .filter((each) => each.some(Boolean))
    .map(([label, ...value]) => {
      const joined = value
        .filter(Boolean)
        .reduce(
          (all, part) => all + (all && !part.startsWith(".") ? " " : "") + part,
          ""
        )
      return `| ${cell(label)} | ${cell(joined)} |`
    })
  return ["", `| ${cell(caption)} | |`, "| --- | --- |", ...body, ""]
}

// Wikitext's headings, lists, tables and paragraphs as Markdown.
export function blocks(text: string) {
  const out: string[] = []
  const lines = text.split("\n")
  let inList = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith("{|")) {
      const start = i
      while (i < lines.length && !lines[i].trim().startsWith("|}")) i++
      out.push(...table(lines.slice(start + 1, i)))
      inList = false
      continue
    }
    const heading = /^(={2,6})\s*(.+?)\s*\1$/.exec(line)
    if (heading) {
      out.push("", `${"#".repeat(heading[1].length)} ${quotes(heading[2])}`, "")
      inList = false
      continue
    }
    const list = /^([*#:;]+)\s*(.*)$/.exec(line)
    if (list && list[2]) {
      const marks = list[1].replace(/:/g, "")
      if (!marks || list[1].endsWith(";")) {
        // Indented text, or a term: a paragraph of its own.
        if (inList) out.push("")
        out.push(escape(list[1].endsWith(";") ? `'''${list[2]}'''` : list[2]))
        inList = false
        continue
      }
      const bullet = marks.endsWith("#") ? "1." : "-"
      out.push(`${"  ".repeat(marks.length - 1)}${bullet} ${list[2]}`)
      inList = true
      continue
    }
    // A paragraph after a list, which Markdown would fold into its last item.
    if (inList && line) out.push("")
    inList = false
    out.push(escape(line))
  }
  return out
    .map(quotes)
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Plain text from Markdown, for the description and the depth.
export const plain = (markdown: string) =>
  markdown
    .replace(/^#+ .*$/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*+/g, "")
    .replace(/^\s*(?:-|\d+\.)\s+/gm, "")
    .replace(/\\(?=[#>+.-])/g, "")
    .replace(/\s+/g, " ")
    .trim()

// The sentences: each up to a full stop before a capital or a bracket,
// past the abbreviations the pages use.
export function sentences(text: string) {
  const all: string[] = []
  let start = 0
  for (const match of text.matchAll(/[.!?](?=\s+(?:\(|["“‘']?[A-Z0-9]))/g)) {
    const before = text.slice(start, match.index)
    // Abbreviations the pages use, and initials: "SS Thomas T. Tucker",
    // "Capt E.R. Brown", "Lobnitz and Co. Renfrewshire".
    if (
      /\b(?:approx|e\.g|i\.e|St|Mt|No|ca|cf|vs|Dr|Mr|Mrs|Capt|Lt|est|Co|Ltd|Pty|Inc|Bros)$/i.test(
        before
      ) ||
      /(?:^|[\s"“‘'(.])[A-Z]$/.test(before)
    ) {
      continue
    }
    all.push(text.slice(start, match.index + 1).trim())
    start = match.index + 1
  }
  const rest = text.slice(start).trim()
  return rest ? [...all, rest] : all
}
export const firstSentence = (text: string) => sentences(text)[0] ?? ""

export const capital = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

// A section's own words: its heading, its site's name and position, and any
// note on that position taken off the front. A name the words go on from
// stays: "Whaleback Rock: S34°… is at the end" is "Whaleback Rock is at…".
export function ownWords(markdown: string) {
  let text = markdown.replace(/^#+ .*\n*/, "")
  const label = /^(?:[-*]\s+|\d+\.\s+)?\*\*([^*]+)\*\*/.exec(text)
  if (label) text = text.slice(label[0].length)
  text = plain(text)
  const at = position.exec(text)
  if (at && at.index < 120) text = text.slice(at.index + at[0].length)
  text = text.replace(/^(?:[\s.,;:—–-]|\([^)]*\))+/, "")
  const name = label?.[1].replace(/[\s:,.]+$/, "")
  if (name && /^(?:is|are|was|were|lies|has|have)\b/.test(text)) {
    return `${name} ${text}`
  }
  if (name && /^or\b/.test(text)) return `${name}, ${text}`
  if (name && /^also known as\b/i.test(text)) {
    return `${name}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`
  }
  return text
}

// ---- Depths

export type Depth = { depth: number; approximate?: true }

// A figure in metres: "12 m", "12.5 metres", "12&nbsp;m", or one a page
// marks unsure, "(48?) m" or "4(?) m".
const metres = new RegExp(
  String.raw`\(?(\d+(?:[.,]\d+)?)(\(\?\)|\?\)?)?(?:\s|${nbsp})*(?:m|metres?|meters?)\b`,
  "gi"
)

// What follows a distance, a size or a contour rather than a depth: "the
// 10 m contour is about 200 m out", "about 6 m high", "about 25 m height",
// "about 50 m due west", "20 m to the south east of the rock".
const distanceAfter =
  /^(?:\s|\.)*(?:out|offshore|inshore|from|away|of|off|north|south|east|west|along|long|wide|high|tall|height|across|beyond|further|horizontal|apart|diameter|in diameter|prominence|swim|due|length|above|between|contour|isobath|on (?:the |its )?top|on (?:a )?bearing|to the [a-z -]{1,25}? of)\b/i

// "About 30 m to the north" is a distance; in a sentence on the sand or
// the depth, "sand at about 29 m to the west" and "Maximum depth is about
// 18 m to the south, and 22 m to the north" are depths.
const toward = /^(?:\s|\.)*to the (?:north|south|east|west)/i
const depthWords = /\b(?:sand|bottom|depth|deep|floor|base|max\w*)\b/i

// What comes before one in its clause: "for about 200 m", "(about 250 m)",
// an area "above 18 m", "an overall length of about 426 m", visibility
// "estimated at about 15 m", a height "projects out of the sand about 3 m".
const distanceBefore =
  /\b(?:extends?(?: for)?(?: over)?|for|extra|within|another)\s*(?:about|approximately|roughly|some|nearly)?\s*$|\(about\s*$|\babove(?: the)?(?: about)?\s*$|\b(?:distance|length|width|spacing|diameter|height|size)\b|visib|\b(?:projects?|projecting|protrud\w*|stands?|standing|sticks? (?:up|out))\b/i

// A top or a high point rather than a depth: "with its top at about 26 m",
// "rising to 22 m", "a shallow point at about 20 m". Rising from the sand
// at a figure is a depth, and so is one "on top of the reef at 25 m".
const topBefore =
  /(?<!\bon )\b(?:tops?|peaks?|shallowest|shallow point|high(?:est)? points?|minimum depth|rises|rising|reach(?:es|ing)?)\b(?![\s\S]*\b(?:from|bottom|sand|base|down)\b)[\s\S]*$/i

// A depth the words bound rather than give, "generally less than 8 m",
// which the sheet marks approximate.
const boundBefore =
  /\b(?:less than|under|up to|not more than|no more than)\s*(?:about|approximately|roughly)?\s*$/i

// Sentences on how much the depth varies, not how deep it is: "the local
// depth variation is … usually less than about 10 m".
const variation = /\b(?:variation|var(?:y|ies) by|changes? by)\b/i

// The words before an index, back to the start of its clause.
function clause(text: string, index: number) {
  const window = text.slice(Math.max(0, index - 80), index)
  const cut = Math.max(
    window.lastIndexOf(", "),
    window.lastIndexOf("; "),
    window.lastIndexOf(": "),
    window.lastIndexOf(". ")
  )
  return window.slice(cut + 1)
}

// The figures in a text that are depths.
export function figures(text: string) {
  return [...text.matchAll(metres)].flatMap((match) => {
    const lead = clause(text, match.index)
    const start = Math.max(text.lastIndexOf(". ", match.index), 0)
    const after = text.slice(match.index + match[0].length)
    if (
      distanceAfter.test(after) ||
      (toward.test(after) &&
        !depthWords.test(text.slice(start, match.index))) ||
      distanceBefore.test(lead) ||
      topBefore.test(lead) ||
      variation.test(text.slice(start, match.index))
    ) {
      return []
    }
    const metres = Number(match[1].replace(",", "."))
    return [{ metres, bound: !!match[2] || boundBefore.test(lead) }]
  })
}

// The deepest of them, "from 5 to 10 m deep on the sand" being 10 m,
// approximate where every figure that deep is only bounded or unsure.
export function deepest(text: string): Depth | undefined {
  const all = figures(text)
  if (!all.length) return undefined
  const most = Math.max(...all.map((each) => each.metres))
  const depth = Math.round(most)
  return all.some((each) => each.metres === most && !each.bound)
    ? { depth }
    : { depth, approximate: true }
}

// The deepest figure in the sentences that give a maximum or a range,
// "about 18 m to the south, and 22 m to the north" being 22 m, or "Depth
// range 15 to 23 m", but not a "maximum width".
export function statedDepth(text: string) {
  const said = text
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .filter((sentence) =>
      /\bmax(?:imum|\.)?\b(?!\s+(?:width|length|extent|height|diameter|size|span|speed|distance))|depth range|depths? (?:between|from)\b/i.test(
        sentence
      )
    )
  return said.length ? deepest(said.join(" ")) : undefined
}

// ---- Sections

// The section under a heading, up to the next of its level or higher.
export function section(markdown: string, name: string) {
  const lines = markdown.split("\n")
  const start = lines.findIndex((line) =>
    new RegExp(`^#+ ${name}$`, "i").test(line)
  )
  if (start < 0) return ""
  const level = lines[start].indexOf(" ")
  const end = lines.findIndex(
    (line, i) => i > start && /^#+ /.test(line) && line.indexOf(" ") <= level
  )
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n")
}

// Up to its first subheading, as Understand's opening paragraph.
export const opening = (markdown: string) => markdown.split(/^#+ /m)[0]

// A name compared loosely: case, accents, quotes and punctuation aside.
export const loose = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/'{2,}/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

export const slug = (text: string) =>
  loose(text.replace(/['’]/g, "")).replace(/ /g, "-")

// Sentences with nothing for the sheet: the page template's unfilled
// placeholders, "(depth)" or "(distance)", and pointers to the galleries,
// which the sheet leaves out ("see Drop Zone gallery").
const unfilled =
  /\((?:depth|distance)\)|\[\[\s*(?:#[^\]|]*gallery|[^\]|]*\/gallery)\b[^\]]*\]\]/i

// A page's lines less its comments, closing navigation, a note that another
// page shares its name ("Noah's Ark redirects here"), and its unfilled and
// gallery sentences, with their line once nothing else is left.
export function pageLines(wikitext: string) {
  return uncomment(wikitext)
    .replace(/^(?:''')?Back to [\s\S]*?(?=^==[^=]|$(?![\s\S]))/m, "")
    .split("\n")
    .filter((line) => !/^:+.*\bredirects here\b/i.test(line))
    .flatMap((line) => {
      if (!unfilled.test(line)) return [line]
      const kept = line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !unfilled.test(sentence))
        .join(" ")
      return /[\p{L}\d]/u.test(kept) ? [kept] : []
    })
}

// What the refresh needs of a site to find it in its page.
export type Seek = { section?: string; name: string; lon: number; lat: number }

// A line that starts something: a heading, an anchor or marker, a bold
// subheading alone, or a paragraph that opens on a feature's name in bold
// ("'''Aoife's Reef patch''' is…") rather than a label ("'''Geology:'''").
const startsBlock = (line: string) =>
  /^=+[^=]/.test(line) ||
  /^[*:#]*\s*\{\{\s*(?:anchor|marker)\b/i.test(line) ||
  /^'''[^']+'''\s*$/.test(line) ||
  /^'''(?:(?!''').)*[^':\s]\s*'''\s*[^\s:]/.test(line)

// A line holding nothing to read: anchors, markers on their own, images.
const filler = (line: string) =>
  !balanced(line, "[[", "]]", (inner) =>
    /^(?:file|image)\s*:/i.test(inner) ? "" : `[[${inner}]]`
  )
    .replace(/\{\{\s*anchor\b[^}]*\}\}/gi, "")
    .replace(/^[*:#]*\s*\{\{\s*marker\b[^}]*\}\}\s*$/i, "")
    .replace(/^[*:#\s]+/, "")
    .trim()

type Found = { name?: string; type: string; lon: number; lat: number }
const markersOn = (line: string): Found[] =>
  [...line.matchAll(/\{\{\s*marker\s*\|([^}]*)\}\}/gi)].map(([, inner]) => ({
    name: /name\s*=\s*([^|]*)/.exec(inner)?.[1],
    type: /type\s*=\s*([^|]*)/.exec(inner)?.[1].trim() ?? "",
    lat: Number(/lat\s*=\s*([-\d.]+)/.exec(inner)?.[1]),
    lon: Number(/long\s*=\s*([-\d.]+)/.exec(inner)?.[1]),
  }))

// Where a site of its own starts in its page: its anchor, else its marker
// (by name or position) before any heading or bold name, as the lead and
// Marine life name sites too, then a Position listing, else the nearest.
export function findStart(lines: string[], site: Seek) {
  const names = [site.section, site.name]
    .filter((each) => each !== undefined)
    .map(loose)
  const named = (text: string) => names.includes(loose(text))
  const at = (each: Found) =>
    Math.abs(each.lat - site.lat) < 1e-5 && Math.abs(each.lon - site.lon) < 1e-5
  const passes: ((line: string) => boolean)[] = [
    (line) =>
      [...line.matchAll(/\{\{\s*anchor\s*\|([^}]*)\}\}/gi)].some(([, inner]) =>
        inner.split("|").some(named)
      ),
    (line) =>
      markersOn(line).some(
        (each) =>
          !["listing", "vicinity"].includes(each.type) &&
          ((each.name !== undefined && named(each.name)) || at(each))
      ),
    (line) => {
      const heading = /^(=+)\s*(.+?)\s*\1\s*$/.exec(line)
      return heading ? named(heading[2]) : false
    },
    (line) => {
      const bold = /^[*:]*\s*'''([^']+)'''/.exec(line)
      return bold ? named(bold[1]) : false
    },
    (line) =>
      markersOn(line).some(
        (each) =>
          each.type === "listing" &&
          ((each.name !== undefined && named(each.name)) || at(each))
      ),
  ]
  for (const pass of passes) {
    const found = lines.findIndex(pass)
    if (found >= 0) return found
  }
  let nearest = -1
  let best = 0.0006
  lines.forEach((line, i) => {
    for (const each of markersOn(line)) {
      const off = Math.hypot(each.lat - site.lat, each.lon - site.lon)
      if (off < best) {
        best = off
        nearest = i
      }
    }
  })
  return nearest
}

// It runs to the next start once it has words of its own; a heading's to
// the next heading of its level, and a bold name's paragraph to its blank
// line.
export function findEnd(lines: string[], start: number) {
  const heading = /^(=+)[^=]/.exec(lines[start])
  let content = false
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (heading) {
      const next = /^(=+)[^=]/.exec(line)
      if (next && next[1].length <= heading[1].length) return i
      continue
    }
    if (
      /^\s*$/.test(line) &&
      /^[*:]*\s*'''/.test(lines[start]) &&
      !/\{\{/.test(lines[start])
    ) {
      return i
    }
    if (startsBlock(line) && (content || /^=/.test(line))) return i
    if (!filler(line)) content = true
  }
  return lines.length
}

// ---- What a page says of its site

export type Kind = "reef" | "wreck" | "fresh"

// What the opening sentence calls the site, up to where it says where:
// "is the wreck of", "are the remains of two barges", but "is an offshore
// rocky reef where the Lusitania was wrecked" is a reef.
export function leadKind(lead: string): Kind {
  if (/\bis an? flooded quarry\b/i.test(lead)) return "fresh"
  const head =
    /\b(?:is|are|was)\s+(.+?)(?:\s(?:of|in|on|at|off|near|which|where|that|from)\s|,|$)/i.exec(
      lead
    )?.[1] ?? ""
  // Whichever it names first: "an inshore rocky reef and historical wreck".
  const kind =
    /\b(reefs?|pinnacles?|shoal|wrecks?|shipwreck|hulk|scuttled|barges?|remains|trawler|ship|minesweeper|frigate|submarine)\b/i.exec(
      head
    )?.[1]
  return kind && !/^(?:reefs?|pinnacles?|shoal)$/i.test(kind) ? "wreck" : "reef"
}

// The opening sentence's account of the site, "An inshore rocky reef.",
// for a page whose Understand doesn't open with a sentence of its own.
export function fromLead(lead: string) {
  const predicate = /\b(?:is|are)\s+((?:an?|two|three|several|the)\s.*)$/i.exec(
    lead
  )?.[1]
  if (!predicate) return undefined
  // Up to where it says where, which a comma before an adjective doesn't:
  // "an inshore, rocky reef in the Karbonkelberg headland area".
  const phrase = predicate.split(
    /,(?= near| in | on | off | at | part of)| near | in the | on the | off | at the /
  )[0]
  return `${capital(phrase.trim().replace(/\.$/, ""))}.`
}

// A section's notes, which the sheet's figures, its zone row or the text
// give better: a bearing, a depth range, "Maximum depth 21 m", "About 8.6
// km west of Harbour Island", and whether it's in a protected area.
export const note =
  /magnetic|depth range|^(?:maximum|max\.?|average)\b|^[\d.,]+\s*m deep\.?$|^about [\d.,]+\s*km\b|^(?:this|the) (?:dive )?(?:site|reef|area|wreck)s? (?:is|are) (?:not )?(?:partly |all |just |entirely |mostly |wholly )?(?:in|inside|within|outside)\b.*\b(?:protected area|restricted (?:zone|area)|MPA)\b|^(?:a )?permits? (?:is|are) (?:not )?required/i

// A sentence a page leaves on a comma ends on a full stop, and one that
// opens on an aside ("(aka Northeast Buttress) A magnificent…") loses it.
export const tidy = (sentence: string) =>
  sentence.replace(/^\([^)]*\)\s*/, "").replace(/[,;:]$/, ".")

// The sheet shows it at a glance, so a sentence that runs to several lines
// gives way to the opening's short account, as the boards had it.
export const describe = (sentence: string, lead: string) =>
  sentence && sentence.length <= 220 ? tidy(sentence) : fromLead(lead)

// ---- Site maps, sonar images, aerial photos and wrecks' plans

export type PictureKind = "map" | "sonar" | "aerial" | "plan"
export type Picture = { file: string; kind: PictureKind; caption: string }

// What a picture's name and caption say it is. Sonar first, as many sonar
// images are maps too ("Dive sites of Whittle Rock on multibeam map"). A
// route drawn on a map is a PNG; a JPEG "showing the route" is a photo
// from the shore, which isn't taken, nor are photos of sea life.
function kindOf(file: string, caption: string): PictureKind | undefined {
  const said = `${file} ${caption}`
  if (/sonar|multi-?beam|bathymetr|side-?scan/i.test(said)) return "sonar"
  if (/aerial/i.test(said)) return "aerial"
  if (/general arrangement/i.test(said)) return "plan"
  if (/\bmap\b|sketch|\bchart\b|contours/i.test(said)) return "map"
  if (/\broute\b/i.test(said) && /\.(?:png|svg)$/i.test(file)) return "map"
}

const options =
  /^(?:thumb|thumbnail|frame|frameless|border|left|right|center|centre|none|upright|\d*x?\d+px)$/i

// Commons' own spelling of a file's name: escapes read as UTF-8 (one
// that isn't a valid escape is left as it is), a capital first, spaces
// for _.
const unescape = (text: string) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}
const commonsName = (file: string) =>
  capital(unescape(file.trim()).replace(/_/g, " "))

const plainCaption = (caption: string) =>
  decode(
    caption
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
      .replace(/'{2,}/g, "")
  )
    .replace(/\s+/g, " ")
    .trim()

// The pictures a page shows inline, in page order, with their captions as
// plain words: [[File:…]] links, and the area map the dive guide's
// templates draw at a page's top. A name with no extension is the page
// template's placeholder. Galleries hold only photos of sea life.
export function pictures(wikitext: string) {
  const text = uncomment(wikitext).replace(
    /<gallery[^>]*>[\s\S]*?<\/gallery>/gi,
    ""
  )
  const named: { at: number; file: string; caption: string }[] = []
  for (const [start, end] of spans(text, "[[", "]]")) {
    const inner = text.slice(start + 2, end - 2)
    // The name as written: template() lowercases it.
    const file = /^\s*(?:file|image)\s*:\s*([^|]+)/i.exec(inner)?.[1]
    if (!file) continue
    const words = Object.entries(template(inner).args)
      .filter(([key, value]) => /^\d+$/.test(key) && !options.test(value))
      .map(([, value]) => value)
    named.push({ at: start, file, caption: words.at(-1) ?? "" })
  }
  for (const [start, end] of spans(text, "{{", "}}")) {
    const { name, args } = template(text.slice(start + 2, end - 2))
    if (!["toggle dive maps", "regionlist"].includes(name)) continue
    if (args.regionmap) {
      named.push({
        at: start,
        file: args.regionmap,
        caption: args.regionmaptext ?? "",
      })
    }
  }
  const found: Picture[] = []
  for (const each of named.sort((a, b) => a.at - b.at)) {
    const file = commonsName(each.file)
    const caption = plainCaption(each.caption)
    const kind = /\.\w{3,4}$/.test(file) && kindOf(file, caption)
    if (kind && !found.some((one) => one.file === file)) {
      found.push({ file, kind, caption })
    }
  }
  return found
}

// No one has needed a permit to dive in the Table Mountain MPA since GN
// R.4786 of 3 May 2024, but most of its pages still say "A permit is
// required." beside the MPA they name or date (2004, or 2009 on one).
// Robben Island's pages, dated 2019, keep theirs.
export function dropPermit(markdown: string) {
  return markdown
    .split("\n\n")
    .map((paragraph) =>
      /Table Mountain|\b200[49]\b/.test(paragraph) &&
      !/\b2019\b|Robben/.test(paragraph)
        ? paragraph
            .replace(/A permit is required to dive, and s/g, "S")
            .replace(
              / *A permit (?:for recreational diving )?is\s+required(?: to dive(?: in the MPA)?)?(?:\.|(?= *(?:\n|$)))/g,
              ""
            )
            .replace(/ +$/gm, "")
        : paragraph
    )
    .join("\n\n")
}
