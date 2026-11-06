import type {
  BodyOfWater,
  CylinderMaterial,
  Current,
  DiveType,
  Entry,
  Surface,
  Surge,
  VisibilityRating,
  WaterType,
  Weather,
} from "@shylog/core"

// The PADI app's values, as its logbook API returns them, read off a real
// export in November 2026. A value missing here stops the conversion rather
// than being guessed.

export const diveTypes: Record<string, DiveType> = {
  Recreational: "recreation",
}

export const entries: Record<string, Entry> = {
  BeachShore: "beachShore",
}

export const bodiesOfWater: Record<string, BodyOfWater> = {
  Ocean: "oceanSea",
  Lake: "lakeQuarry",
}

export const waterTypes: Record<string, WaterType> = {
  Salt: "salt",
  Fresh: "fresh",
}

export const currents: Record<string, Current> = {
  NoCurrent: "none",
  SomeCurrent: "mild",
}

export const surges: Record<string, Surge> = {
  NoSurge: "none",
  SomeSurge: "mild",
  MediumSurge: "moderate",
  BigSurge: "hard",
}

// Shylog's surface has three states, so small and medium waves are both a
// moving surface.
export const surfaces: Record<string, Surface> = {
  NoWaves: "calm",
  SmallWaves: "moving",
  MediumWaves: "moving",
  LargeWaves: "stormy",
}

// Fog has no weather of its own in Shylog (or UDDF); it's an overcast sky.
export const weathers: Record<string, Weather> = {
  Sunny: "cloudless",
  "Partly Cloudy": "cloudy",
  Cloudy: "cloudy",
  Foggy: "cloudy",
  Rainy: "rainy",
}

export const visibilityRatings: Record<string, VisibilityRating> = {
  Low: "low",
  Average: "average",
  High: "high",
}

export const cylinderMaterials: Record<string, CylinderMaterial> = {
  Steel: "steel",
  Aluminium: "aluminium",
}

// Suits and extras go into the gear details as words.
export const suits: Record<string, string> = {
  FullSuit_5mm: "5 mm full suit",
}

export const extraGear: Record<string, string> = {
  Hood: "hood",
  Gloves: "gloves",
  Boots: "boots",
}
