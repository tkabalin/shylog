import { useLayoutEffect, useRef, type CSSProperties } from "react"
import { cn } from "cn"

import { publicSite } from "./host"
import { mpaRules, type Mpa, type Swatch } from "./zone-rules"

// Each swatch as the map draws its zone, square-cornered: hatching over a
// tint where no one may dive, the tint alone where only a dive business
// may, an orange dashed edge for the abalone area, a no-take zone's edge.
const warn = (share: number) =>
  `color-mix(in oklab, var(--color-warn) ${share}%, transparent)`
const swatches: Record<Swatch, CSSProperties> = {
  "no-dive": {
    border: `1.5px solid ${warn(75)}`,
    background: `repeating-linear-gradient(135deg, ${warn(30)} 0 1.5px, transparent 1.5px 6px), ${warn(14)}`,
  },
  business: { background: warn(14) },
  "no-snorkel": { border: "1.5px dashed var(--color-warn)" },
  "no-take": {
    border: "1.4px solid var(--no-take-edge)",
    background: "var(--no-take-sea)",
  },
}

// Each marine protected area's rules, under a heading for each zone and one
// for the whole area, bulleted with the notice each comes from, opened at
// one area from a site's zone row.
export function ZoneRulesList({
  mpa,
  desk = false,
}: {
  mpa?: Mpa
  desk?: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const sections = useRef(new Map<Mpa, HTMLElement>())
  // Opened at the area's heading.
  useLayoutEffect(() => {
    const root = scroller.current
    const section = mpa && sections.current.get(mpa)
    if (!root) return
    root.scrollTo({
      top: section
        ? section.getBoundingClientRect().top -
          root.getBoundingClientRect().top +
          root.scrollTop
        : 0,
    })
  }, [mpa])
  return (
    // No data-scroll-top: the router's reset after the navigation that
    // opened it would put it back at the top, off the area it opened at.
    <div
      ref={scroller}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain",
        desk
          ? "[scrollbar-width:thin] px-5 pb-5"
          : // Clear of the home indicator on the public site, with no tab bar.
            publicSite
            ? "px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            : "px-4 pb-6"
      )}
    >
      {mpaRules.map(({ id, mpa: name, groups, note }) => (
        <section
          key={id}
          ref={(element) => {
            if (element) sections.current.set(id, element)
          }}
          aria-labelledby={`rules-${id}`}
          className="border-b py-3.5 last:border-b-0"
        >
          <h2
            id={`rules-${id}`}
            className="mb-3 text-[15px] font-semibold tracking-[-0.01em]"
          >
            {name}
          </h2>
          {groups.map(({ heading, where, rules }) => (
            <div key={heading ?? "rules"} className="mt-5 first-of-type:mt-0">
              {heading && (
                <div className="mb-2">
                  <h3 className="text-[13px] font-semibold text-muted-foreground">
                    {heading}
                  </h3>
                  {where && (
                    <p className="text-xs text-muted-foreground">{where}</p>
                  )}
                </div>
              )}
              <ul className="flex flex-col gap-2.5">
                {rules.map((rule) => (
                  <li
                    key={rule.text}
                    className={cn(
                      "flex gap-2.5",
                      desk ? "text-[13px] leading-[19px]" : "text-sm leading-5"
                    )}
                  >
                    {rule.swatch ? (
                      <span
                        aria-hidden
                        className="mt-px size-4.25 shrink-0"
                        style={swatches[rule.swatch]}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className={cn(
                          "mx-1.5 size-1.25 shrink-0 rounded-full bg-muted-foreground",
                          desk ? "mt-[7px]" : "mt-2"
                        )}
                      />
                    )}
                    <span className="min-w-0">
                      {rule.text}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {rule.source}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {note && (
            <p className="mt-2.5 text-xs text-muted-foreground">{note}</p>
          )}
        </section>
      ))}
    </div>
  )
}
