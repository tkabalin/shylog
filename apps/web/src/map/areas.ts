// The dive site map's areas, apart from sites.ts, which imports a ?raw
// module, so the public site's build can read them too.

export type Area = "atlantic" | "false-bay" | "offshore" | "east" | "fresh"

// In the list's order, each clustering on its own.
export const areas: Record<Area, string> = {
  atlantic: "Atlantic coast",
  "false-bay": "False Bay coast",
  offshore: "Offshore False Bay",
  east: "East False Bay",
  fresh: "Fresh water",
}
