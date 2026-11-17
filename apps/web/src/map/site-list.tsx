import { memo, useMemo } from "react"
import { cn } from "cn"

import { zoneNote } from "./filters"
import { areas, siteTypes, type Area, type Site } from "./sites"

// The sites grouped by area under sticky headings, each with its count. It
// is also the map's alternative for screen readers. Memoised, as the desktop
// re-renders Explore for each row the mouse passes over.
export const SiteList = memo(function SiteList({
  sites,
  query,
  picked,
  desk = false,
  onPick,
  onHover,
}: {
  sites: readonly Site[]
  // What was searched for, which the empty list names.
  query: string
  picked?: string
  desk?: boolean
  onPick: (id: string) => void
  // The row under the mouse or the keyboard's focus, whose pin the map rings.
  onHover?: (id: string | undefined) => void
}) {
  const groups = useMemo(() => {
    const byArea = new Map<Area, Site[]>()
    for (const site of sites) {
      const group = byArea.get(site.area)
      if (group) group.push(site)
      else byArea.set(site.area, [site])
    }
    return (Object.keys(areas) as Area[])
      .filter((area) => byArea.has(area))
      .map((area) => ({
        area,
        sites: byArea.get(area)!.sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }, [sites])
  if (!groups.length) {
    return (
      <p
        className={cn(
          "mx-4 my-8 text-center text-muted-foreground",
          desk ? "mx-5 text-[13px]" : "text-sm"
        )}
      >
        {query.trim()
          ? `No sites match “${query.trim()}”.`
          : "No sites match these filters."}
      </p>
    )
  }
  return (
    <div onMouseLeave={() => onHover?.(undefined)}>
      {groups.map(({ area, sites: inArea }) => (
        <section key={area} aria-labelledby={`area-${area}`}>
          <h2
            id={`area-${area}`}
            className={cn(
              "sticky top-0 z-10 flex justify-between font-medium text-muted-foreground tabular-nums",
              desk
                ? "bg-popover px-5 pt-3 pb-1.5 text-xs"
                : "bg-background px-4 pt-2.5 pb-1.5 text-[13px]"
            )}
          >
            <span>{areas[area]}</span>
            <span aria-hidden>{inArea.length}</span>
          </h2>
          <ul>
            {inArea.map((site) => (
              <li key={site.id}>
                <Row
                  site={site}
                  desk={desk}
                  picked={site.id === picked}
                  onPick={onPick}
                  onHover={onHover}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
})

// The site's shape, its name, and what sets it apart: its type where it
// isn't a reef (most are), its depth, and who may dive there.
function Row({
  site,
  desk,
  picked,
  onPick,
  onHover,
}: {
  site: Site
  desk: boolean
  picked: boolean
  onPick: (id: string) => void
  onHover?: (id: string | undefined) => void
}) {
  const note = zoneNote(site)
  const parts = [
    // Not under the Fresh water heading, which already says so.
    site.type !== "reef" && site.area !== "fresh" && siteTypes[site.type],
    site.depth !== undefined &&
      `${site.approximate ? "≈ " : ""}${site.depth} m`,
  ].filter(Boolean)
  return (
    <button
      type="button"
      aria-current={picked || undefined}
      onClick={() => onPick(site.id)}
      // On a move too, as a row the search puts under a resting cursor
      // gets no enter.
      onMouseEnter={() => onHover?.(site.id)}
      onMouseMove={() => onHover?.(site.id)}
      onFocus={() => onHover?.(site.id)}
      onBlur={() => onHover?.(undefined)}
      // The separator is the text's bottom edge, which is the row's, so a
      // pressed row's grey runs exactly from one line to the next.
      className={cn(
        "grid w-full grid-cols-[20px_minmax(0,1fr)] items-stretch gap-x-3 text-left transition-colors duration-150 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset aria-current:bg-muted data-press:bg-muted data-press:duration-0",
        desk ? "grid-cols-[16px_minmax(0,1fr)] px-5" : "px-4"
      )}
    >
      <Shape type={site.type} className={desk ? "size-2.5" : "size-3"} />
      <span
        className={cn(
          "flex min-w-0 flex-col justify-center gap-px border-b [li:last-child_&]:border-b-0",
          desk ? "min-h-12 py-1.5" : "min-h-14 py-2"
        )}
      >
        <span className={cn("truncate", desk ? "text-sm" : "text-[15px]")}>
          {site.name}
        </span>
        {(parts.length > 0 || note) && (
          <span
            className={cn(
              "truncate text-muted-foreground tabular-nums",
              desk ? "text-xs" : "text-[13px]"
            )}
          >
            {parts.join(" · ")}
            {note && (
              <>
                {parts.length > 0 && " · "}
                <span className={cn(note.warn && "text-warn")}>
                  {note.text}
                </span>
              </>
            )}
          </span>
        )}
      </span>
    </button>
  )
}

// A dot for a reef or fresh water and a diamond for a wreck, as the pins.
function Shape({ type, className }: { type: Site["type"]; className: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("place-self-center fill-muted-foreground", className)}
    >
      {type === "wreck" ? (
        <path d="M6 0.8l5.2 5.2l-5.2 5.2l-5.2 -5.2z" />
      ) : (
        <circle cx="6" cy="6" r="4.2" />
      )}
    </svg>
  )
}
