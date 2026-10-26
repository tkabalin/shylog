import { memo } from "react"

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { depth, temperature } from "@/format/figures"

import { clock, rateLabel } from "./format"
import { eventLabel, eventsAt, rate, type ProfileModel } from "./model"

// The chart's table alternative for screen readers: every point it plots,
// with what the crosshair would show there. Memoised, as its thousands of
// rows would otherwise re-render on every crosshair move.
export const ProfileTable = memo(function ProfileTable({
  model,
}: {
  model: ProfileModel
}) {
  return (
    <div className="sr-only">
      <Table>
        <TableCaption>
          Every point of the depth profile, {model.points.length} rows
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Depth (m)</TableHead>
            <TableHead>Water temperature (°C)</TableHead>
            <TableHead>Vertical rate (m/min, ascending positive)</TableHead>
            <TableHead>Event</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {model.points.map((point, i) => (
            <TableRow key={i}>
              <TableCell>{clock(point.time)}</TableCell>
              <TableCell>{depth(point.depth / 1000)}</TableCell>
              <TableCell>
                {point.temperature == null
                  ? "—"
                  : temperature(point.temperature)}
              </TableCell>
              <TableCell>{rateLabel(rate(model.speeds[i].speed))}</TableCell>
              <TableCell>
                {eventsAt(model.events, point.time, model.eventEnd)
                  .map((event) => `${eventLabel(event.type)} alarm`)
                  .join(", ")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
})
