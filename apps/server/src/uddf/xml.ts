// Small builders for the UDDF Shylog writes, shared by the export and the
// SSI converter. An element is a list of lines, indented by its parent, so
// the output is stable text that diffs well from one night to the next.
export type Xml = string[]

// XML 1.0 has no way to write most control characters, even escaped, so a
// pasted one would make the whole export unreadable. They are dropped.
// eslint-disable-next-line no-control-regex
const notXml = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

export const escape = (text: string) =>
  text
    .replace(notXml, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    // A bare carriage return would be read back as a newline.
    .replaceAll("\r", "&#13;")

export function element(name: string, children: (Xml | null)[], attrs = "") {
  const inner = children.filter((child) => child != null).flat()
  if (!inner.length) return [`<${name}${attrs}/>`]
  return [
    `<${name}${attrs}>`,
    ...inner.map((line) => `  ${line}`),
    `</${name}>`,
  ]
}

export function leaf(name: string, value: string | number | null | undefined) {
  return value == null ? null : [`<${name}>${escape(String(value))}</${name}>`]
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
