import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import { format, resolveConfig } from "prettier"
import sharp from "sharp"

import { decode, slug } from "./wikitext.ts"

// Writes src/map/images/site-*.webp, the site maps, sonar images, aerial
// photos and wrecks' plans the dive sites' pages show, from Wikimedia
// Commons, and src/map/image-credits.json, who made each and its licence. Run
// `pnpm --filter @shylog/web map:sites` first: it lists them, in
// src/map/images.json. Each file's Commons version is pinned by its hash,
// so a rerun downloads only what is new or has changed there.

const api = "https://commons.wikimedia.org/w/api.php"
// Wikimedia asks a script to say where to reach whoever runs it, and
// throttles one that doesn't to a file every few minutes.
const agent = "shylog-map-refresh/1.0 (https://github.com/tkabalin/shylog)"
const listPath = join(import.meta.dirname, "../../src/map/images.json")
const creditsPath = join(
  import.meta.dirname,
  "../../src/map/image-credits.json"
)
const outDir = join(import.meta.dirname, "../../src/map/images")

// 3840 px on the long side leaves the depth labels room to be pinched in
// about twice as far as 1920 px before they soften, and keeps the largest
// map near 9 megapixels, which iOS decodes whole. Quality 60 keeps the
// lot near the issue's 30 MB estimate.
const longest = 3840
const quality = 60
// Commons has some only small, which every screen stretches, so there
// smoothing would show: up to 1500 px they keep more detail and colour,
// at about two and a half times the bytes.
const small = 1500
const smallQuality = 90
// The sheet's strip shows thumbnails 112 px tall, so 3× for a phone.
const thumbHeight = 336
const thumbQuality = 55

export type Credit = {
  key: string
  author: string
  licence: string
  licenceUrl?: string
  // The file's page on Commons, which the viewer links.
  page: string
  width: number
  height: number
  sha1: string
  // What it was encoded at, so a change to the setting encodes it again.
  quality: number
}

type Info = {
  title: string
  missing?: true
  imageinfo?: {
    width: number
    height: number
    url: string
    descriptionurl: string
    sha1: string
    mime: string
    extmetadata?: Record<string, { value: string } | undefined>
  }[]
}

const { files } = JSON.parse(readFileSync(listPath, "utf8")) as {
  files: Record<string, unknown>
}
const credits: Record<string, Credit> = existsSync(creditsPath)
  ? (JSON.parse(readFileSync(creditsPath, "utf8")) as Record<string, Credit>)
  : {}

// Each file's size, hash and credit, up to 50 at a time. maxlag asks to be
// turned away while Commons' databases are busy, and then it waits.
async function info(names: string[]): Promise<{ name: string; page: Info }[]> {
  const response = await fetch(api, {
    method: "POST",
    headers: { "User-Agent": agent },
    body: new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      maxlag: "5",
      prop: "imageinfo",
      iiprop: "url|size|sha1|mime|extmetadata",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
      titles: names.map((name) => `File:${name}`).join("|"),
      // A file renamed on Commons, which Wikivoyage still names the old way.
      redirects: "1",
    }),
  })
  if (!response.ok) throw new Error(`${response.status} from Commons`)
  const answer = (await response.json()) as {
    error?: { code?: string }
    continue?: unknown
    query: {
      normalized?: { from: string; to: string }[]
      redirects?: { from: string; to: string }[]
      pages: Info[]
    }
  }
  if (answer.error?.code === "maxlag") {
    await wait(Number(response.headers.get("retry-after") || 5) * 1000)
    return info(names)
  }
  if (answer.error) throw new Error(JSON.stringify(answer.error))
  // A batch cut short would look like files Commons doesn't have.
  if (answer.continue) throw new Error("Commons cut a batch short")
  // Back from Commons' title to the name the pages give, through a
  // redirect and Commons' own spelling of it.
  const back = (pairs?: { from: string; to: string }[]) =>
    new Map(pairs?.map(({ from, to }) => [to, from]))
  const redirected = back(answer.query.redirects)
  const normalized = back(answer.query.normalized)
  return answer.query.pages.map((page) => {
    const title = redirected.get(page.title) ?? page.title
    const name = normalized.get(title) ?? title
    return { name: name.replace(/^File:/, ""), page }
  })
}

// Artist is HTML: a link to the uploader's page, sometimes a signature.
const plainText = (html = "") =>
  decode(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim()

// Commons turns away a script that downloads originals, and serves its
// thumbnails only at a few widths, so each picture comes at the smallest of
// them that holds it at full size (capped at 3840 px) and is scaled to that.
// A PDF's page and an SVG render at the cap.
const widths = [500, 960, 1280, 1920, 3840]

function target(image: NonNullable<Info["imageinfo"]>[number]) {
  const drawn = /^image\/svg|^application\/pdf/.test(image.mime)
  const scale = drawn
    ? longest / Math.max(image.width, image.height)
    : Math.min(1, longest / Math.max(image.width, image.height))
  return {
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
  }
}

// The width to ask for, then the smaller ones down to 960 px, as Commons
// can fail to render a very large original (a 32-megapixel sonar image)
// at 3840 or 1920 px, a 503 and then a 429 each time.
function sources(image: NonNullable<Info["imageinfo"]>[number]) {
  const { width } = target(image)
  const first = widths.find((each) => each >= width) ?? longest
  const steps = widths
    .filter((each) => each === first || (each < first && each >= 960))
    .reverse()
  const original = image.url.split("?")[0]
  const [, dir, name] = /\/commons\/(\w\/\w\w\/)([^/]+)$/.exec(original)!
  const page = image.mime === "application/pdf" ? "page1-" : ""
  const as = /^image\/svg/.test(image.mime)
    ? ".png"
    : image.mime === "application/pdf"
      ? ".jpg"
      : ""
  return steps.map(
    (each) =>
      `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir}${name}/${page}${each}px-${name}${as}`
  )
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// One file at a time with a pause between, as Commons' media servers turn
// a faster client away, and as long as they ask when they do. A dropped
// connection or a server error is tried twice more; then, or on any other
// refusal, the next smaller width.
async function download(urls: string[]): Promise<Buffer> {
  const [url, ...smaller] = urls
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": agent },
    }).catch(() => undefined)
    if (response?.ok) {
      const body = Buffer.from(await response.arrayBuffer())
      await wait(5000)
      return body
    }
    const status = response?.status
    const after = Number(response?.headers.get("retry-after"))
    console.warn(`${status ?? "No answer"} for ${url}, retry after ${after}`)
    if (status === 429 && after > 0 && attempt < 8) {
      await wait(after * 1000)
      continue
    }
    if ((!response || status! >= 500) && attempt < 2) {
      await wait(30_000)
      continue
    }
    if (smaller.length) return download(smaller)
    throw new Error(`${status ?? "No answer"} for ${url}`)
  }
}

// A key from the file's name, unique across the set, for the file names
// the build hashes; a key already given keeps it across refreshes.
const taken = new Set(Object.values(credits).map((credit) => credit.key))
function keyFor(name: string) {
  const known = credits[name]?.key
  if (known) return known
  // Never ending -thumb, which marks a thumbnail.
  const base = (
    slug(name.replace(/\.\w+$/, "")).slice(0, 60) || "image"
  ).replace(/-thumb$/, "-thumb-image")
  let key = base
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`
  taken.add(key)
  return key
}

async function save(credits: Record<string, Credit>) {
  writeFileSync(
    creditsPath,
    await format(JSON.stringify(credits), {
      ...(await resolveConfig(creditsPath)),
      filepath: creditsPath,
    })
  )
}

mkdirSync(outDir, { recursive: true })
const names = Object.keys(files)
const kept: Record<string, Credit> = {}
const missing: string[] = []
const failed: string[] = []
let fetched = 0
for (let i = 0; i < names.length; i += 50) {
  for (const { name, page } of await info(names.slice(i, i + 50))) {
    const image = page.imageinfo?.[0]
    if (page.missing || !image) {
      missing.push(name)
      continue
    }
    const key = keyFor(name)
    const full = join(outDir, `site-${key}.webp`)
    const thumb = join(outDir, `site-${key}-thumb.webp`)
    const was = credits[name]
    const meta = image.extmetadata ?? {}
    let { width, height } = was ?? { width: 0, height: 0 }
    const size = target(image)
    const encoding =
      Math.max(size.width, size.height) <= small ? smallQuality : quality
    let downloaded = false
    if (
      was?.sha1 !== image.sha1 ||
      was?.quality !== encoding ||
      !existsSync(full) ||
      !existsSync(thumb)
    ) {
      const body = await download(sources(image)).catch((error: unknown) => {
        console.warn(`${name}: ${String(error)}`)
      })
      // Commons can fail to render a very large original for an hour or
      // more: an earlier version stays, or it's left out until a later
      // run gets it.
      if (!body) {
        if (was && existsSync(full) && existsSync(thumb)) kept[name] = was
        failed.push(name)
        continue
      }
      const picture = sharp(body)
      const written = await picture
        .clone()
        .resize(size.width, size.height, { fit: "inside" })
        .webp({ quality: encoding, smartSubsample: encoding !== quality })
        .toFile(full)
      ;({ width, height } = written)
      await picture
        .clone()
        .resize({ height: thumbHeight, withoutEnlargement: true })
        .webp({ quality: thumbQuality })
        .toFile(thumb)
      fetched++
      downloaded = true
      console.log(`${fetched}: ${name}`)
    }
    kept[name] = {
      key,
      author: plainText(meta.Artist?.value) || "Unknown",
      licence: plainText(meta.LicenseShortName?.value) || "See Commons",
      // Shown as a link, so only a web address.
      licenceUrl: /^https:\/\//.test(meta.LicenseUrl?.value ?? "")
        ? meta.LicenseUrl?.value
        : undefined,
      page: image.descriptionurl,
      width,
      height,
      sha1: image.sha1,
      quality: encoding,
    }
    // After each download, so a run stopped part way keeps what it has,
    // and the next downloads only the rest.
    if (downloaded) await save({ ...credits, ...kept })
  }
}

// Only the files the pages still show, and only their images.
await save(kept)
const keys = new Set(Object.values(kept).map((credit) => credit.key))
for (const file of readdirSync(outDir)) {
  const key = file.replace(/^site-/, "").replace(/(-thumb)?\.webp$/, "")
  if (!keys.has(key)) unlinkSync(join(outDir, file))
}
console.log(
  `${Object.keys(kept).length} of ${names.length} images kept, ` +
    `${fetched} downloaded` +
    (missing.length ? `; not on Commons: ${missing.join(", ")}` : "") +
    (failed.length ? `; failed, run again: ${failed.join(", ")}` : "")
)
