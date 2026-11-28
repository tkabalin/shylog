import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import { FileSource, PMTiles } from "pmtiles"
import type { Plugin } from "vite"

import { areas } from "../src/map/areas.ts"

// The public site's build steps (vite.divesites.config.ts).

const virtualId = "virtual:basemap-tiles"

// The tile at a longitude and latitude at a zoom, as slippy maps number them.
const column = (lon: number, z: number) =>
  Math.floor(((lon + 180) / 360) * 2 ** z)
const row = (lat: number, z: number) => {
  const rad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  )
}

// The extract as a file per tile, unzipped (12.9 MB), as Cloudflare's files
// ignore the range requests pmtiles needs; under a folder named by its
// contents, so tiles are cached for good and a new extract moves.
export function basemapTiles(extract: string): Plugin {
  const opened = (async () => {
    const bytes = await readFile(extract)
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12)
    const archive = new PMTiles(
      new FileSource(new File([bytes], "basemap.pmtiles"))
    )
    return { hash, archive, header: await archive.getHeader() }
  })()
  return {
    name: "basemap-tiles",
    resolveId: (id) => (id === virtualId ? `\0${virtualId}` : undefined),
    async load(id) {
      if (id !== `\0${virtualId}`) return
      const { hash, header } = await opened
      return `export default ${JSON.stringify({
        path: `/tiles/${hash}/{z}/{x}/{y}.pbf`,
        bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
        minzoom: header.minZoom,
        maxzoom: header.maxZoom,
      })}`
    },
    // In development the tiles come straight from the extract.
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const at = request.url?.match(
          /^\/tiles\/\w+\/(\d+)\/(\d+)\/(\d+)\.pbf$/
        )
        if (!at) return next()
        opened
          .then(({ archive }) =>
            archive.getZxy(Number(at[1]), Number(at[2]), Number(at[3]))
          )
          .then((tile) => {
            if (!tile) response.statusCode = 404
            response.end(tile && new Uint8Array(tile.data))
          }, next)
      })
    },
    async writeBundle({ dir }) {
      const { hash, archive, header } = await opened
      let written = 0
      for (let z = header.minZoom; z <= header.maxZoom; z++)
        for (
          let x = column(header.minLon, z);
          x <= column(header.maxLon, z);
          x++
        )
          for (let y = row(header.maxLat, z); y <= row(header.minLat, z); y++) {
            const tile = await archive.getZxy(z, x, y)
            if (!tile) continue
            const folder = join(dir!, "tiles", hash, `${z}`, `${x}`)
            await mkdir(folder, { recursive: true })
            await writeFile(join(folder, `${y}.pbf`), new Uint8Array(tile.data))
            written++
          }
      // Every tile the extract holds (0 is a count the archive left out), or
      // the map has holes where it had none.
      if (header.numAddressedTiles && written !== header.numAddressedTiles)
        this.error(
          `Unpacked ${written} basemap tiles of the extract's ${header.numAddressedTiles}`
        )
    },
  }
}

// Files read from the site's root: how long each may be cached, that search
// engines are welcome, and the picture a shared link shows (share-image.ts),
// at an address of its own, as the page names it whole.
export function hostFiles(share: string): Plugin {
  const headers = [
    // Named by their contents, so they never change at an address.
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "/tiles/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n")
  return {
    name: "host-files",
    apply: "build",
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: "_headers", source: headers })
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: "User-agent: *\nAllow: /\n",
      })
      this.emitFile({
        type: "asset",
        fileName: "og.png",
        source: await readFile(share),
      })
    },
  }
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")

// Every site's name as a link, by area as the list has them, kept in the page
// out of sight: the map draws its names, so search engines would see none.
// Outside #root, so React leaves it there; screen readers reach it last.
export function siteIndex(geojson: string): Plugin {
  return {
    name: "site-index",
    async transformIndexHtml() {
      const { features } = JSON.parse(await readFile(geojson, "utf8")) as {
        features: { properties: { id: string; name: string; area: string } }[]
      }
      const groups = Object.entries(areas).map(([area, title]) => {
        const links = features
          .map(({ properties }) => properties)
          .filter((site) => site.area === area)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(
            ({ id, name }) =>
              `<li><a href="/?site=${encodeURIComponent(id)}">${escape(name)}</a></li>`
          )
        return links.length
          ? `<h2>${escape(title)}</h2><ul>${links.join("")}</ul>`
          : ""
      })
      return [
        {
          tag: "nav",
          attrs: {
            "aria-label": "Every dive site",
            // Inline, as sr-only does it, so it's hidden before CSS loads;
            // at the top, as below the map it made the page a pixel taller.
            style:
              "position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap",
          },
          children: groups.join(""),
          injectTo: "body",
        },
      ]
    },
  }
}

// A hash of every file the site serves, and of wrangler.jsonc, which says how
// Cloudflare serves them, served as build.txt, so CI deploys only when the
// site would change, whatever the commit touched.
export function buildStamp(wrangler: string): Plugin {
  let outDir = ""
  return {
    name: "build-stamp",
    apply: "build",
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const files = (
        await readdir(outDir, { recursive: true, withFileTypes: true })
      )
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))
        .sort()
        .concat(wrangler)
      const stamp = createHash("sha256")
      for (const file of files) {
        const name = relative(outDir, file).split(sep).join("/")
        const contents = createHash("sha256").update(await readFile(file))
        stamp.update(`${name} ${contents.digest("hex")}\n`)
      }
      await writeFile(join(outDir, "build.txt"), `${stamp.digest("hex")}\n`)
    },
  }
}
