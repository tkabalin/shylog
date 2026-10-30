import { useEffect, useState, type ReactNode } from "react"
import { entityKinds, type Settings } from "@shylog/core"
import {
  IconAlertTriangle,
  IconCloudCheck,
  IconDatabase,
  IconFileTypeXml,
  IconServer,
  IconRefresh,
  IconServerOff,
  IconVersions,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"

import { apiClient } from "@/api/client"
import { useTheme } from "@/components/theme-provider"
import { Card } from "@/components/ui/card"
import { commit } from "@/data/edits"
import { entitiesOf } from "@/data/entities"
import { useHealth } from "@/data/health"
import { useLastSync } from "@/data/last-sync"
import { useLog, type LogView } from "@/data/log"
import {
  ErrorLine,
  Label,
  PlainLabels,
  Row,
  RowInput,
  Section,
  Segmented,
  Unit,
} from "@/dive/form/rows"
import { ago, instant } from "@/format/dates"
import { countText } from "@/components/pickers/match"
import { parseMaxPo2 } from "@/you/defaults"
import { DefaultsSection } from "@/you/defaults-section"
import { kindLabels } from "@/you/kinds"
import { listRow, pressable, RowContent, SaveFailure } from "@/you/parts"

export const Route = createFileRoute("/you/")({
  component: YouPage,
})

// The commit the image was built from (D30), or "dev" off a build.
const revision =
  (import.meta.env.VITE_REVISION as string | undefined)?.slice(0, 7) ?? "dev"

const none = "—"

const deletedCount = (log: LogView) =>
  [...log.dive.values()].filter((dive) => dive.deletedAt).length

// SettingsHifi as the You tab (D30): the diver's own things first, then
// the log's upkeep, then preferences.
function YouPage() {
  const { log, loaded, failed } = useLog()
  const syncedAt = useLastSync()
  // Rendered again each minute, so "2 min ago" doesn't sit at "just now"
  // until the next five-minute sync.
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [])
  // Asked again after each sync, so backup times follow a nightly snapshot.
  const health = useHealth(syncedAt)
  if (!loaded) return null
  // Ignored dives count, as /api/health's do; drafts aren't on the server.
  const localCount = log?.dives.filter((dive) => !dive.draft).length
  return (
    <div className="flex flex-col pt-[env(safe-area-inset-top)] md:mx-auto md:w-full md:max-w-xl">
      <header className="px-4 pt-6 pb-1">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.03em]">
          You
        </h1>
      </header>
      <div className="flex flex-col gap-6 px-4 pt-4 pb-10">
        {health?.writesPaused && (
          <Alert title="Saving is paused">
            The daily database check found a problem, so changes are paused to
            protect your log. Restore from a backup using the guide in the repo.
          </Alert>
        )}

        {/* Drawn before the first sync too, so nothing moves down when the
            log arrives. */}
        <DiverCard settings={log?.settings} cards={log?.cards.length} />

        <Card className="flex-row items-center gap-3 px-4 py-3.5">
          <span
            aria-hidden
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
              failed
                ? "bg-muted text-muted-foreground"
                : "bg-primary/12 text-primary"
            )}
          >
            {failed ? (
              <IconServerOff className="size-[19px] stroke-[1.9]" />
            ) : syncedAt ? (
              <IconCloudCheck className="size-[19px] stroke-[1.9]" />
            ) : (
              <IconRefresh className="size-[19px] stroke-[1.9]" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span
              role="status"
              className="text-base font-semibold tracking-[-0.01em]"
            >
              {failed
                ? "Can’t reach the server"
                : syncedAt
                  ? "All synced"
                  : "Syncing"}
            </span>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {syncedAt ? `Last sync ${ago(syncedAt)}` : "Fetching your log"}
            </span>
          </span>
        </Card>

        <Section title="Your log">
          <div className={listRow}>
            <RowContent
              label="Dives"
              value={
                health
                  ? countText(health.diveCount)
                  : localCount != null
                    ? countText(localCount)
                    : none
              }
            />
          </div>
          <div className={listRow}>
            <RowContent
              label="Last backup"
              value={
                health
                  ? health.lastSnapshotAt
                    ? instant(health.lastSnapshotAt)
                    : "Never"
                  : none
              }
            />
          </div>
          <div className={listRow}>
            <RowContent
              label="Last UDDF export"
              value={
                health
                  ? health.lastExportAt
                    ? instant(health.lastExportAt)
                    : "Never"
                  : none
              }
            />
          </div>
          <Link
            to="/you/deleted"
            state={{ pushed: true }}
            className={cn(listRow, pressable)}
          >
            <RowContent
              label="Recently deleted"
              value={log ? deletedCount(log) : none}
              chevron
            />
          </Link>
        </Section>

        {log && (
          <Section title="Sites, people and trips">
            {entityKinds.map((kind) => {
              const { title, icon } = kindLabels[kind]
              return (
                <Link
                  key={kind}
                  to="/you/entities"
                  search={{ kind }}
                  state={{ pushed: true }}
                  className={cn(listRow, pressable)}
                >
                  <RowContent
                    icon={icon}
                    label={title}
                    value={countText(entitiesOf(log, kind).length)}
                    chevron
                  />
                </Link>
              )
            })}
          </Section>
        )}

        <Section title="Download">
          {/* Built with the UDDF export; shown now so the section is
              where it will be. */}
          {[
            {
              icon: IconFileTypeXml,
              title: "UDDF export",
              sub: "Opens in Subsurface and other dive log apps",
            },
            {
              icon: IconDatabase,
              title: "Database snapshot",
              sub: "The SQLite file",
            },
          ].map(({ icon: Icon, title, sub }) => (
            <button
              key={title}
              type="button"
              disabled
              className={cn(listRow, "min-h-15 text-muted-foreground/60")}
            >
              <span
                aria-hidden
                className="inline-flex size-7.5 shrink-0 items-center justify-center rounded-lg bg-muted"
              >
                <Icon className="size-[17px] stroke-[1.9]" />
              </span>
              <RowContent label={title} sub={sub} />
            </button>
          ))}
        </Section>

        {log && <Preferences settings={log.settings} />}

        {log && <DefaultsSection settings={log.settings} />}

        <PlainLabels.Provider value>
          <Section title="This phone">
            <Appearance />
          </Section>
        </PlainLabels.Provider>

        <Section title="About">
          <div className={listRow}>
            <RowContent icon={IconVersions} label="Version" value={revision} />
          </div>
          <div className={listRow}>
            <RowContent
              icon={IconServer}
              label="Server"
              value={health?.server ?? none}
            />
          </div>
        </Section>
      </div>
    </div>
  )
}

function Alert({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      role="alert"
      className="flex gap-3 rounded-[14px] bg-destructive/6 px-4 py-3.5 ring-1 ring-destructive/35 ring-inset"
    >
      <IconAlertTriangle
        aria-hidden
        className="mt-px size-5 shrink-0 text-destructive"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] leading-[1.45] text-muted-foreground">
          {children}
        </span>
      </span>
    </section>
  )
}

// The diver's name and certification cards, under the title with no
// heading of their own (D30).
function DiverCard({
  settings,
  cards,
}: {
  settings?: Settings
  cards?: number
}) {
  const stored = settings?.diverName ?? ""
  const [name, setName] = useState(stored)
  const [base, setBase] = useState(stored)
  const [failure, setFailure] = useState<string>()
  const changed = name !== base
  // A sync that brings a new name shows it unless one is being typed.
  if (!changed && stored !== base) {
    setBase(stored)
    setName(stored)
  }
  // Saved as the field is left (Return leaves it too).
  const save = async () => {
    const typed = name
    const sent = typed.trim()
    if (sent === base) {
      setName(base)
      return
    }
    setFailure(undefined)
    try {
      await commit(apiClient().api.settings.$put({ json: { diverName: sent } }))
      setBase(sent)
      // Anything typed while it saved stays.
      setName((was) => (was === typed ? sent : was))
    } catch (error) {
      setName((was) => (was === typed ? base : was))
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }
  return (
    <div>
      <Card className="gap-0 divide-y py-0">
        <Row>
          {/* In the text colour, as the board draws the card's label. */}
          <label htmlFor="you-diverName" className="shrink-0 text-[15px]">
            Diver name
          </label>
          <RowInput
            id="you-diverName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void save()}
            placeholder="Your name"
            autoComplete="name"
            autoCapitalize="words"
            maxLength={120}
            disabled={!settings}
            className="text-ellipsis"
          />
        </Row>
        <Link
          to="/you/certifications"
          state={{ pushed: true }}
          className={cn(listRow, pressable)}
        >
          <RowContent
            label="Certifications"
            value={cards != null ? countText(cards) : null}
            chevron
          />
        </Link>
      </Card>
      <SaveFailure error={failure} />
    </div>
  )
}

// Log-wide preferences, apart from the defaults below so neither save
// puts back what another phone changed in the other.
function Preferences({ settings }: { settings: Settings }) {
  const stored = settings.maxPo2.toFixed(1)
  const [maxPo2, setMaxPo2] = useState(stored)
  const [base, setBase] = useState(stored)
  const [error, setError] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const changed = maxPo2 !== base
  // A sync that brings a new value shows it unless one is being typed.
  if (!changed && stored !== base) {
    setBase(stored)
    setMaxPo2(stored)
  }
  // Saved as the field is left. A value it refuses stays, with the
  // problem under it, until it's corrected.
  const save = async () => {
    const typed = maxPo2
    const { error: found, value } = parseMaxPo2(typed)
    setError(found)
    if (value === undefined) return
    // A comma for a point, say: nothing to send.
    if (value === parseMaxPo2(base).value) {
      setMaxPo2(base)
      return
    }
    setFailure(undefined)
    try {
      await commit(apiClient().api.settings.$put({ json: { maxPo2: value } }))
      setBase(typed)
    } catch (error) {
      setMaxPo2((was) => (was === typed ? base : was))
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }
  return (
    <div>
      <PlainLabels.Provider value>
        <Section title="Preferences">
          <div>
            <Row>
              <Label htmlFor="you-maxPo2">Maximum PO₂</Label>
              <RowInput
                id="you-maxPo2"
                inputMode="decimal"
                value={maxPo2}
                onChange={(event) => {
                  setMaxPo2(event.target.value)
                  setError(undefined)
                }}
                onBlur={() => void save()}
                placeholder="1.4"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? "error-maxPo2" : undefined}
              />
              <Unit>bar</Unit>
            </Row>
            <ErrorLine id="error-maxPo2" message={error} />
          </div>
        </Section>
      </PlainLabels.Provider>
      <SaveFailure error={failure} />
    </div>
  )
}

// Applies at once and stays on this phone, never reaching the server.
function Appearance() {
  const { theme, setTheme } = useTheme()
  return (
    <div
      role="group"
      aria-labelledby="you-theme"
      className="flex flex-col gap-2.5 px-4 py-3.5"
    >
      <Label id="you-theme">Appearance</Label>
      <Segmented
        labelledBy="you-theme"
        value={theme}
        onChange={(next) => next && setTheme(next)}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </div>
  )
}
