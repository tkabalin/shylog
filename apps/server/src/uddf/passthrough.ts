import { dropUnwritable } from "@shylog/core"
import { DOMParser, XMLSerializer, type Element } from "@xmldom/xmldom"

import { uddfNamespace } from "./shylog-namespace.ts"

// Standard UDDF elements an imported dive held that Shylog doesn't model,
// such as extra sample channels, deco stops and later gas switches, read
// from its import_raw fragment for the export to write back in their places
// (see Standard data is passed through in the spec).

const ns = uddfNamespace

// The children UDDF 3.2.1 allows in each place, in its order. Anything else
// the fragment holds, such as Subsurface's weight under
// informationbeforedive, isn't standard there and isn't written.
export const schemaOrder = {
  informationbeforedive: [
    "link",
    "divenumber",
    "divenumberofday",
    "internaldivenumber",
    "datetime",
    "airtemperature",
    "surfaceintervalbeforedive",
    "altitude",
    "apparatus",
    "platform",
    "purpose",
    "stateofrestbeforedive",
    "tripmembership",
    "alcoholbeforedive",
    "medicalbeforedive",
    "nosuit",
    "price",
    "inputprofile",
    "plannedprofile",
    "surfacepressure",
  ],
  // The registered programs' blocks; Shylog's own is written apart.
  applicationdata: [
    "decotrainer",
    "hargikas",
    "heinrichsweikamp",
    "tausim",
    "tautabu",
  ],
  // Any order (xs:all), so only the names matter.
  informationafterdive: [
    "surfaceintervalafterdive",
    "lowesttemperature",
    "greatestdepth",
    "visibility",
    "current",
    "diveplan",
    "equipmentmalfunction",
    "pressuredrop",
    "problems",
    "program",
    "thermalcomfort",
    "workload",
    "desaturationtime",
    "noflighttime",
    "notes",
    "rating",
    "anysymptoms",
    "diveduration",
    "divetable",
    "equipmentused",
    "globalalarmsgiven",
    "highestpo2",
    "observations",
    "averagedepth",
  ],
  tankdata: [
    "link",
    "tankvolume",
    "tankpressurebegin",
    "tankpressureend",
    "breathingconsumptionvolume",
  ],
  waypoint: [
    "alarm",
    "batterychargecondition",
    "cns",
    "decostop",
    "calculatedpo2",
    "depth",
    "divetime",
    "heading",
    "otu",
    "remainingbottomtime",
    "remainingo2time",
    "setpo2",
    "switchmix",
    "tankpressure",
    "temperature",
    "divemode",
    "gradientfactor",
    "measuredpo2",
    "nodecotime",
  ],
  mix: [
    "name",
    "aliasname",
    "o2",
    "n2",
    "he",
    "ar",
    "h2",
    "priceperlitre",
    "maximumpo2",
    "maximumoperationdepth",
    "equivalentairdepth",
  ],
} as const

// What the writer makes from the dive's own fields, so the hand value is
// the one written; the fragment's copy is left out. Events are stored, so
// alarms are the writer's too.
const modelled = {
  informationbeforedive: [
    "link",
    "divenumber",
    "datetime",
    "surfaceintervalbeforedive",
    "platform",
  ],
  informationafterdive: [
    "lowesttemperature",
    "greatestdepth",
    "visibility",
    "current",
    "program",
    "thermalcomfort",
    "workload",
    "notes",
    "diveduration",
    "equipmentused",
    "observations",
    "averagedepth",
  ],
  tankdata: ["link", "tankvolume", "tankpressurebegin", "tankpressureend"],
  waypoint: ["alarm", "depth", "divetime", "tankpressure", "temperature"],
}

// One element to write, named so the writer can put it in schema order.
export interface Passed {
  name: string
  xml: string
}

export interface PassThrough {
  informationbeforedive: Passed[]
  applicationdata: Passed[]
  informationafterdive: Passed[]
  // Extra children of the dive's tank data, and any further tank data.
  tankdata: Passed[]
  moreTankdata: string[]
  // By sample time.
  waypoints: Map<number, Passed[]>
}

const serializer = new XMLSerializer()

const elements = (parent: Element) =>
  Array.from(parent.childNodes).filter(
    (node): node is Element =>
      node.nodeType === node.ELEMENT_NODE &&
      (node as Element).namespaceURI === ns
  )

// Only elements, attributes and text, as UDDF needs nothing else: xmldom
// writes a comment, processing instruction or CDATA section as it was, and
// the file is someone else's. Layout is dropped, and characters XML can't
// hold, which xmldom decodes from references, as the writer drops them.
function scrub(node: Element) {
  for (const attribute of Array.from(node.attributes)) {
    const value = dropUnwritable(attribute.value)
    if (value !== attribute.value) node.setAttribute(attribute.name, value)
  }
  for (const inner of Array.from(node.childNodes)) {
    if (inner.nodeType === inner.ELEMENT_NODE) {
      scrub(inner as Element)
    } else if (
      (inner.nodeType === inner.TEXT_NODE ||
        inner.nodeType === inner.CDATA_SECTION_NODE) &&
      inner.nodeValue?.trim()
    ) {
      node.replaceChild(
        node.ownerDocument!.createTextNode(dropUnwritable(inner.nodeValue)),
        inner
      )
    } else {
      node.removeChild(inner)
    }
  }
}

// One line of XML, the UDDF namespace left to the export's root, and the
// characters xmldom would read as line ends as references, as the writer's
// own text has them. The namespace comes off the start tag alone, which
// ends at the first ">" since xmldom escapes one in an attribute value.
function serialize(element: Element) {
  const xml = serializer.serializeToString(element)
  const end = xml.indexOf(">")
  return (
    xml.slice(0, end).replace(` xmlns="${ns}"`, "") + xml.slice(end)
  ).replace(/[\r\u0085\u2028\u2029]/g, (c) => `&#${c.charCodeAt(0)};`)
}

// `startMix` is the id of the mix the dive starts on as Shylog has it, and
// `mixId` gives the export's id for any other mix the fragment holds.
export function passThrough(
  fragment: string,
  startMix: string,
  mixId: (mix: Element) => string
): PassThrough {
  const root = new DOMParser().parseFromString(
    fragment,
    "text/xml"
  ).documentElement!
  const mixes = new Map(
    elements(root)
      .filter((found) => found.localName === "mix")
      .map((mix) => [mix.getAttribute("id"), mix])
  )
  const dive = elements(root).find((found) => found.localName === "dive")!
  const child = (parent: Element | undefined, name: string) =>
    parent && elements(parent).filter((found) => found.localName === name)

  // A copy with its layout dropped and its links to mixes remapped. A link
  // to anything else is dropped, and an element that is itself one, such
  // as a gas switch to a mix the file doesn't define, isn't written.
  function cleaned(element: Element, start = false): Element | null {
    const copy = element.cloneNode(true) as Element
    scrub(copy)
    const walk = (node: Element): boolean => {
      for (const inner of Array.from(node.childNodes))
        if (inner.nodeType === inner.ELEMENT_NODE && !walk(inner as Element))
          node.removeChild(inner)
      const ref = node.getAttribute("ref")
      if (ref == null) return true
      const mix = mixes.get(ref)
      if (!mix && !start) return false
      node.setAttribute("ref", start ? startMix : mixId(mix!))
      return true
    }
    return walk(copy) ? copy : null
  }

  function passed(
    parent: Element | undefined,
    place: keyof typeof modelled | "applicationdata",
    start = false
  ): Passed[] {
    if (!parent) return []
    const allowed: readonly string[] = schemaOrder[place]
    const skip: readonly string[] =
      place === "applicationdata" ? [] : modelled[place]
    return elements(parent).flatMap((element) => {
      const name = element.localName!
      if (!allowed.includes(name) || skip.includes(name)) return []
      // The gas the dive starts on is the dive's own, as Shylog has it.
      const copy = cleaned(element, start && name === "switchmix")
      return copy ? [{ name, xml: serialize(copy) }] : []
    })
  }

  const [firstTank, ...otherTanks] = child(dive, "tankdata") ?? []
  const waypoints = new Map<number, Passed[]>()
  for (const waypoint of child(child(dive, "samples")?.[0], "waypoint") ?? []) {
    const time = Number(child(waypoint, "divetime")?.[0]?.textContent)
    // Repeated times were merged on import; their extras are kept once.
    const found = waypoints.get(time) ?? []
    for (const item of passed(waypoint, "waypoint", time === 0))
      if (!found.some((other) => other.xml === item.xml)) found.push(item)
    if (found.length) waypoints.set(time, found)
  }
  return {
    informationbeforedive: passed(
      child(dive, "informationbeforedive")?.[0],
      "informationbeforedive"
    ),
    applicationdata: passed(
      child(dive, "applicationdata")?.[0],
      "applicationdata"
    ),
    informationafterdive: passed(
      child(dive, "informationafterdive")?.[0],
      "informationafterdive"
    ),
    tankdata: passed(firstTank, "tankdata"),
    moreTankdata: otherTanks.flatMap((tank) => {
      const copy = cleaned(tank)
      return copy ? [serialize(copy)] : []
    }),
    waypoints,
  }
}

// A mix the fragment defines, under the id the export gives it, with only
// UDDF's children in UDDF's order.
export function passedMix(mix: Element, id: string) {
  const copy = mix.cloneNode(false) as Element
  copy.setAttribute("id", id)
  const order: readonly string[] = schemaOrder.mix
  for (const name of order)
    for (const found of elements(mix).filter((e) => e.localName === name)) {
      const inner = found.cloneNode(true) as Element
      copy.appendChild(inner)
    }
  scrub(copy)
  return serialize(copy)
}
