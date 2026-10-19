// Seconds on the site's wall clock, for the gaps between dives. Date.UTC is
// only arithmetic here: the time has no zone, and none is applied.
export function localSeconds(startTime: string): number {
  const [date, time] = startTime.split("T")
  const [year, month, day] = date.split("-").map(Number)
  const [hours, minutes, seconds] = time.split(":").map(Number)
  return Date.UTC(year, month - 1, day, hours, minutes, seconds) / 1000
}
