import { entityKinds, type EntityKind } from "@shylog/core"
import { createFileRoute } from "@tanstack/react-router"

import { entitiesOf } from "@/data/entities"
import { useLog } from "@/data/log"
import { PageBar } from "@/you/bar"
import { EntityDetail } from "@/you/entity-detail"
import { kindLabels } from "@/you/kinds"

export const Route = createFileRoute("/you/entities/$kind/$id")({
  component: EntityPage,
})

function EntityPage() {
  const { kind, id } = Route.useParams()
  const { log, loaded } = useLog()
  if (!loaded) return null
  const known = entityKinds.includes(kind as EntityKind)
  const entity =
    known && log
      ? entitiesOf(log, kind as EntityKind).find((one) => one.id === id)
      : undefined
  if (!log || !entity) {
    const back = known ? (kind as EntityKind) : "site"
    return (
      <div className="flex flex-col">
        <PageBar
          back={{
            label: kindLabels[back].title,
            to: "/you/entities",
            search: { kind: back },
          }}
        />
        {/* Before the first sync fills the log, the bar alone: "Not found"
            would be wrong. */}
        {log && (
          <div className="flex flex-col gap-2 px-5 pt-3">
            <h1 className="text-xl font-semibold">Not found</h1>
            <p className="text-muted-foreground">
              It may have been merged into another or deleted.
            </p>
          </div>
        )}
      </div>
    )
  }
  // Keyed, so a merge's survivor taking this screen's place starts afresh.
  return (
    <EntityDetail
      key={`${kind}-${id}`}
      log={log}
      kind={kind as EntityKind}
      id={id}
    />
  )
}
