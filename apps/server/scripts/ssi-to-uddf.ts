import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { convertSsi } from "./ssi/convert.ts"

// One-off: `pnpm --filter @shylog/server ssi-to-uddf <ssi.csv> <extras.json>
// <out.uddf>` converts the MySSI logbook CSV for the import. The extras
// file (see `extrasSchema`) holds site regions, people to leave out and
// per-dive fixes; all three files are personal and stay out of the repo.
const [csv, extras, out] = process.argv
  .slice(2)
  // pnpm runs this from apps/server; INIT_CWD is where it was typed.
  .map((path) => resolve(process.env.INIT_CWD ?? process.cwd(), path))
if (!csv || !extras || !out)
  throw new Error("Usage: ssi-to-uddf <ssi.csv> <extras.json> <out.uddf>")

const result = convertSsi(
  readFileSync(csv, "utf8"),
  JSON.parse(readFileSync(extras, "utf8"))
)
writeFileSync(out, result.xml)
console.log(
  `Wrote ${result.dives} dives to ${out}, leaving out ${result.freedives} freedives`
)
