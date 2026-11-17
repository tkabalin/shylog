import { createContext, memo, useContext, useEffect, useState } from "react"
import { IconChevronDown, IconWifiOff } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import Markdown, { type MarkdownToJSX } from "markdown-to-jsx/react"
import { cn } from "cn"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { siteText, type Part } from "./page-text"
import pagesUrl from "./pages.json?url"
import { withSite } from "./search"
import { wikivoyage, type Site } from "./sites"

// The pages' text, 1.6 MB, a file the service worker keeps with the app,
// fetched as the map's code runs so it's in hand when a sheet opens. A
// failed fetch (a first visit with no signal) is tried again for the next
// site, or as soon as the signal is back.
type Pages = Record<string, Part[]>
let pages: Pages | undefined
let loading: Promise<Pages> | undefined
const load = () =>
  (loading ??= fetch(pagesUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`${pagesUrl}: ${response.status}`)
      return response.json() as Promise<Pages>
    })
    .then((all) => (pages = all))
    .catch((error: unknown) => {
      loading = undefined
      throw error
    }))
void load().catch(() => {})

function usePages(site: string) {
  const [loaded, setLoaded] = useState(pages)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (loaded) return
    let live = true
    const attempt = () =>
      load().then(
        (all) => live && setLoaded(all),
        () => live && setFailed(true)
      )
    void attempt()
    window.addEventListener("online", attempt)
    return () => {
      live = false
      window.removeEventListener("online", attempt)
    }
  }, [loaded, site])
  return { loaded, failed }
}

// Lines in the text's place until it comes, or the offline icon if it
// can't, so a sheet raised early doesn't look as if it has nothing to say.
function Waiting({
  failed,
  className,
}: {
  failed: boolean
  className?: string
}) {
  if (failed) {
    return (
      <div
        className={cn("flex justify-center text-muted-foreground", className)}
      >
        <IconWifiOff role="img" aria-label="Offline" className="size-5" />
      </div>
    )
  }
  return (
    <div aria-busy="true" className={cn("flex flex-col gap-3", className)}>
      {["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"].map((size, i) => (
        <Skeleton key={i} className={cn("h-3.5", size)} />
      ))}
    </div>
  )
}

// The site whose sheet this is, so a link to it reads as plain words, and
// what the sheet does as a link opens another, so it can come back.
const Showing = createContext<{ id?: string; onFollow?: (id: string) => void }>(
  {}
)

// A link to another dive site opens it, in place of this one.
function SiteLink({
  href,
  children,
}: {
  href?: string
  children?: React.ReactNode
}) {
  const showing = useContext(Showing)
  const id = href?.startsWith("site:") ? href.slice(5) : undefined
  if (!id || id === showing.id) return <>{children}</>
  // A short name stays on one line ("D-Frame" never breaks at its hyphen),
  // and the link's padding, which moves nothing, makes it easier to tap.
  const words = [children].flat().filter((each) => typeof each === "string")
  return (
    <Link
      to="/explore"
      search={withSite(id)}
      replace
      onClick={() => showing.onFollow?.(id)}
      className={cn(
        "rounded-[3px] box-decoration-clone py-1 font-medium text-primary underline-offset-2 hover:underline data-press:bg-primary/10 data-press:duration-0",
        words.join("").length <= 20 && "whitespace-nowrap"
      )}
    >
      {children}
    </Link>
  )
}

// Wikivoyage's sections sit under the sheet's own heading, the site's name,
// so each heading steps down a level. Raw HTML and images are never drawn,
// so a page can't make the sheet fetch from elsewhere.
const options: MarkdownToJSX.Options = {
  disableParsingRawHTML: true,
  disableAutoLink: true,
  forceBlock: true,
  wrapper: null,
  overrides: {
    h1: { component: "h3" },
    h2: { component: "h3" },
    h3: { component: "h4" },
    h4: { component: "h5" },
    a: SiteLink,
    img: () => null,
    table: Table,
    thead: TableHeader,
    tbody: TableBody,
    tr: TableRow,
    th: TableHead,
    td: TableCell,
  },
}

const headingOptions: MarkdownToJSX.Options = {
  ...options,
  forceBlock: false,
  forceInline: true,
}

// The sections opened on each site this session, so coming back to one
// finds it as it was left.
const opened = new Map<string, Set<string>>()

// The page's own sections fold, so a long page (Whittle Rock's runs to 40
// screens) reads as a list of what it covers. Its opening words stay out.
function Sections({ id, markdown }: { id: string; markdown: string }) {
  const [lead, ...sections] = markdown.split(/^(?=## )/m)
  const all = lead.startsWith("## ") ? [lead, ...sections] : sections
  const [open, setOpen] = useState(() => opened.get(id) ?? new Set<string>())
  const toggle = (heading: string, now: boolean) => {
    const next = new Set(open)
    if (now) next.add(heading)
    else next.delete(heading)
    opened.set(id, next)
    setOpen(next)
  }
  return (
    <>
      {!lead.startsWith("## ") && lead.trim() && (
        <Markdown options={options}>{lead}</Markdown>
      )}
      {all.length > 0 && (
        <div className="mt-4 border-b">
          {all.map((section) => {
            const [line, ...body] = section.split("\n")
            const heading = line.slice(3).trim()
            return (
              <Collapsible
                key={heading}
                open={open.has(heading)}
                onOpenChange={(now) => toggle(heading, now)}
                className="border-t"
              >
                <h3 className="mt-0!">
                  <CollapsibleTrigger className="group/section flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left transition-opacity duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-press:opacity-50 data-press:duration-0 desk:min-h-10">
                    <span>
                      <Markdown options={headingOptions}>{heading}</Markdown>
                    </span>
                    <IconChevronDown className="size-4.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-panel-open/section:rotate-180 motion-reduce:transition-none" />
                  </CollapsibleTrigger>
                </h3>
                <CollapsibleContent className="pb-5 *:first:mt-0">
                  <Markdown options={options}>{body.join("\n")}</Markdown>
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </div>
      )}
    </>
  )
}

// Memoised, as parsing a long page is slow and the card re-renders on
// every move of a drag on its edge.
export const SiteText = memo(function SiteText({
  site,
  className,
  onFollow,
  end,
}: {
  site: Site
  className?: string
  // A link in the text opens another site.
  onFollow?: (id: string) => void
  // The phone's Read on Wikivoyage, after the text.
  end?: React.ReactNode
}) {
  const { loaded, failed } = usePages(site.id)
  if (!site.page) return null
  if (!loaded) return <Waiting failed={failed} className={className} />
  const parts = loaded[site.page]
  if (!parts) return null
  const { own, rest } = siteText(parts, site.id)
  return (
    <Showing.Provider value={{ id: site.id, onFollow }}>
      <div
        className={cn(
          "text-[15px] leading-[21px] desk:text-sm",
          "[&_h3]:mt-6 [&_h3]:text-[17px] [&_h3]:leading-6 [&_h3]:font-semibold [&_h3]:tracking-tight",
          "[&_h4]:mt-5 [&_h4]:font-semibold [&_h5]:mt-4 [&_h5]:font-medium",
          "[&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2.5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5",
          // Read-only tables, so cells wrap and rows don't tint on hover.
          "[&_[data-slot=table-container]]:mt-3 [&_td]:py-1.5 [&_td]:align-top [&_td]:whitespace-normal [&_th]:h-auto [&_th]:py-2 [&_th]:whitespace-normal [&_tr]:hover:bg-transparent",
          "*:first:mt-0",
          className
        )}
      >
        {own && <Markdown options={options}>{own}</Markdown>}
        {/* A section's own words first, then the page it's part of, under
            its name set apart from the page's own headings. */}
        {own && (
          <h3 className="mt-8! border-t pt-6 text-xl! leading-7!">
            {site.page}
          </h3>
        )}
        <Sections key={site.id} id={site.id} markdown={rest} />
        {end}
        {/* The licence asks for the credit, and to say it was changed. */}
        <p className="mt-8! text-xs text-muted-foreground">
          Text from{" "}
          <a
            href={wikivoyage(site)}
            target="_blank"
            rel="noopener"
            className="underline underline-offset-2"
          >
            Wikivoyage
          </a>{" "}
          by its contributors, under{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener"
            className="underline underline-offset-2"
          >
            CC BY-SA 4.0
          </a>
          , adapted.
        </p>
      </div>
    </Showing.Provider>
  )
})
