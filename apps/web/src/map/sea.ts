// The sea's colour as oklch lightness, chroma and hue: the map's style
// draws it, and the Explore tab shows it while MapLibre loads, so that
// imports this alone rather than the style and its zones.
export const sea = {
  light: [0.905, 0.032, 222],
  dark: [0.2, 0.022, 232],
} as const
