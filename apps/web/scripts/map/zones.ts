import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import buffer from "@turf/buffer"
import circle from "@turf/circle"
import difference from "@turf/difference"
import { featureCollection, lineString, polygon } from "@turf/helpers"
import intersect from "@turf/intersect"
import { format, resolveConfig } from "prettier"

// Writes src/map/zones.json, the marine protected areas and zones the dive
// site map draws, from the Government Gazette notices that define them. All
// are WGS 84. Run `pnpm --filter @shylog/web map:zones` after changing one.

type Point = [lon: number, lat: number]

type Zone = {
  id: string
  mpa: string
  // An MPA's outer edge, a no-take zone, where fishing is banned, or a zone
  // with no diving.
  kind: "mpa" | "no-take" | "no-dive"
  // Robben Island's MPA, where you dive only with an authorised business.
  business?: true
  // Its name along its edge, which the map words by kind: an MPA's name,
  // a no-take zone's with "no-take", and "No diving" for the rest.
  label?: string
  // The edge as its notice runs it, from the high-water mark out to sea
  // and back to the shore, or round a zone at sea back to its first point.
  edge: Point[]
  // A stretch another zone already draws, left out of this one's line.
  shared?: [from: number, to: number]
  // How far the fill's closing line runs inland, under the land layer, so
  // the fill reaches the shore where the coast curves inland of it.
  inland?: number
}

// Degrees and decimal minutes as the 2000 and 2004 notices print them,
// 34°06'.590S, with the minute mark before the decimal point.
function dm(lat: string, lon: string): Point {
  const read = (text: string) => {
    const match = /^(\d+)°(\d+)'\.(\d+)([NSEW])$/.exec(text)
    if (!match) throw new Error(`Can't read ${text}`)
    const value = Number(match[1]) + Number(`${match[2]}.${match[3]}`) / 60
    return match[4] === "S" || match[4] === "W" ? -value : value
  }
  return [read(lon), read(lat)]
}

// Table Mountain's northern edge, which Robben Island's southern edge
// meets. GN 774 and R.794 print that edge at 33.9°S, which would draw the
// two 140 m apart, though the declaration says the MPA links to Table
// Mountain's.
const tableMountainNorth = dm("33°54'.075S", "018°15'.000E")[1]

// Robben Island's points in decimal degrees, as R.794's Table 1 prints
// them (X, Y), its southern edge moved onto Table Mountain's.
const robben = Object.fromEntries(
  Object.entries({
    A: [18, -33.75],
    B: [18.4006, -33.75],
    C: [18.4006, -33.9],
    D: [18, -33.9],
    F: [18.25, -33.9],
    G: [18.2717, -33.793056],
    M: [18.3633, -33.815252],
    N: [18.3627, -33.793056],
    O: [18.3633, -33.863333],
    P: [18.2717, -33.863333],
  }).map(([name, [x, y]]) => [name, [x, y === -33.9 ? tableMountainNorth : y]])
) as Record<string, Point>

const zones: Zone[] = [
  // GN R.695 of 4 June 2004, reg 4: from Bailey's Cottage, Muizenberg,
  // round the peninsula to Green Point, then back along the high-water mark.
  {
    id: "table-mountain",
    mpa: "Table Mountain",
    kind: "mpa",
    label: "Table Mountain",
    edge: [
      dm("34°06'.590S", "018°28'.125E"),
      dm("34°06'.590S", "018°33'.413E"),
      dm("34°24'.444S", "018°33'.413E"),
      dm("34°24'.444S", "018°15'.000E"),
      dm("33°54'.075S", "018°15'.000E"),
      dm("33°54'.075S", "018°24'.037E"),
    ],
  },
  // R.695, reg 5(2) to 5(7): the six restricted zones, where fishing is
  // banned and diving is not.
  {
    id: "karbonkelberg",
    mpa: "Table Mountain",
    kind: "no-take",
    label: "Karbonkelberg",
    edge: [
      dm("34°03'.660S", "018°20'.252E"),
      dm("34°03'.660S", "018°17'.797E"),
      dm("33°58'.757S", "018°17'.797E"),
      dm("33°58'.757S", "018°21'.847E"),
    ],
  },
  // Its second line is "south (180°)" in the notice, though its points run
  // about 150°; the points are what count.
  {
    id: "cape-of-good-hope",
    mpa: "Table Mountain",
    kind: "no-take",
    label: "Cape of Good Hope",
    edge: [
      dm("34°12'.271S", "018°22'.194E"),
      dm("34°16'.490S", "018°22'.194E"),
      dm("34°18'.393S", "018°23'.500E"),
      dm("34°18'.393S", "018°24'.258E"),
    ],
    // Hoek van die Bobbejaan reaches 140 m seaward of the closing line.
    inland: 300,
  },
  {
    id: "paulsberg",
    mpa: "Table Mountain",
    kind: "no-take",
    label: "Paulsberg",
    edge: [
      dm("34°16'.549S", "018°28'.464E"),
      dm("34°16'.549S", "018°29'.000E"),
      dm("34°17'.744S", "018°29'.000E"),
      dm("34°17'.744S", "018°28'.020E"),
    ],
    // The shore bulges up to 135 m seaward of the closing line.
    inland: 300,
  },
  {
    id: "castle-rock",
    mpa: "Table Mountain",
    kind: "no-take",
    label: "Castle Rock",
    edge: [
      dm("34°14'.100S", "018°28'.508E"),
      dm("34°14'.100S", "018°29'.300E"),
      dm("34°15'.480S", "018°29'.300E"),
      dm("34°15'.480S", "018°28'.344E"),
    ],
  },
  {
    id: "boulders",
    mpa: "Table Mountain",
    kind: "no-take",
    label: "Boulders",
    edge: [
      dm("34°11'.567S", "018°26'.762E"),
      dm("34°10'.581S", "018°27'.196E"),
      dm("34°10'.581S", "018°27'.781E"),
      dm("34°12'.705S", "018°27'.781E"),
    ],
  },
  // The notice names the bearings of its two lines the wrong way round;
  // the points are what count.
  {
    id: "st-james",
    mpa: "Table Mountain",
    kind: "no-take",
    label: "St James",
    edge: [
      dm("34°07'.123S", "018°27'.568E"),
      dm("34°07'.567S", "018°27'.568E"),
      dm("34°07'.567S", "018°27'.050E"),
    ],
    // The shore between the two tidal pools sits up to 160 m inland.
    inland: 250,
  },
  // GN 774 of 23 May 2019: straight lines joining A, B, C and D. The stretch
  // from C west to F is Table Mountain's northern edge, drawn with it.
  {
    id: "robben-island",
    mpa: "Robben Island",
    kind: "mpa",
    business: true,
    label: "Robben Island",
    edge: ["C", "F", "D", "A", "B", "C"].map((name) => robben[name]),
    shared: [0, 1],
  },
  // R.794 of 2019, Annexure 1: N, G, P, O and M, then back along the
  // island's western high-water mark.
  {
    id: "robben-restricted",
    mpa: "Robben Island",
    kind: "no-dive",
    label: "Robben Island",
    edge: ["N", "G", "P", "O", "M"].map((name) => robben[name]),
    inland: 300,
  },
  // R.1429 of 29 December 2000, para 2(2): due south from beacon B1 at
  // Stony Point and from B4 east of Jock-se-baai to 34°24'.45S.
  {
    id: "bettys-bay",
    mpa: "Betty's Bay",
    kind: "mpa",
    label: "Betty's Bay",
    edge: [
      dm("34°22'.450S", "018°53'.765E"),
      dm("34°24'.450S", "018°53'.765E"),
      dm("34°24'.450S", "018°56'.240E"),
      dm("34°21'.357S", "018°56'.240E"),
    ],
    // Betty's Bay itself reaches 1.6 km inland of the beacons.
    inland: 2000,
  },
]

// A zone that runs to the shore closes along its high-water mark. The fill
// closes along a straight line between its two shore points instead, drawn
// over the land, and pushed further inland where the coast curves away
// from it. The land layer then covers what lies ashore.
function fill(zone: Zone): Point[] {
  const ring = zone.edge
  const [first, last] = [ring[0], ring[ring.length - 1]]
  if (first[0] === last[0] && first[1] === last[1]) return ring
  if (!zone.inland) return [...ring, first]
  // Metres per degree here, so the push is the same distance either way.
  const lat = ((first[1] + last[1]) / 2) * (Math.PI / 180)
  const mx = 111_320 * Math.cos(lat)
  const my = 110_574
  const dx = (last[0] - first[0]) * mx
  const dy = (last[1] - first[1]) * my
  const length = Math.hypot(dx, dy)
  // Of the two sides of the closing line, the one away from the sea.
  const middle = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2]
  const side = Math.sign(
    ring
      .slice(1, -1)
      .reduce(
        (sum, [x, y]) =>
          sum + (x - middle[0]) * mx * dy - (y - middle[1]) * my * dx,
        0
      )
  )
  const nx = (side * dy) / length
  const ny = (-side * dx) / length
  const push = ([x, y]: Point): Point => [
    x - (nx * zone.inland!) / mx,
    y - (ny * zone.inland!) / my,
  ]
  return [...ring, push(last), push(first), first]
}

function line(zone: Zone) {
  if (!zone.shared) return [zone.edge]
  const [from, to] = zone.shared
  return [zone.edge.slice(0, from + 1), zone.edge.slice(to)].filter(
    (part) => part.length > 1
  )
}

// About 10 cm, finer than any of the notices.
const round = (points: Point[] | number[][]) =>
  points.map(([x, y]) => [Number(x.toFixed(6)), Number(y.toFixed(6))])

// Two areas have no line in their notice, only a distance from the shore,
// so they are measured from OpenStreetMap's coastline, which follows the
// high-water mark. Its state on this date, so a rerun to fix one point
// doesn't move the coast.
const osmDate = "2026-11-16T10:27:36Z"

type Way = {
  nodes: number[]
  geometry: { lat: number; lon: number }[]
  tags?: Record<string, string>
}

// Each reply is kept in .cache/ (not committed), as Overpass is often too
// busy to answer a second time.
async function overpass(name: string, query: string): Promise<Way[]> {
  const data = `[out:json][timeout:60][date:"${osmDate}"];${query}out geom;`
  const cached = join(import.meta.dirname, ".cache", `${name}.json`)
  if (existsSync(cached)) {
    const kept = JSON.parse(readFileSync(cached, "utf8")) as {
      data: string
      elements: Way[]
    }
    if (kept.data === data) return kept.elements
  }
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": "map-data-refresh/1.0 (Node.js)" },
    body: new URLSearchParams({ data }),
  })
  if (!response.ok) throw new Error(`${response.status} from Overpass`)
  const { elements, remark } = (await response.json()) as {
    elements: Way[]
    remark?: string
  }
  // A query that runs out of time still answers 200, with a remark.
  if (remark || !elements.length) {
    throw new Error(`Overpass found nothing for ${name}: ${remark ?? query}`)
  }
  mkdirSync(dirname(cached), { recursive: true })
  writeFileSync(cached, JSON.stringify({ data, elements }))
  return elements
}

// OpenStreetMap draws the coast as ways laid end to end with the land on
// their left, so along False Bay's northern shore it runs east, and round
// Cape Point from Olifantsbospunt south and up to Venus Pool. An island's
// ways close into a ring; a small island drawn as one way is left out.
async function coastline(name: string, bbox: string): Promise<Point[]> {
  const ways = (
    await overpass(name, `way["natural"="coastline"](${bbox});`)
  ).filter((way) => way.nodes[0] !== way.nodes.at(-1))
  const next = new Map(ways.map((way) => [way.nodes[0], way]))
  const ends = new Set(ways.map((way) => way.nodes.at(-1)))
  // A ring has no first way, so it starts anywhere and stops back there.
  let way: Way | undefined =
    ways.find((each) => !ends.has(each.nodes[0])) ?? ways[0]
  const seen = new Set<Way>()
  const line: Point[] = []
  while (way && !seen.has(way)) {
    seen.add(way)
    const points = way.geometry.map(({ lat, lon }): Point => [lon, lat])
    line.push(...(line.length ? points.slice(1) : points))
    way = next.get(way.nodes.at(-1)!)
  }
  if (line.length < 2) throw new Error(`No coastline in ${name}`)
  return line
}

// The coast's node nearest a point, which must lie within `within` metres.
function nearest(line: Point[], [x, y]: Point, within = 100) {
  const metres = (point: Point) =>
    Math.hypot(
      (point[0] - x) * 111_320 * Math.cos((y * Math.PI) / 180),
      (point[1] - y) * 110_574
    )
  const index = line.reduce(
    (best, point, i) => (metres(point) < metres(line[best]) ? i : best),
    0
  )
  if (metres(line[index]) > within) throw new Error(`No coast near ${x}, ${y}`)
  return index
}

const strip = (stretch: Point[], km: number) =>
  buffer(lineString(stretch), km, { units: "kilometers", steps: 32 })!

// R.1429, para 2(18): the 500 m out from the high-water mark between lines
// due south of the Eerste and Lourens river mouths. A river's mouth is the
// coast nearest the end of its line, which OpenStreetMap draws downstream;
// the Eerste's ends in its lagoon, 320 m back from the beach.
async function helderberg() {
  const line = await coastline("helderberg-coast", "-34.13,18.68,-34.04,18.88")
  const rivers = await overpass(
    "helderberg-rivers",
    'way["waterway"="river"]["name"~"^(Eerste|Lourens) River$"](-34.12,18.70,-34.0,18.86);'
  )
  const mouth = (river: string) => {
    const ends = rivers
      .filter((each) => each.tags?.name === river)
      .map((each) => each.geometry.at(-1)!)
      .map(({ lon, lat }): Point => [lon, lat])
    if (!ends.length) throw new Error(`No ${river}`)
    return Math.min(...ends.map((end) => nearest(line, end, 400)))
  }
  const [west, east] = [mouth("Eerste River"), mouth("Lourens River")]
  const [x0, x1] = [line[west][0], line[east][0]]
  const between = polygon([
    [
      [x0, -34.75],
      [x1, -34.75],
      [x1, -33.9],
      [x0, -33.9],
      [x0, -34.75],
    ],
  ])
  return intersect(
    featureCollection([strip(line.slice(west, east + 1), 0.5), between])
  )!
}

// The abalone regulations (R.62 of 2008, their areas replaced by R.6795 of
// 7 November 2025) ban diving from Venus Pool round Cape Point to
// Olifantsbospunt up to 2 nautical miles from the high-water mark, except
// from the shore within 1, and leave 300 m round Bellows Rock out.
const venusPool: Point = [18.466912, -34.295733]
const olifantsbospunt: Point = [18.380367, -34.271667]
const bellowsRock: Point = [18.490667, -34.389167]
const nauticalMile = 1.852

async function abaloneBands() {
  const line = await coastline("cape-point-coast", "-34.40,18.34,-34.24,18.52")
  const stretch = line.slice(
    nearest(line, olifantsbospunt),
    nearest(line, venusPool) + 1
  )
  // At Olifantsbospunt the area's edge runs west, at Venus Pool east, so
  // nothing north of either counts. The step between them is ashore.
  const [west, east] = [olifantsbospunt[1], venusPool[1]]
  const south = polygon([
    [
      [17.9, west],
      [18.43, west],
      [18.43, east],
      [19, east],
      [19, -34.75],
      [17.9, -34.75],
      [17.9, west],
    ],
  ])
  const within = (miles: number) =>
    intersect(featureCollection([strip(stretch, miles * nauticalMile), south]))!
  const bellows = circle(bellowsRock, 0.3, { units: "kilometers", steps: 32 })
  const [one, two] = [within(1), within(2)]
  return {
    shore: difference(featureCollection([one, bellows]))!,
    none: difference(featureCollection([two, one, bellows]))!,
    // Half a mile out, where the inner band's words run, in the gap
    // between the hatching and the shore.
    middle: within(0.5),
  }
}

// A polygon, or several where the cuts split one.
type Area = NonNullable<ReturnType<typeof difference>>
const shape = (feature: Area) =>
  feature.geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: feature.geometry.coordinates.map(round) }
    : {
        type: "MultiPolygon",
        coordinates: feature.geometry.coordinates.map((part) =>
          part.map(round)
        ),
      }
// Every ring of one, as the lines of its edge.
const rings = (feature: Area) =>
  (feature.geometry.type === "Polygon"
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flat()
  ).map(round)

// The shore band's ends, where it is cut due west and east: the only part
// of its edge that the hatching's outline doesn't draw or the land hide.
const ends = (feature: Area) =>
  rings(feature).flatMap((ring) =>
    ring
      .slice(1)
      .flatMap((point, i) =>
        [olifantsbospunt[1], venusPool[1]].some((lat) =>
          [ring[i], point].every(([, y]) => Math.abs(y - lat) < 1e-6)
        )
          ? [[ring[i], point]]
          : []
      )
  )

// R.6795's area 6: Robben Island out to 1 nautical mile. Its MPA already
// has you scuba dive only with a business; this also bans snorkelling and
// freediving, and dive gear on a boat without a permit.
async function robbenRing() {
  const island = await coastline("robben-coast", "-33.84,18.34,-33.78,18.40")
  return buffer(polygon([island]), nauticalMile, {
    units: "kilometers",
    steps: 32,
  })!
}

const [bands, helderbergBand, ring] = [
  await abaloneBands(),
  await helderberg(),
  await robbenRing(),
]
const ringZone = {
  id: "robben-abalone",
  mpa: "Robben Island",
  kind: "no-snorkel",
  label: "No snorkelling",
}

const properties = ({ id, mpa, kind, business, label }: Zone) => ({
  id,
  mpa,
  kind,
  ...(business ? { business } : {}),
  ...(label ? { label } : {}),
})
const helderbergZone = {
  id: "helderberg",
  mpa: "Helderberg",
  kind: "mpa",
  label: "Helderberg",
}
const output = {
  fills: {
    type: "FeatureCollection",
    features: [
      ...zones.map((zone) => ({
        type: "Feature",
        properties: properties(zone),
        geometry: { type: "Polygon", coordinates: [round(fill(zone))] },
      })),
      {
        type: "Feature",
        properties: helderbergZone,
        geometry: shape(helderbergBand),
      },
      { type: "Feature", properties: ringZone, geometry: shape(ring) },
      // Their whole outline is drawn under the land, which hides the
      // stretches ashore, as they have no edge of their own at sea.
      {
        type: "Feature",
        properties: {
          id: "cape-point-no-dive",
          mpa: "Table Mountain",
          kind: "no-dive",
          outline: true,
        },
        geometry: shape(bands.none),
      },
      {
        type: "Feature",
        properties: {
          id: "cape-point-shore-only",
          mpa: "Table Mountain",
          kind: "shore-only",
          outline: true,
        },
        geometry: shape(bands.shore),
      },
    ],
  },
  edges: {
    type: "FeatureCollection",
    features: [
      ...zones.map((zone) => ({
        type: "Feature",
        properties: properties(zone),
        geometry: {
          type: "MultiLineString",
          coordinates: line(zone).map(round),
        },
      })),
      // All of it, as the land drawn over the edges hides the inland half.
      {
        type: "Feature",
        properties: helderbergZone,
        geometry: {
          type: "MultiLineString",
          coordinates: rings(helderbergBand),
        },
      },
      {
        type: "Feature",
        properties: ringZone,
        geometry: { type: "MultiLineString", coordinates: rings(ring) },
      },
      // Not drawn: only the line the inner band's words follow, which the
      // land hides ashore too.
      {
        type: "Feature",
        properties: {
          id: "cape-point-shore-only",
          mpa: "Table Mountain",
          kind: "shore-only",
          label: "Shore dives only",
        },
        geometry: {
          type: "MultiLineString",
          coordinates: rings(bands.middle),
        },
      },
      // Dotted from the shore out to the hatching, so the band reads as
      // closed at both ends.
      {
        type: "Feature",
        properties: {
          id: "cape-point-shore-only",
          mpa: "Table Mountain",
          kind: "shore-only-end",
        },
        geometry: { type: "MultiLineString", coordinates: ends(bands.shore) },
      },
    ],
  },
}

const path = join(import.meta.dirname, "../../src/map/zones.json")
writeFileSync(
  path,
  await format(JSON.stringify(output), {
    ...(await resolveConfig(path)),
    filepath: path,
  })
)
console.log(`Wrote ${zones.length + 4} zones to ${path}`)
