import type { Extras } from "./convert.ts"

// Invented dives in the shape of the PADI Logbook Exporter's JSON. Dates,
// depths and bottom times follow dives in the Zoop Novo fixture, so they
// match its dives once seeded; sites and people are made up.

type Overrides = {
  id: number
  date: string
  location?: string
  maxDepth?: number
  bottomTime?: number
  conditions?: Record<string, unknown>
  equipment?: Record<string, unknown>
  experiences?: Record<string, unknown>
}

export function padiDive({
  id,
  date,
  location = "Kelp Point ",
  maxDepth = 6.4,
  bottomTime = 60,
  conditions,
  equipment,
  experiences,
}: Overrides) {
  return {
    id,
    log_type: "Recreational",
    log_course: null,
    log_number: null,
    dive_type: "BeachShore",
    dive_title: location,
    dive_date: `${date}T00:00:00`,
    dive_location: location,
    memsys_member_number: 1,
    status: "Publish",
    adventure_dive: null,
    depth_times: [
      {
        max_depth: maxDepth,
        bottom_time: bottomTime,
        time_in: null,
        time_out: null,
      },
    ],
    skills: [],
    conditions: [
      {
        water_type: "Salt",
        body_of_water: "Ocean",
        weather: "Sunny",
        air_temp: 18,
        surface_water_temp: 17,
        bottom_water_temp: 15,
        visibility: "Average",
        visibility_distance: 6,
        wave_condition: "SmallWaves",
        current: "SomeCurrent",
        surge: "MediumSurge",
        ...conditions,
      },
    ],
    equipment: [
      {
        suit_type: "FullSuit_5mm",
        weight: 7.5,
        weight_type: "Good",
        additional_equipment: ["Boots", "Hood", "Gloves"],
        cylinder_type: "Steel",
        cylinder_size: 12,
        gas_mixture: "Air",
        oxygen: 21,
        nitrogen: 79,
        helium: 0,
        starting_pressure: 220,
        ending_pressure: 50,
        ...equipment,
      },
    ],
    experiences: [
      {
        feeling: "Good",
        notes: "Saw a seal ",
        buddies: "Alex, Sam and Club",
        dive_center: "Reef Club",
        ...experiences,
      },
    ],
  }
}

export const padiExport = (dives: unknown[]) => ({
  exportedAt: "2026-11-06T16:03:28.924Z",
  affiliateId: "1",
  totalDives: dives.length,
  dives,
})

// 7 December 2025 and 14 January 2026 are Zoop fixture dives (6.4 m for 65
// min, 15.3 m for 62 min); the Zoop has no dive on 5 April 2026.
export const december = padiDive({ id: 101, date: "2025-12-07" })
export const january = padiDive({
  id: 102,
  date: "2026-01-14",
  location: "Seal Rock",
  maxDepth: 15.3,
  bottomTime: 62,
  conditions: {
    visibility_distance: null,
    visibility: "Low",
    weather: "Foggy",
  },
  experiences: { buddies: "Alex & Pat", notes: "", feeling: "Amazing" },
})
export const april = padiDive({
  id: 103,
  date: "2026-04-05",
  maxDepth: 18,
  bottomTime: 44,
  conditions: { surface_water_temp: 21, bottom_water_temp: null },
})

export const extras: Extras = {
  sites: {
    "kelp point": { name: "Kelp Point", country: "ZA", region: "False Bay" },
    "Seal Rock": { name: "Seal Rock", country: "ZA" },
  },
  people: {
    Alex: "Alex Example",
    Sam: "Sam van Example",
    Pat: "Pat Guide",
    Club: null,
  },
  centres: { "Reef Club": "Reef Club" },
  dives: {
    "102": { professionals: ["Pat Guide"] },
    "103": { startTime: "09:30" },
  },
}
