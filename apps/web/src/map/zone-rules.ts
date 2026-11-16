// What each marine protected area's notices say about diving, fishing and
// boats, as the map's zone rules list them, with the notice each rule comes
// from. Read from the Government Gazettes on 16 November 2026.

export type Swatch = "no-take" | "no-dive" | "business"

export type Rule = { text: string; source: string; swatch?: Swatch }

export type MpaRules = { mpa: string; rules: Rule[]; note?: string }

export const mpaRules: MpaRules[] = [
  {
    mpa: "Table Mountain",
    rules: [
      {
        swatch: "no-take",
        text: "No-take zones: no fishing, spearfishing or collecting. Diving is allowed. In Karbonkelberg, snoek may be caught deeper than 35 m.",
        source: "GN R.695 of 2004, reg 6",
      },
      {
        text: "Elsewhere, fishing and collecting need a permit.",
        source: "GN R.695 of 2004, reg 7",
      },
      {
        text: "No dive permit since 3 May 2024. Dive businesses still need a permit.",
        source: "GN R.4786 of 2024",
      },
      {
        text: "Boats with divers down fly the alpha flag.",
        source: "GN R.695 of 2004, reg 11",
      },
      {
        text: "Motorboats keep to 8 knots within 500 m of the high-water mark, except when launching or in an emergency.",
        source: "GN R.695 of 2004, reg 11, added by GN R.4786 of 2024",
      },
      {
        text: "No anchoring in a no-take zone for more than 24 hours. No jet skis.",
        source: "GN R.695 of 2004, reg 11",
      },
    ],
  },
  {
    mpa: "Robben Island",
    rules: [
      {
        swatch: "no-dive",
        text: "Restricted zone: no fishing, and no diving or dive gear. SANParks permits diving only for research, photography or salvage.",
        source: "R.794 of 2019, regs 7 and 9",
      },
      {
        swatch: "business",
        text: "Elsewhere, scuba dive only with an authorised dive business.",
        source: "R.794 of 2019, reg 9",
      },
      {
        text: "Fishing needs a permit, and each zone allows only some species.",
        source: "R.794 of 2019, reg 8",
      },
      {
        text: "Boats crossing the restricted zone keep above 5 knots and stop for 3 minutes at most. No jet skis there.",
        source: "R.794 of 2019, reg 5",
      },
      {
        text: "Boats with divers down fly the alpha flag. No boat may carry scuba gear and a speargun together.",
        source: "R.794 of 2019, regs 4 and 9",
      },
    ],
  },
  {
    mpa: "Betty's Bay",
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
]

// The line a site's sheet shows for the zone it lies in.
export const zoneRules: Record<string, { name: string; rule: string }> = {
  "table-mountain": {
    name: "Table Mountain marine protected area",
    rule: "Fishing and collecting need a permit.",
  },
  karbonkelberg: {
    name: "Karbonkelberg no-take zone",
    rule: "No fishing, spearfishing or collecting.",
  },
  "cape-of-good-hope": {
    name: "Cape of Good Hope no-take zone",
    rule: "No fishing, spearfishing or collecting.",
  },
  paulsberg: {
    name: "Paulsberg no-take zone",
    rule: "No fishing, spearfishing or collecting.",
  },
  "castle-rock": {
    name: "Castle Rock no-take zone",
    rule: "No fishing, spearfishing or collecting.",
  },
  boulders: {
    name: "Boulders no-take zone",
    rule: "No fishing, spearfishing or collecting.",
  },
  "st-james": {
    name: "St James no-take zone",
    rule: "No fishing, spearfishing or collecting.",
  },
  "robben-island": {
    name: "Robben Island marine protected area",
    rule: "Scuba dive only with an authorised dive business.",
  },
  "robben-restricted": {
    name: "Robben Island restricted zone",
    rule: "No fishing. No diving without a SANParks permit for research, photography or salvage.",
  },
  "bettys-bay": {
    name: "Betty's Bay marine protected area",
    rule: "No fishing except recreational shore-angling for linefish.",
  },
}
