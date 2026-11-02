import { dropUnwritable } from "@shylog/core"

// Small builders for the UDDF Shylog writes, shared by the export and the
// SSI converter. An element is a list of lines, indented by its parent, so
// the output is stable text that diffs well from one night to the next.
export type Xml = string[]

// XML 1.0 has no way to write most control characters, even escaped, so one
// in older data or the SSI logbook would make the whole export unreadable.
export const escape = (text: string) =>
  dropUnwritable(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    // A bare carriage return would be read back as a newline, and so would
    // these by xmldom, which ends lines as XML 1.1 does.
    .replace(/[\r\u0085\u2028\u2029]/g, (c) => `&#${c.charCodeAt(0)};`)

export function element(name: string, children: (Xml | null)[], attrs = "") {
  const inner = children.filter((child) => child != null).flat()
  if (!inner.length) return [`<${name}${attrs}/>`]
  return [
    `<${name}${attrs}>`,
    ...inner.map((line) => `  ${line}`),
    `</${name}>`,
  ]
}

// JavaScript writes a number under 10⁻⁶ with an exponent, which xs:decimal
// and XPath don't read. Nothing Shylog writes reaches 10²¹, the other end.
function decimal(value: number) {
  const exponent = /^(-?)(\d)(?:\.(\d+))?e-(\d+)$/.exec(String(value))
  if (!exponent) return String(value)
  const [, sign, digit, rest = "", power] = exponent
  return `${sign}0.${"0".repeat(Number(power) - 1)}${digit}${rest}`
}

export function leaf(name: string, value: string | number | null | undefined) {
  if (value == null) return null
  const text = typeof value === "number" ? decimal(value) : value
  return [`<${name}>${escape(text)}</${name}>`]
}

export const link = (ref: string) => [`<link ref="${escape(ref)}"/>`]

// Subsurface puts a buddy's names together as firstname then lastname, so
// the first word fills firstname and the rest, if any, lastname. The XSD
// requires both.
export function personal(name: string) {
  const [first = "", ...rest] = name.trim().split(/\s+/)
  return element("personal", [
    leaf("firstname", first),
    leaf("lastname", rest.join(" ")),
  ])
}
