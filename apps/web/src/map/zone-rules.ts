// What the notices say about diving, fishing and boats in each marine
// protected area, the abalone regulations' areas included, with the notice
// each rule comes from. Read from the Government Gazettes on 16 November 2026.

// When the notices were last read, which Sources names.
export const rulesRead = "2026-11-16"

export type Swatch = "no-take" | "no-dive" | "no-snorkel" | "business"

export type Rule = { text: string; source: string; swatch?: Swatch }

// An area's rules by where on the map they apply, each zone's first and
// then the rest of the area, so a long list such as Table Mountain's reads
// in parts. A short one has no heading.
export type RuleGroup = { heading?: string; where?: string; rules: Rule[] }

export type MpaRules = {
  id: Mpa
  mpa: string
  groups: RuleGroup[]
  note?: string
}

export type Mpa =
  "table-mountain" | "robben-island" | "bettys-bay" | "helderberg"

export const mpaRules: MpaRules[] = [
  {
    id: "table-mountain",
    mpa: "Table Mountain",
    groups: [
      {
        heading: "No-take zones",
        where:
          "Karbonkelberg, Cape of Good Hope, Paulsberg, Castle Rock, Boulders and St James",
        rules: [
          {
            swatch: "no-take",
            text: "No fishing, spearfishing or collecting. Diving is allowed.",
            source: "GN R.695 of 2004, reg 6",
          },
          {
            text: "In Karbonkelberg, snoek may be caught deeper than 35 m.",
            source: "GN R.695 of 2004, reg 6",
          },
          {
            text: "No anchoring for more than 24 hours.",
            source: "GN R.695 of 2004, reg 11",
          },
        ],
      },
      {
        heading: "Cape Point abalone area",
        where: "From Venus Pool round Cape Point to Olifantsbospunt",
        rules: [
          {
            swatch: "no-dive",
            text: "1.9 to 3.7 km out (1 to 2 nautical miles): no diving or snorkelling, and no boat may carry masks, fins or scuba gear. Bellows Rock and 300 m round it are left out, so it can be dived from a boat that comes in from further out.",
            source: "R.62 of 2008, regs 3 and 4, amended by R.6795 of 2025",
          },
          {
            text: "Closer in, dive or snorkel only from the shore, in the park's opening hours, with no dive gear on any boat. Divers and boats keep 30 m apart. Dive businesses can't get a permit for boat dives here.",
            source: "R.62 of 2008, regs 3 and 4, amended by R.6795 of 2025",
          },
        ],
      },
      {
        heading: "Everywhere",
        rules: [
          {
            text: "Fishing and collecting need a permit where they're allowed.",
            source: "GN R.695 of 2004, reg 7",
          },
          {
            text: "Divers haven't needed a permit since 3 May 2024. Dive businesses still do.",
            source: "GN R.4786 of 2024",
          },
          {
            text: "Boats with divers down fly the alpha flag. No jet skis.",
            source: "GN R.695 of 2004, reg 11",
          },
          {
            text: "Motorboats keep to 8 knots within 500 m of the high-water mark, except when launching or in an emergency.",
            source: "GN R.695 of 2004, reg 11, added by GN R.4786 of 2024",
          },
        ],
      },
    ],
  },
  {
    id: "robben-island",
    mpa: "Robben Island",
    groups: [
      {
        heading: "Restricted zone",
        rules: [
          {
            swatch: "no-dive",
            text: "No fishing, and no diving or dive gear. SANParks permits diving only for research, photography or salvage.",
            source: "R.794 of 2019, regs 7 and 9",
          },
          {
            text: "Boats crossing it keep above 5 knots and stop for 3 minutes at most. No jet skis.",
            source: "R.794 of 2019, reg 5",
          },
        ],
      },
      {
        heading: "Abalone area",
        where: "Within 1.9 km of the island (1 nautical mile)",
        rules: [
          {
            swatch: "no-snorkel",
            text: "No snorkelling or freediving, scuba only with a dive business that holds an abalone permit, and no dive gear on a boat without one.",
            source: "R.62 of 2008, regs 3 and 4, amended by R.6795 of 2025",
          },
        ],
      },
      {
        heading: "Everywhere",
        rules: [
          {
            swatch: "business",
            text: "Scuba dive only with an authorised dive business.",
            source: "R.794 of 2019, reg 9",
          },
          {
            text: "Fishing needs a permit, and each zone allows only some species.",
            source: "R.794 of 2019, reg 8",
          },
          {
            text: "Boats with divers down fly the alpha flag. No boat may carry scuba gear and a speargun together.",
            source: "R.794 of 2019, regs 4 and 9",
          },
        ],
      },
    ],
  },
  {
    id: "bettys-bay",
    mpa: "Betty's Bay",
    groups: [
      {
        rules: [
          {
            text: "No fishing or collecting, except recreational shore-angling for linefish.",
            source: "Protected Areas Act, s48A; R.1429 of 2000, para 3",
          },
          {
            text: "No rules on diving. A 2017 draft would add a dive permit and ban diving from 17:00 to 08:00, but it was never made final.",
            source: "Draft GN 709 of 2017",
          },
        ],
      },
    ],
  },
  {
    id: "helderberg",
    mpa: "Helderberg",
    groups: [
      {
        rules: [
          {
            text: "No fishing or collecting. No rules on diving.",
            source: "Protected Areas Act, s48A; R.1429 of 2000",
          },
        ],
      },
    ],
    note: "The notice gives no coordinates, only the 500 m from the shore between the Eerste and Lourens river mouths, so the map measures it from OpenStreetMap's coastline.",
  },
]

// The row a site's sheet shows for the zone it lies in, which first says
// whether it can be dived. Where it can't, or only from the shore, that's
// the row's title, with the zone's name under it. Each opens the rules at
// the marine protected area whose notices it comes under.
export const zoneRules: Record<
  string,
  { name: string; rule: string; title?: string; mpa: Mpa }
> = {
  "table-mountain": {
    mpa: "table-mountain",
    name: "Table Mountain marine protected area",
    rule: "Diving allowed. Fishing and collecting need a permit.",
  },
  karbonkelberg: {
    mpa: "table-mountain",
    name: "Karbonkelberg no-take zone",
    rule: "Diving allowed. No fishing, spearfishing or collecting.",
  },
  "cape-of-good-hope": {
    mpa: "table-mountain",
    name: "Cape of Good Hope no-take zone",
    rule: "Diving allowed. No fishing, spearfishing or collecting.",
  },
  paulsberg: {
    mpa: "table-mountain",
    name: "Paulsberg no-take zone",
    rule: "Diving allowed. No fishing, spearfishing or collecting.",
  },
  "castle-rock": {
    mpa: "table-mountain",
    name: "Castle Rock no-take zone",
    rule: "Diving allowed. No fishing, spearfishing or collecting.",
  },
  boulders: {
    mpa: "table-mountain",
    name: "Boulders no-take zone",
    rule: "Diving allowed. No fishing, spearfishing or collecting.",
  },
  "st-james": {
    mpa: "table-mountain",
    name: "St James no-take zone",
    rule: "Diving allowed. No fishing, spearfishing or collecting.",
  },
  "robben-island": {
    mpa: "robben-island",
    name: "Robben Island marine protected area",
    rule: "Scuba dive only with an authorised dive business.",
  },
  "robben-abalone": {
    mpa: "robben-island",
    name: "Robben Island abalone area",
    rule: "No snorkelling or freediving, and scuba only with a dive business that holds a permit.",
  },
  "robben-restricted": {
    mpa: "robben-island",
    name: "Robben Island restricted zone",
    title: "No diving",
    rule: "Only with a SANParks permit for research, photography or salvage. No fishing.",
  },
  "bettys-bay": {
    mpa: "bettys-bay",
    name: "Betty's Bay marine protected area",
    rule: "Diving allowed. No fishing except recreational shore-angling for linefish.",
  },
  helderberg: {
    mpa: "helderberg",
    name: "Helderberg marine protected area",
    rule: "Diving allowed. No fishing or collecting.",
  },
  "cape-point-no-dive": {
    mpa: "table-mountain",
    name: "Cape Point abalone area",
    title: "No diving",
    rule: "No snorkelling either, and no dive gear on boats.",
  },
  "cape-point-shore-only": {
    mpa: "table-mountain",
    name: "Cape Point abalone area",
    title: "Shore dives only",
    rule: "In the park's opening hours. No dive gear on boats.",
  },
}
