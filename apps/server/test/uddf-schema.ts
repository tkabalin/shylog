import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { DOMParser, XMLSerializer, type Element } from "@xmldom/xmldom"

import { shylogNamespace } from "../src/uddf/shylog-namespace.ts"
import { uddfNamespace } from "../src/uddf/writer.ts"

const schema = fileURLToPath(
  new URL("../../../fixtures/uddf/uddf_v321.xsd", import.meta.url)
)

// UDDF 3.2.1's complaints about a file, none when it's valid, less the two
// failures the spec accepts: <shylog>, which isn't a registered
// applicationdata child, and tankdata with no start pressure (see Testing).
export function uddfSchemaErrors(uddf: string) {
  const doc = new DOMParser().parseFromString(uddf, "text/xml")
  for (const own of Array.from(
    doc.getElementsByTagNameNS(shylogNamespace, "shylog")
  ))
    own.parentNode!.removeChild(own)
  // A stand-in start pressure, tankdata's one required child, where it's
  // missing, so the schema still checks the order of everything else.
  for (const tank of Array.from(
    doc.getElementsByTagNameNS(uddfNamespace, "tankdata")
  )) {
    const children = Array.from(tank.childNodes).filter(
      (node) => node.nodeType === node.ELEMENT_NODE
    ) as Element[]
    if (children.some((child) => child.localName === "tankpressurebegin"))
      continue
    const begin = doc.createElementNS(uddfNamespace, "tankpressurebegin")
    begin.textContent = "0"
    const after = children.find(
      (child) => child.localName !== "link" && child.localName !== "tankvolume"
    )
    tank.insertBefore(begin, after ?? null)
  }
  const run = xmllint(
    ["--noout", "--nonet", "--schema", schema, "-"],
    new XMLSerializer().serializeToString(doc)
  )
  // 0 is valid and 3 invalid; anything else is a broken schema or file.
  if (run.status !== 0 && run.status !== 3)
    throw new Error(`xmllint exited ${run.status}: ${run.stderr}`)
  return run.stderr
    .split("\n")
    .filter((line) => line.includes("validity error"))
    .map((line) => line.replace(/^-:\d+: element /, ""))
}

function xmllint(args: string[], input: string) {
  const run = spawnSync("xmllint", args, {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  if ((run.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT")
    throw new Error("Validating UDDF needs xmllint (apt install libxml2-utils)")
  // Such as an output bigger than maxBuffer, or a kill.
  if (run.error) throw run.error
  return run
}
