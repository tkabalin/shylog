// The dive numbers a save celebrates with the full burst of bubbles, each
// with a line saying what it means: the doors on the way to Divemaster and
// instructor, then recognition levels. No agency is named, as the lines
// are for fun rather than a standard to check against.
const milestones = [
  { number: 40, line: "Can start Divemaster training" },
  { number: 50, line: "Master Diver" },
  { number: 60, line: "Can qualify as a Divemaster" },
  { number: 100, line: "Century diver (can qualify as an instructor)" },
  { number: 250, line: "Elite diver" },
  { number: 500, line: "Gold diver" },
  { number: 750, line: "Platinum diver" },
  { number: 1000, line: "Diamond diver" },
] as const

export const milestoneFor = (number: number | null | undefined) =>
  milestones.find((milestone) => milestone.number === number) ?? null
