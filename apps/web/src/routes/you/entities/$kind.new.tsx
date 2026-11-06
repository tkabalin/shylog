import type { EntityKind } from "@shylog/core"
import { createFileRoute } from "@tanstack/react-router"

import { useLog } from "@/data/log"
import { PageBar } from "@/you/bar"
import { pickable } from "@/you/entity-detail"
import { kindLabels } from "@/you/kinds"
import { NewEntity } from "@/you/new-entity"

// Only trips, dive centres and people are made here, with their dives;
// sites and regions come from a dive's form.
export const Route = createFileRoute("/you/entities/$kind/new")({
  component: NewEntityPage,
})

function NewEntityPage() {
  const { kind } = Route.useParams()
  const { log } = useLog()
  if (!pickable(kind as EntityKind)) {
    return (
      <div className="flex flex-col">
        <PageBar back={{ label: "You", to: "/you" }} />
        <div className="flex flex-col gap-2 px-5 pt-3">
          <h1 className="text-xl font-semibold">Not found</h1>
        </div>
      </div>
    )
  }
  // The bar alone until the first sync has filled the log, so Back works.
  if (!log)
    return (
      <PageBar
        back={{
          label: kindLabels[kind as EntityKind].title,
          to: "/you/entities",
          search: { kind: kind as EntityKind },
        }}
      />
    )
  return <NewEntity log={log} kind={kind as "trip" | "diveCentre" | "person"} />
}
