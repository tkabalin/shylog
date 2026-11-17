// Every site image's address, by its key (`a-frame-site-map`, and
// `a-frame-site-map-thumb` for its thumbnail), named by its contents like
// the app's other assets; the service worker's route matches the files'
// `site-` prefix. Apart, so the download at launch needs only these.
const found = import.meta.glob<string>("./images/site-*.webp", {
  query: "?url",
  import: "default",
  eager: true,
})

export const imageUrls: Record<string, string> = Object.fromEntries(
  Object.entries(found).map(([path, url]) => [
    path.slice("./images/site-".length, -".webp".length),
    url,
  ])
)
