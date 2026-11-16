// A Wikivoyage page's text, as Markdown in parts: the sections a site of
// its own starts (one of Whittle Rock's pinnacles) apart from the rest, so
// that site's sheet can show its own words first. No imports, as the
// refresh script reads this file too.

export type Part = string | { sites: string[]; text: string }

const level = (line: string | undefined) =>
  (line && /^(#+) /.exec(line)?.[1].length) || 0

// A heading with nothing under it before the next of its level or higher:
// the page template's sections nobody filled in, or one whose only site
// was taken out to go first.
export function dropEmptyHeadings(markdown: string) {
  const kept: string[] = []
  for (const line of markdown.split("\n").reverse()) {
    const own = level(line)
    if (own) {
      const next = kept.findLast((each) => each.trim())
      if (!next || (level(next) && level(next) <= own)) continue
    }
    kept.push(line)
  }
  return kept
    .reverse()
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// A site's own section without its heading, which the sheet's title
// already gives, and the rest of its page.
export function siteText(parts: Part[], id: string) {
  const own = parts.find(
    (part) => typeof part === "object" && part.sites.includes(id)
  )
  const rest = parts
    .filter((part) => part !== own)
    .map((part) => (typeof part === "string" ? part : part.text))
    .join("\n\n")
  return {
    own: typeof own === "object" ? own.text.replace(/^#+ .*\n*/, "") : "",
    rest: dropEmptyHeadings(rest),
  }
}
