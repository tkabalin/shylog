import { readSettings } from "../apply/settings.ts"
import type { Db } from "../db/open.ts"
import type { Env } from "../env.ts"

// What Claude reads first about the server. It names whose log this is, as
// the owner's login reaches every instance and a dive must land in the
// right one. Claude Code keeps 4,096 characters of it.
export function instructions(db: Db, env: Env) {
  const { diverName } = readSettings(db)
  const whose = diverName ? `${diverName}'s dive log` : "a dive log"
  return [
    `Shylog, ${whose} (${env.SHYLOG_APP_NAME}): look a dive up by its number and search past dives, their sites, people, dive centres and trips.`,
    "Units are the app's and are named in each field: metres, minutes, °C, bar, kg, litres, and oxygen in per cent. Times are local wall-clock times at the dive site, with no time zone.",
    "The diver names dives by their number. Numbers move when a dive is added earlier in the log, so anything that follows up on a dive uses the id the tools return.",
    "Downloads from the dive computer, imports, Statistics and Patterns are in the Shylog app, not here.",
  ].join("\n\n")
}
