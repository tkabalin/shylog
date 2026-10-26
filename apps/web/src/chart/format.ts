// Elapsed time in the dive as m:ss, for the readout, alarms and table.
export function clock(seconds: number) {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

// A vertical rate in m/min with its sign, "+3.4", "−9.1" or "0.0", with a
// real minus sign; positive is ascending.
export function rateLabel(metresPerMinute: number) {
  const text = Math.abs(metresPerMinute).toFixed(1)
  if (text === "0.0") return text
  return `${metresPerMinute > 0 ? "+" : "−"}${text}`
}

// A card-coloured outline under each chart label, so it reads over the line
// and the crosshair under it.
export const halo =
  "stroke-card stroke-3 [paint-order:stroke] [stroke-linejoin:round]"
