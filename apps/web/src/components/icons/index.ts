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
