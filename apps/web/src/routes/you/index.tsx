import { useEffect, useState, type ReactNode } from "react"
import { entityKinds, type Settings } from "@shylog/core"
import {
  IconAlertTriangle,
  IconCertificate,
  IconCloudCheck,
  IconCloudPause,
  IconServer,
  IconRefresh,
  IconServerOff,
  IconUser,
  IconVersions,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"

import { apiClient } from "@/api/client"
import { useTheme } from "@/components/theme-provider"
import { Card } from "@/components/ui/card"
import { youCards } from "@/data/cards"
import { commit } from "@/data/edits"
import { entitiesOf } from "@/data/entities"
import { exportNow } from "@/data/export"
import { useHealth } from "@/data/health"
import { useLastSync } from "@/data/last-sync"
import type { Card as CertCard } from "@/data/db"
import { useLog, type LogView } from "@/data/log"
import {
  setSmoothTemperature,
  useSmoothTemperature,
} from "@/data/smooth-temperature"
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
import { Switch } from "@/components/ui/switch"
import { DefaultsSection } from "@/you/defaults-section"
import { CardImage } from "@/you/cards/card-image"
import { Downloads } from "@/you/downloads"
import { Fold, foldMs } from "@/you/fold"
import { kindLabels } from "@/you/kinds"
import { listRow, pressable, RowContent, SaveFailure } from "@/you/parts"

export const Route = createFileRoute("/you/")({
  component: YouPage,
})

// The commit the image was built from, or "dev" off a build.
const revision =
  (import.meta.env.VITE_REVISION as string | undefined)?.slice(0, 7) ?? "dev"

const none = "—"

const deletedCount = (log: LogView) =>
  [...log.dive.values()].filter((dive) => dive.deletedAt).length

// SettingsHifi as the You tab: sync status first, then the diver's
// own things, then the log's upkeep, then preferences.
function YouPage() {
  const { log, loaded, failed, blocked } = useLog()
  const syncedAt = useLastSync()
  // Rendered again each minute, so "2 min ago" doesn't sit at "just now"
  // until the next five-minute sync.
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [])
  // Asked again after each sync, so backup times follow a nightly snapshot.
  const [health, reloadHealth] = useHealth(syncedAt)
  // The health the page was first drawn with (the last visit's, kept by
  // useHealth): an alert already in it is drawn in place, and only one
  // that arrives afterwards unfolds.
  const [shownWith] = useState(health)
  // An Export now shows in Your log at once, rather than once the alert
  // has folded and /api/health has answered again.
  const [exportedAt, setExportedAt] = useState<string>()
  const lastExportAt = [health?.lastExportAt, exportedAt]
    .filter((at) => at != null)
    .sort()
    .at(-1)
  const exportFailedAt =
    health?.exportFailedAt &&
    !(exportedAt && exportedAt > health.exportFailedAt)
      ? health.exportFailedAt
      : null
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
          <Fold open appear={!shownWith?.writesPaused}>
            <Alert title="Saving is paused">
              The daily database check found a problem, so changes are paused to
              protect your log. Restore from a backup using the guide in the
              repo.
            </Alert>
          </Fold>
        )}
        {health?.exportFailedAt && !health.writesPaused && (
          // A later night's failure is a new alert, not the folded one.
          <ExportFailed
            key={health.exportFailedAt}
            appear={shownWith?.exportFailedAt !== health.exportFailedAt}
            onExported={setExportedAt}
            onFolded={reloadHealth}
          />
        )}

        <Card className="flex-row items-center gap-3 px-4 py-3.5">
          <span
            aria-hidden
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
              failed || blocked
                ? "bg-muted text-muted-foreground"
                : "bg-primary/12 text-primary"
            )}
          >
            {/* A newer server answers, so the sync "succeeds" while taking
                nothing: it says paused, not All synced. */}
            {blocked ? (
              <IconCloudPause className="size-[19px] stroke-[1.9]" />
            ) : failed ? (
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
              {blocked
                ? "Syncing paused"
                : failed
                  ? "Can’t reach the server"
                  : syncedAt
                    ? "All synced"
                    : "Syncing"}
            </span>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {syncedAt
                ? `Last sync ${ago(syncedAt)}`
                : failed
                  ? "No sync yet"
                  : "Fetching your log"}
            </span>
          </span>
        </Card>

        {/* Drawn before the first sync too, so nothing moves down when the
            log arrives. */}
        <DiverCard settings={log?.settings} cards={log?.cards} />

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
              label="Last export"
              value={
                !health ? (
                  none
                ) : exportFailedAt ? (
                  // The day only: the night's run is always near midnight,
                  // and the time would be cut off on a narrow phone.
                  <span className="text-warn">
                    Failed {lowerFirst(day(exportFailedAt))}
                  </span>
                ) : lastExportAt ? (
                  instant(lastExportAt)
                ) : (
                  "Never"
                )
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

        <Downloads />

        {log && <Preferences settings={log.settings} />}

        {log && <DefaultsSection settings={log.settings} />}

        <PlainLabels.Provider value>
          <Section title="This phone">
            <Appearance />
            <SmoothTemperature />
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

// "Today" after "Failed".
const lowerFirst = (text: string) => text[0].toLowerCase() + text.slice(1)
const day = (at: string) => instant(at).replace(/ \d\d:\d\d$/, "")

// SettingsHifi's alert: red when saving is paused, orange for a failed
// export, which loses nothing and has an action.
function Alert({
  title,
  tone = "danger",
  action,
  children,
}: {
  title: string
  tone?: "danger" | "warn"
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      role="alert"
      className={cn(
        "flex gap-3 rounded-[14px] px-4 py-3.5 ring-1 ring-inset",
        // Over the card colour, as the board mixes it, so the dark fill
        // isn't darker than the cards around it.
        tone === "danger"
          ? "bg-[color-mix(in_oklab,var(--destructive)_6%,var(--card))] ring-destructive/35"
          : "bg-[color-mix(in_oklab,var(--warn)_6%,var(--card))] ring-warn/35"
      )}
    >
      <IconAlertTriangle
        aria-hidden
        className={cn(
          "mt-px size-5 shrink-0",
          tone === "danger" ? "text-destructive" : "text-warn"
        )}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] leading-[1.45] text-pretty text-muted-foreground">
          {children}
        </span>
        {action}
      </span>
    </section>
  )
}

// A failed night's export, with Export now. A failure says why under the
// action; a success fades the alert, folds its room away, then asks for
// health again.
function ExportFailed({
  appear,
  onExported,
  onFolded,
}: {
  appear: boolean
  onExported: (at: string) => void
  onFolded: () => void
}) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string>()
  const [gone, setGone] = useState(false)
  const run = async () => {
    // Not disabled while it runs, which would fade the label to near
    // nothing; a second tap waits instead.
    if (running) return
    setRunning(true)
    setError(undefined)
    try {
      onExported(await exportNow())
      // Still "Exporting…" as it fades, rather than offering itself again.
      setGone(true)
      // Once the fold is done. A timer rather than transitionend, which a
      // hidden page (the app sent to the background) never fires.
      setTimeout(onFolded, foldMs)
    } catch (failure) {
      setError((failure as Error).message)
      setRunning(false)
    }
  }
  return (
    <Fold open={!gone} appear={appear}>
      <Alert
        title="Last night’s export failed"
        tone="warn"
        action={
          <>
            <button
              type="button"
              aria-disabled={running}
              onClick={() => void run()}
              className="-ml-2 h-11 self-start rounded-md px-2 text-sm font-semibold text-primary transition-opacity duration-150 active:opacity-60 active:duration-0 desk:mt-1.5 desk:h-8"
            >
              {running ? "Exporting…" : "Export now"}
            </button>
            {error && (
              // The alert's own colour, not a third hue beside it.
              <span className="text-[13px] font-medium text-warn">{error}</span>
            )}
          </>
        }
      >
        Your dives are safe in the database and last night’s backup. The export
        runs again tonight, or you can run it now.
      </Alert>
    </Fold>
  )
}

// The diver's name and the first certification cards, under the sync
// card with no heading of their own.
function DiverCard({
  settings,
  cards,
}: {
  settings?: Settings
  cards?: CertCard[]
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
          <label
            htmlFor="you-diverName"
            className="flex shrink-0 items-center gap-1.5 text-[15px]"
          >
            <IconUser
              aria-hidden
              className="size-[1.15em] shrink-0 text-muted-foreground"
            />
            Diver name
          </label>
          <RowInput
            id="you-diverName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void save()}
            placeholder="Your name"
            autoCapitalize="words"
            maxLength={120}
            disabled={!settings}
            className="text-ellipsis"
          />
        </Row>
        {cards?.length ? (
          // The first three in the owner's order, each straight to its
          // viewer, as a dive centre asks for the latest.
          <ul className="grid grid-cols-3 gap-2.5 px-4 pt-3.5 pb-3">
            {cards.slice(0, youCards).map((card) => (
              <li key={card.id} className="min-w-0">
                <Link
                  to="/you/certifications/$cardId"
                  params={{ cardId: card.id }}
                  state={{ pushed: true }}
                  className="flex flex-col gap-1.5 rounded-[7px] outline-offset-2 transition-opacity duration-150 select-none [-webkit-touch-callout:none] hover:opacity-70 active:opacity-50 active:duration-0"
                >
                  {/* A bank card's shape, which an eCard keeps. */}
                  <CardImage
                    cardId={card.id}
                    n={0}
                    hash={card.images[0]!}
                    className="aspect-[1.586] w-full rounded-[7px] bg-muted object-cover ring-1 ring-foreground/10"
                  />
                  <span className="line-clamp-2 text-[13px] leading-snug font-medium tracking-[-0.01em] break-words">
                    {card.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <Link
          to="/you/certifications"
          state={{ pushed: true }}
          className={cn(listRow, pressable)}
        >
          <RowContent
            icon={IconCertificate}
            label={cards?.length ? "All certifications" : "Certifications"}
            value={cards != null ? countText(cards.length) : null}
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

// The profile chart's temperature line, also picked from the lane's caption.
function SmoothTemperature() {
  const smooth = useSmoothTemperature()
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <label
        htmlFor="you-smooth-temperature"
        className="flex flex-1 flex-col gap-0.5"
      >
        <span className="text-[15px]">Smooth water temperature</span>
        <span className="text-[13px] text-muted-foreground">
          On the profile chart
        </span>
      </label>
      <Switch
        id="you-smooth-temperature"
        checked={smooth}
        onCheckedChange={setSmoothTemperature}
      />
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
