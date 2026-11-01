import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { DOMParser, XMLSerializer } from "@xmldom/xmldom"

import { shylogNamespace } from "../src/uddf/shylog-namespace.ts"

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
  const run = spawnSync(
    "xmllint",
    ["--noout", "--nonet", "--schema", schema, "-"],
    {
      input: new XMLSerializer().serializeToString(doc),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  )
  if ((run.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT")
    throw new Error("Validating UDDF needs xmllint (apt install libxml2-utils)")
  // Such as an output bigger than maxBuffer, or a kill.
  if (run.error) throw run.error
  // 0 is valid and 3 invalid; anything else is a broken schema or file.
  if (run.status !== 0 && run.status !== 3)
    throw new Error(`xmllint exited ${run.status}: ${run.stderr}`)
  return (
    run.stderr
      .split("\n")
      .filter((line) => line.includes("validity error"))
      // tankpressurebegin is tankdata's only required child.
      .filter((line) => !line.includes("}tankdata': Missing child element(s)"))
      .map((line) => line.replace(/^-:\d+: element /, ""))
  )
}
