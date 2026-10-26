import type {
  BodyOfWater,
  CylinderMaterial,
  Current,
  DiveType,
  Entry,
  Surface,
  Tag,
  Weather,
} from "@shylog/core"

// MySSI's numeric codes, read off the owner's dives in the app in October
// 2026. A code missing here stops the conversion rather than being guessed.

// `odin_user_log_dive_type`: 0 is a scuba log and 6 the freediving log,
// which Shylog leaves out.
export const scubaLog = "0"
export const freediveLog = "6"

// SSI's Education and Fun dives.
export const diveTypes: Record<string, DiveType> = {
  "23": "training",
  "24": "recreation",
}

// SSI's four levels: none, light, strong and ripping. Surge stays blank,
// since SSI logs the two together.
export const currents: Record<string, Current> = {
  "6": "none",
  "7": "mild",
  "8": "hard",
  "9": "veryHard",
}

export const surfaces: Record<string, Surface> = {
  "10": "calm",
  "11": "moving",
  "12": "stormy",
}

export const weathers: Record<string, Weather> = {
  "1": "cloudless",
  "2": "cloudy",
  "3": "rainy",
}

// SSI's shore, boat and other. Every boat dive so far was from a small boat.
export const entries: Record<string, Entry> = {
  "21": "beachShore",
  "22": "smallBoat",
  "35": "other",
}

// SSI's ocean and confined water; the confined dives were aquarium tanks,
// which Shylog files under Other.
export const bodiesOfWater: Record<string, BodyOfWater> = {
  "13": "oceanSea",
  "53": "other",
}

// From the export job's own table.
export const cylinderMaterials: Record<string, CylinderMaterial> = {
  "19": "steel",
  "20": "aluminium",
}

// Special dive codes: a tag, or null for codes Shylog has no use for (the
// course skills, and deep, which is a filter on max depth instead).
export const specialDives: Record<string, Tag | null> = {
  "40": "night",
  "47": "wreck",
  "149": "searchAndRecovery",
  "25": null,
  "26": null,
  "28": null,
  "30": null,
  "32": null,
  "43": null,
  "126": null,
  "152": null,
  "156": null,
}
