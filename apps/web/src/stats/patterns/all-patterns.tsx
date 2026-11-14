import { IconBulb } from "@tabler/icons-react"

import { NoLog } from "@/components/no-log"
import { Card } from "@/components/ui/card"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useLog } from "@/data/log"
import { PageBar } from "@/you/bar"

import { cachedPatterns } from "../cache"
import { Section } from "../charts/parts"
import { countedDives, shownYear } from "../figures"
import { PatternRow } from "./pattern-detail"

// What each group of All patterns is about.
const titles: Record<string, string> = {
  sac: "SAC rate",
  maxDepth: "Max depth",
  duration: "Duration",
  ascentAlarms: "Ascent alarms",
  waterTemperature: "Water temperature",
  thermalComfort: "Thermal comfort",
  visibility: "Visibility",
  current: "Current",
  surge: "Surge",
  workload: "Workload",
  gas: "Gas",
  habits: "Habits",
  records: "Records",
}

// Every pattern for the year Statistics shows, grouped by measure, each
// group led by its best, habits and records last.
export function AllPatterns({ year }: { year: string | undefined }) {
  const { log } = useLog()
  // The bar shows before the log too, so Back is there at once and nothing
  // moves down when the log arrives.
  if (!log)
    return (
      <div className="flex min-h-full flex-col">
        <Bar year={year} />
        <NoLog
          title="All patterns"
          skeleton={
            // The period line, a section heading and its card, where they
            // will sit, so nothing moves down when the log arrives.
            <div className="flex flex-col px-4 pt-3">
              <Skeleton className="mx-1 h-5.5 w-20" />
              <Skeleton className="mx-1 mt-4 mb-2.5 h-4 w-32" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          }
        />
      </div>
    )
  const counted = countedDives(log)
  const shown = shownYear(counted, year)
  const { groups } = cachedPatterns(log, shown)
  return (
    <div className="flex flex-col">
      <Bar year={shown} />
      <div className="flex flex-col gap-7 px-4 pt-3 pb-10 md:mx-auto md:w-full md:max-w-xl">
        <p className="-mb-3 px-1 text-[15px] text-muted-foreground">
          {shown ?? "All time"}
        </p>
        {/* Only an old link gets here with none, as Statistics hides the
            way in then. */}
        {!groups.length && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="accent">
                <IconBulb />
              </EmptyMedia>
              <EmptyTitle className="text-lg font-semibold tracking-[-0.015em]">
                No patterns yet
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {groups.map(({ measure, patterns }) => (
          <Section
            key={measure}
            id={`patterns-${measure}`}
            title={titles[measure] ?? measure}
          >
            <Card className="gap-0 divide-y py-0">
              {patterns.map((pattern) => (
                <PatternRow key={pattern.id} pattern={pattern} />
              ))}
            </Card>
          </Section>
        ))}
      </div>
    </div>
  )
}

const Bar = ({ year }: { year: string | undefined }) => (
  <PageBar
    back={{
      label: "Stats",
      to: "/stats",
      search: { year: year ? Number(year) : undefined },
    }}
    title="All patterns"
  />
)
