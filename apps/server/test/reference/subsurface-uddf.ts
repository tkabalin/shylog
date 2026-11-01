import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { DOMParser, type Document, type Element } from "@xmldom/xmldom"

const parse = (xml: string) => new DOMParser().parseFromString(xml, "text/xml")

// A real export takes a second or more through xsltproc, so a test file
// reads each input once. Callers only read the document they get back.
const reads = new Map<string, Document>()

// Subsurface reads UDDF in two steps (test_xslt_transforms in parse-xml.cpp):
// strip the versioned UDDF namespace, then run xslt/uddf.xslt with libxslt.
// The result is its native XML, so what's missing here is missing in Subsurface.
export function readAsSubsurface(uddf: string) {
  let read = reads.get(uddf)
  if (!read) reads.set(uddf, (read = transform(uddf)))
  return read
}

function transform(uddf: string) {
  // It picks uddf.xslt by the root's name, and skips any stylesheet when
  // the first child has name="subsurface", so check both rather than assume.
  const root = parse(uddf).documentElement
  if (!root) throw new Error("Not an XML document")
  if (root.localName?.toLowerCase() !== "uddf")
    throw new Error(`Subsurface wouldn't read <${root?.localName}> as UDDF`)
  const first = Array.from(root.childNodes).find(
    (n) => n.nodeType === n.ELEMENT_NODE
  )
  if (
    (first as Element | undefined)?.getAttribute("name")?.toLowerCase() ===
    "subsurface"
  )
    throw new Error("Subsurface would read this as its own XML, not UDDF")
  return parse(xsltproc("uddf.xslt", stripUddfNamespace(uddf)))
}

export const stripUddfNamespace = (uddf: string) =>
  xsltproc("strip-uddf-namespace.xsl", uddf)

function xsltproc(stylesheet: string, input: string) {
  const path = fileURLToPath(new URL(stylesheet, import.meta.url))
  try {
    // Subsurface parses with XML_PARSE_HUGE and loads no DTD or network
    // resource; xsltproc's defaults would load both.
    return execFileSync(
      "xsltproc",
      ["--huge", "--nonet", "--novalid", path, "-"],
      { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    throw new Error(
      "Reading UDDF as Subsurface does needs xsltproc (apt install xsltproc)",
      { cause: error }
    )
  }
}
