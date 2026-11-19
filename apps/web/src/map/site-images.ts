import creditsUrl from "./image-credits.json?url"
import { imageUrls } from "./image-urls"
import listUrl from "./images.json?url"
import { fetchJson, loadOnce, useJsonFile } from "./json-file"
import { pages } from "./sites"

// The site maps, sonar images, aerial photos and wrecks' plans each site's
// page shows, from Wikimedia Commons: scripts/map/sites.ts lists them and
// scripts/map/images.ts downloads them and writes who made each. The lists
// are files of their own, kept by the service worker, as they would make
// the map's chunk a tenth bigger.

export type ImageKind = "map" | "sonar" | "aerial" | "plan"

export type SiteImage = {
  key: string
  kind: ImageKind
  // Wikivoyage's caption, as plain words.
  caption: string
  author: string
  licence: string
  licenceUrl?: string
  // The file's page on Commons.
  page: string
  width: number
  height: number
  src: string
  thumb: string
}

type List = {
  sites: Record<string, string[]>
  files: Record<string, { kind: ImageKind; caption: string }>
}
type Credit = Omit<SiteImage, "kind" | "caption" | "src" | "thumb">

// A whole page's images, from its sites' lists: those every one of them has
// (the page's own maps) first, then each site's own, once each.
export function pageImages(lists: readonly (readonly string[])[]) {
  const shared = (lists[0] ?? []).filter((name) =>
    lists.every((list) => list.includes(name))
  )
  return [...new Set([...shared, ...lists.flat()])]
}

const imagesFile = loadOnce(() =>
  Promise.all([
    fetchJson<List>(listUrl),
    fetchJson<Record<string, Credit>>(creditsUrl),
  ]).then(([list, credits]) => {
    const byFile = new Map<string, SiteImage>()
    for (const [file, listed] of Object.entries(list.files)) {
      const credit = credits[file]
      const src = credit && imageUrls[credit.key]
      const thumb = credit && imageUrls[`${credit.key}-thumb`]
      // One Commons no longer has isn't shown.
      if (!src || !thumb) continue
      byFile.set(file, { ...listed, ...credit, src, thumb })
    }
    const files = (names: readonly string[]) =>
      names.flatMap((name) => byFile.get(name) ?? [])
    return new Map([
      ...Object.entries(list.sites).map(
        ([id, names]) => [id, files(names)] as const
      ),
      ...pages.map(
        (page) =>
          [
            page.id,
            files(pageImages(page.sites.map(({ id }) => list.sites[id] ?? []))),
          ] as const
      ),
    ])
  })
)

const none: SiteImage[] = []

// A site's or a whole page's images, undefined until the lists have come.
export function useSiteImages(id: string) {
  const { loaded } = useJsonFile(imagesFile, id)
  return loaded && (loaded.get(id) ?? none)
}
