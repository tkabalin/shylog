// The fixed tag list. Dives store the key, so a label can change here without
// touching data; removing a key needs a migration that maps or drops it.
export const tags = {
  altitude: { label: "Altitude" },
  cave: { label: "Cave" },
  cavern: { label: "Cavern" },
  cleanUp: { label: "Clean-up" },
  drift: { label: "Drift" },
  drySuit: { label: "Dry suit" },
  ice: { label: "Ice" },
  night: { label: "Night" },
  pelagic: { label: "Pelagic" },
  photoVideo: { label: "Photo/video" },
  searchAndRecovery: { label: "Search and recovery" },
  wreck: { label: "Wreck" },
} as const
export type Tag = keyof typeof tags
