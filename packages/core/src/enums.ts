// Choice fields store Shylog's own keys. Where UDDF has the field, each key
// maps to its UDDF string here, so the database and the export never share
// spellings. Key order is the order the app lists the options in.

type Options = Record<string, { label: string; uddf?: string }>

export function keysOf<O extends Options>(options: O) {
  return Object.keys(options) as [keyof O & string, ...(keyof O & string)[]]
}

export const diveTypes = {
  recreation: { label: "Recreation", uddf: "recreation" },
  training: { label: "Training", uddf: "training" },
  scientific: { label: "Scientific", uddf: "scientific" },
  medical: { label: "Medical", uddf: "medical" },
  commercial: { label: "Commercial", uddf: "commercial" },
  military: { label: "Military", uddf: "military" },
  competitive: { label: "Competitive", uddf: "competitive" },
  other: { label: "Other", uddf: "other" },
} as const satisfies Options
export type DiveType = keyof typeof diveTypes

export const entries = {
  beachShore: { label: "Beach or shore", uddf: "beach-shore" },
  pier: { label: "Pier", uddf: "pier" },
  smallBoat: { label: "Small boat", uddf: "small-boat" },
  charterBoat: { label: "Charter boat", uddf: "charter-boat" },
  liveaboard: { label: "Liveaboard", uddf: "live-aboard" },
  barge: { label: "Barge", uddf: "barge" },
  landside: { label: "Landside", uddf: "landside" },
  hyperbaricFacility: {
    label: "Hyperbaric facility",
    uddf: "hyperbaric-facility",
  },
  other: { label: "Other", uddf: "other" },
} as const satisfies Options
export type Entry = keyof typeof entries

export const currents = {
  none: { label: "None", uddf: "no-current" },
  veryMild: { label: "Very mild", uddf: "very-mild-current" },
  mild: { label: "Mild", uddf: "mild-current" },
  moderate: { label: "Moderate", uddf: "moderate-current" },
  hard: { label: "Hard", uddf: "hard-current" },
  veryHard: { label: "Very hard", uddf: "very-hard-current" },
} as const satisfies Options
export type Current = keyof typeof currents

// Surge, surface and weather have no UDDF element; the export writes the key
// into Shylog's own <shylog> block.
export const surges = {
  none: { label: "None" },
  mild: { label: "Mild" },
  moderate: { label: "Moderate" },
  hard: { label: "Hard" },
  veryHard: { label: "Very hard" },
} as const satisfies Options
export type Surge = keyof typeof surges

export const surfaces = {
  calm: { label: "Calm" },
  moving: { label: "Moving" },
  stormy: { label: "Stormy" },
} as const satisfies Options
export type Surface = keyof typeof surfaces

export const weathers = {
  cloudless: { label: "Cloudless" },
  cloudy: { label: "Cloudy" },
  rainy: { label: "Rainy" },
} as const satisfies Options
export type Weather = keyof typeof weathers

export const visibilityRatings = {
  low: { label: "Low" },
  average: { label: "Average" },
  high: { label: "High" },
} as const satisfies Options
export type VisibilityRating = keyof typeof visibilityRatings

export const workloads = {
  resting: { label: "Resting", uddf: "resting" },
  light: { label: "Light", uddf: "light" },
  moderate: { label: "Moderate", uddf: "moderate" },
  severe: { label: "Severe", uddf: "severe" },
  exhausting: { label: "Exhausting", uddf: "exhausting" },
} as const satisfies Options
export type Workload = keyof typeof workloads

export const thermalComforts = {
  comfortable: { label: "Comfortable", uddf: "comfortable" },
  cold: { label: "Cold", uddf: "cold" },
  veryCold: { label: "Very cold", uddf: "very-cold" },
  hot: { label: "Hot", uddf: "hot" },
} as const satisfies Options
export type ThermalComfort = keyof typeof thermalComforts

export const cylinderMaterials = {
  steel: { label: "Steel", uddf: "steel" },
  aluminium: { label: "Aluminium", uddf: "aluminium" },
} as const satisfies Options
export type CylinderMaterial = keyof typeof cylinderMaterials

// UDDF `environment` on the site. Aquariums go under Other.
export const bodiesOfWater = {
  oceanSea: { label: "Ocean or sea", uddf: "ocean-sea" },
  lakeQuarry: { label: "Lake or quarry", uddf: "lake-quarry" },
  riverSpring: { label: "River or spring", uddf: "river-spring" },
  caveCavern: { label: "Cave or cavern", uddf: "cave-cavern" },
  pool: { label: "Pool", uddf: "pool" },
  hyperbaricChamber: {
    label: "Hyperbaric chamber",
    uddf: "hyperbaric-chamber",
  },
  underIce: { label: "Under ice", uddf: "under-ice" },
  other: { label: "Other", uddf: "other" },
} as const satisfies Options
export type BodyOfWater = keyof typeof bodiesOfWater

// Database only: it picks the water density for depth-to-pressure.
export const waterTypes = {
  salt: { label: "Salt" },
  fresh: { label: "Fresh" },
} as const satisfies Options
export type WaterType = keyof typeof waterTypes

const freshWater: readonly BodyOfWater[] = ["lakeQuarry", "riverSpring", "pool"]

export function defaultWaterType(bodyOfWater?: BodyOfWater): WaterType {
  return bodyOfWater && freshWater.includes(bodyOfWater) ? "fresh" : "salt"
}
