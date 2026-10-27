import { createReactComponent } from "@tabler/icons-react"

// Icons the boards draw that Tabler doesn't ship, built the way Tabler builds
// its own so they take the same props. Paths are copied from the board named.

// DiveDetailHifi, Conditions: one gentle wave for a calm surface.
export const IconSurfaceCalm = createReactComponent(
  "outline",
  "surface-calm",
  "SurfaceCalm",
  [["path", { d: "M3 12c3 -1.5 6 -1.5 9 0s6 1.5 9 0", key: "svg-0" }]]
)

// DiveDetailHifi, Conditions: a breaking wave for a stormy surface.
export const IconSurfaceStormy = createReactComponent(
  "outline",
  "surface-stormy",
  "SurfaceStormy",
  [
    ["path", { d: "M3 19c3 -2 6 -2 9 0s6 2 9 0", key: "svg-0" }],
    [
      "path",
      {
        d: "M3 14c1.5 -5.5 6.5 -9.5 11.5 -8.5c2.6 .5 4 2.6 3 4.6c-.9 1.8 -3.6 1.6 -3.8 -.3",
        key: "svg-1",
      },
    ],
  ]
)

// EditDiveHifi, Visibility: three rising bars, the unreached ones faint, for
// the Low, Average and High ratings.
const levelBars = (level: 1 | 2 | 3) =>
  [
    ["path", { d: "M6 19v-5", key: "svg-0" }],
    ["path", { d: "M12 19v-9", opacity: level >= 2 ? 1 : 0.3, key: "svg-1" }],
    ["path", { d: "M18 19v-13", opacity: level >= 3 ? 1 : 0.3, key: "svg-2" }],
  ] as Parameters<typeof createReactComponent>[3]

export const IconLevelLow = createReactComponent(
  "outline",
  "level-low",
  "LevelLow",
  levelBars(1)
)
export const IconLevelAverage = createReactComponent(
  "outline",
  "level-average",
  "LevelAverage",
  levelBars(2)
)
export const IconLevelHigh = createReactComponent(
  "outline",
  "level-high",
  "LevelHigh",
  levelBars(3)
)
