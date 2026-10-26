import { depthAxis, type AxisOptions } from "@shylog/core"

// The Profile card's fixed sizes in px, outside the chart's lazy chunk so
// the card can hold its height while the chunk and samples load, and the
// Log's sparklines can share the chart's depth scale.

// The depth chart is the board's 200 px: a band above the plot for event
// markers, then the plot, then the time labels. The depth labels sit in a
// gutter left of the plot, where a steep descent would otherwise run under
// them (the board draws them inside).
export const chartHeight = 200
export const plotTop = 18
export const timeAxisHeight = 30
export const plotHeight = chartHeight - plotTop - timeAxisHeight
export const plotLeft = 30

// Axis labels are 10 px Geist. Subsurface spaces ticks and labels by the
// size of its widest label ("999" for depth, "99.99" for time).
export const labelHeight = 12
export const depthLabelWidth = 18
export const timeLabelWidth = 28

export const readoutHeight = 44
export const laneHeaderHeight = 16
// The lane's line runs between these insets, leaving room above it for the
// labelled temperatures.
export const laneHeight = 40
export const laneTop = 14
export const laneBottom = 6
export const alarmsHeaderHeight = 33
export const alarmRowHeight = 56

// The depth axis for a deepest point in mm: zoomed to the dive on the
// detail chart, from 30 m on the Log's sparklines. Ticks are spaced for the
// card's plot unless given another height (the full-screen chart's).
export const chartDepthAxis = (
  deepest: number,
  { height = plotHeight, ...options }: AxisOptions & { height?: number } = {}
) => depthAxis(deepest, height, labelHeight, options)
