import { execFileSync } from "node:child_process"
import { mkdirSync, renameSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"

// Cuts the Cape Peninsula and False Bay out of a Protomaps daily
// OpenStreetMap build into the PMTiles file the map draws its land, roads
// and place names from. Needs the `pmtiles` command from go-pmtiles
// (github.com/protomaps/go-pmtiles/releases; 1.31.2 cut the committed one).
// Run `pnpm --filter @shylog/web map:basemap [build]`, where build is a key
// such as 20261116.pmtiles; the newest build otherwise.

const output = join(import.meta.dirname, "../../src/map/basemap.pmtiles")

// Wide enough for every site and zone with room to pan: Table Bay to
// Hangklip and out to the offshore wrecks.
const bbox = [17.9, -34.75, 19.3, -33.3]
// 10 MB. Zoom 14 doubles it and 15 is 46 MB, while the coast is already
// drawn to within a couple of metres here, and MapLibre zooms in past it.
const maxzoom = 13

// Builds are kept for about two months.
const response = await fetch("https://build-metadata.protomaps.dev/builds.json")
if (!response.ok) throw new Error(`${response.status} listing Protomaps builds`)
const builds = (await response.json()) as { key: string; version: string }[]
const wanted = process.argv[2]
const build = wanted
  ? builds.find(({ key }) => key === wanted)
  : // Keys are dates, so the newest sorts last whatever the list's order.
    builds.toSorted((a, b) => a.key.localeCompare(b.key)).at(-1)
if (!build) throw new Error(`Protomaps lists no build ${wanted ?? ""}`)
// The style names version 4's layers; another major draws nothing.
if (!build.version.startsWith("4.")) {
  throw new Error(`${build.key} is basemap schema ${build.version}, not 4`)
}

// Into a scratch file first, so a failed download leaves the committed one.
const scratch = `${output}.partial`
mkdirSync(dirname(output), { recursive: true })
try {
  execFileSync(
    "pmtiles",
    [
      "extract",
      `https://build.protomaps.com/${build.key}`,
      scratch,
      `--bbox=${bbox.join(",")}`,
      `--maxzoom=${maxzoom}`,
    ],
    { stdio: "inherit" }
  )
  renameSync(scratch, output)
} finally {
  rmSync(scratch, { force: true })
}
console.log(
  `Wrote ${output} from ${build.key} (basemap schema ${build.version})`
)
