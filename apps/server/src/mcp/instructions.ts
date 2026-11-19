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
    `Shylog, ${whose} (${env.SHYLOG_APP_NAME}): log dives, look a dive up by its number, search past dives, and keep their sites, people, dive centres, trips and regions tidy.`,
    "Units are the app's and are named in each field: metres, minutes, °C, bar, kg, litres, and oxygen in per cent. Times are local wall-clock times at the dive site, with no time zone.",
    "The diver names dives by their number. Numbers move when a dive is added earlier in the log, so anything that changes a dive uses the id the tools return.",
    "Before writing, look sites, people, dive centres and trips up with list_entities and use the one that exists. Ask the diver before making a new site or person, and before merging.",
    "edit_dive replaces a dive's buddies, professionals and tags as whole lists; to add one person, a trip or a dive centre to dives, use assign_dives.",
    "What you enter counts as entered by hand, and a later import from the dive computer never overwrites it.",
    "Downloads from the dive computer, imports, deleting dives or anything else, Statistics and Patterns are in the Shylog app, not here.",
    // Only where the instance shows the map, as its tools are only there.
    env.SHYLOG_EXPLORE === "on" &&
      "search_map_sites and get_map_site read the Explore map's dive sites round the Cape Peninsula and False Bay, from Wikivoyage. They aren't the log's sites: a dive is logged at a site from list_entities, whose mapSite names the map's site it is. To pick a site for a day, look the forecast up yourself (swell, wind and their directions) and read each candidate's Conditions and Get in.",
  ]
    .filter(Boolean)
    .join("\n\n")
}
