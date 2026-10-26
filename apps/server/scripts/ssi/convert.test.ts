import { DOMParser, type Element } from "@xmldom/xmldom"
import { describe, expect, it } from "vitest"

import {
  convertSsi,
  generatorName,
  shylogNamespace,
  type Extras,
} from "./convert.ts"
import { readCsv } from "./csv.ts"

// Invented dives in the shape of the export job's CSV, which prefixes every
// SSI column with odin_user_log_ and writes gappy codes as floats.
const uddf = "http://www.streit.cc/uddf/3.2/"

function csv(rows: Record<string, string>[]) {
  const names = [...new Set(rows.flatMap(Object.keys))]
  const quote = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
  return [
    names.map((name) => `odin_user_log_${name}`).join(","),
    ...rows.map((row) => names.map((name) => quote(row[name] ?? "")).join(",")),
  ].join("\n")
}

const shore = {
  id: "101",
  nr: "1",
  dive_type: "0",
  datetime: "2025-11-09 08:47",
  dive_sites_id: "11",
  dive_sites_name: "Kelp Point",
  divetime: "46",
  depth_m: "5.3",
  avg_depth_m: "4.1",
  watertemp_c: "12.0",
  watertemp_max_c: "13.0",
  vis_m: "5.0",
  weight_kg: "6.0",
  tank_vol_l: "12.0",
  var_tanktype_id: "19.0",
  pressure_start_bar: "220.0",
  pressure_end_bar: "60.0",
  ean: "0",
  ean_percent: "0",
  var_divetype_id: "23.0",
  var_water_body_id: "13.0",
  var_entry_id: "21",
  var_current_id: "7",
  var_surface_id: "10",
  var_weather_id: "1.0",
  var_specialdive_id: "126",
  buddy_names: "Alex Example, Sam van Example",
  comment: 'Cold, "green" water\nsecond line',
}
const boat = {
  ...shore,
  id: "102",
  nr: "2",
  datetime: "2025-11-10 10:00",
  dive_sites_id: "12",
  dive_sites_name: "Reef I &amp; J",
  ean: "1",
  ean_percent: "32",
  var_divetype_id: "24.0",
  var_entry_id: "22",
  var_specialdive_id: "40,28",
  buddy_names: "Pat Guide",
  comment: "",
  gear_details: "Overweighted",
}
const freedive = {
  ...shore,
  id: "103",
  nr: "1",
  dive_type: "6",
  datetime: "2025-12-08 11:09",
}

const extras: Extras = {
  sites: {
    "Kelp Point": { country: "ZA", region: "False Bay" },
    "Reef I & J": { country: "ZA", region: "Sodwana" },
  },
  leaveOutPeople: ["Pat Guide"],
  dives: {
    "2025-11-09 08:47": {
      startTime: "2025-11-09T08:45",
      trainingCourse: "Open Water Diver",
      tags: ["photoVideo"],
    },
  },
}

function convert(rows = [shore, boat, freedive], extra = extras) {
  const result = convertSsi(csv(rows), extra)
  const root = new DOMParser().parseFromString(
    result.xml,
    "text/xml"
  ).documentElement!
  return { ...result, root }
}

const all = (parent: Element, name: string, ns = uddf) =>
  Array.from(parent.getElementsByTagNameNS(ns, name))
const text = (parent: Element, name: string, ns = uddf) =>
  all(parent, name, ns).map((node) => node.textContent)

describe("readCsv", () => {
  it("reads quoted commas, quotes and newlines", () => {
    expect(readCsv('a,b\r\n"x, ""y""","1\n2"\n3,\n')).toEqual([
      { a: 'x, "y"', b: "1\n2" },
      { a: "3", b: "" },
    ])
  })
})

describe("convertSsi", () => {
  it("writes scuba dives and leaves out freedives", () => {
    const { dives, freedives, root } = convert()
    expect([dives, freedives]).toEqual([2, 1])
    expect(text(root, "name")[0]).toBe(generatorName)
    expect(all(root, "dive").map((dive) => dive.getAttribute("id"))).toEqual([
      "dive-ssi-101",
      "dive-ssi-102",
    ])
  })

  it("converts to UDDF's units with local times and no offset", () => {
    const [dive] = all(convert().root, "dive")
    expect(text(dive!, "datetime")).toEqual(["2025-11-09T08:45:00"])
    expect(text(dive!, "diveduration")).toEqual(["2760"])
    expect(text(dive!, "greatestdepth")).toEqual(["5.3"])
    expect(text(dive!, "averagedepth")).toEqual(["4.1"])
    expect(text(dive!, "lowesttemperature")).toEqual(["285.15"])
    expect(text(dive!, "tankvolume")).toEqual(["0.012"])
    expect(text(dive!, "tankpressurebegin")).toEqual(["22000000"])
    expect(text(dive!, "tankpressureend")).toEqual(["6000000"])
    expect(text(dive!, "leadquantity")).toEqual(["6"])
    expect(text(dive!, "visibility")).toEqual(["5"])
  })

  it("maps SSI's codes to UDDF's values and Shylog's keys", () => {
    const [training, fun] = all(convert().root, "dive")
    expect(text(training!, "platform")).toEqual(["beach-shore"])
    expect(text(training!, "current")).toEqual(["mild-current"])
    expect(text(training!, "program")).toEqual(["training"])
    expect(text(fun!, "platform")).toEqual(["small-boat"])
    expect(text(fun!, "program")).toEqual(["recreation"])
    const shylog = (dive: Element) => all(dive, "shylog", shylogNamespace)[0]!
    const own = (dive: Element, name: string) =>
      text(shylog(dive), name, shylogNamespace)
    expect(own(training!, "surface")).toEqual(["calm"])
    expect(own(training!, "weather")).toEqual(["cloudless"])
    expect(own(training!, "maxTemperature")).toEqual(["286.15"])
    expect(own(training!, "trainingAgency")).toEqual(["SSI"])
    expect(own(training!, "trainingCourse")).toEqual(["Open Water Diver"])
    expect(own(training!, "tag")).toEqual(["photoVideo"])
    // Deep (28) is dropped; night (40) is a tag.
    expect(own(fun!, "tag")).toEqual(["night"])
    expect(own(fun!, "trainingAgency")).toEqual([])
    expect(own(fun!, "gearDetails")).toEqual(["Overweighted"])
  })

  it("groups cylinders and gases, with air as 0.21", () => {
    const { root } = convert()
    expect(all(root, "tank").map((tank) => tank.getAttribute("id"))).toEqual([
      "tank-steel-12000",
    ])
    expect(text(root, "tankmaterial")).toEqual(["steel"])
    expect(text(root, "o2")).toEqual(["0.21", "0.32"])
    const [first, second] = all(root, "tankdata").map((data) =>
      all(data, "link").map((link) => link.getAttribute("ref"))
    )
    expect(first).toEqual(["tank-steel-12000", "mix-210"])
    expect(second).toEqual(["tank-steel-12000", "mix-320"])
  })

  it("writes sites with their region and country, unescaping SSI's HTML", () => {
    const { root } = convert()
    const sites = all(root, "site")
    expect(sites.map((site) => text(site, "name")[0])).toEqual([
      "Kelp Point",
      "Reef I & J",
    ])
    expect(text(sites[1]!, "location")).toEqual(["Sodwana"])
    expect(text(sites[1]!, "country")).toEqual(["ZA"])
    expect(text(sites[1]!, "environment")).toEqual(["ocean-sea"])
  })

  it("links buddies and leaves out the people the extras name", () => {
    const { root } = convert()
    const buddies = all(root, "buddy")
    expect(
      buddies.map((buddy) => [
        text(buddy, "firstname")[0],
        text(buddy, "lastname")[0],
      ])
    ).toEqual([
      ["Alex", "Example"],
      ["Sam", "van Example"],
    ])
    const [first, second] = all(root, "informationbeforedive").map((info) =>
      all(info, "link").map((link) => link.getAttribute("ref"))
    )
    expect(first).toEqual(["site-ssi-11", "person-1", "person-2"])
    expect(second).toEqual(["site-ssi-12"])
  })

  it("keeps a multi-line comment as the dive's notes", () => {
    const [dive] = all(convert().root, "dive")
    expect(text(dive!, "para")).toEqual(['Cold, "green" water\nsecond line'])
  })

  it("is the same on every run", () => {
    expect(convert().xml).toBe(convert().xml)
  })

  it("refuses a code it doesn't know, naming the dive", () => {
    expect(() => convert([{ ...shore, var_current_id: "5" }])).toThrow(
      "SSI dive 1 (2025-11-09 08:47, Kelp Point): unknown var_current_id code 5"
    )
    expect(() => convert([{ ...boat, var_specialdive_id: "999" }])).toThrow(
      "unknown special dive code 999"
    )
    expect(() => convert([{ ...shore, dive_type: "3" }])).toThrow(
      "unknown log type 3"
    )
  })

  it("refuses unmapped sites and extras that match no dive", () => {
    expect(() => convert([shore, boat], { ...extras, sites: {} })).toThrow(
      'Site "Reef I & J" is missing'
    )
    expect(() => convert([boat])).toThrow(
      "names a dive at 2025-11-09 08:47, which isn't in the CSV"
    )
  })

  it("refuses a course on a dive that isn't training", () => {
    expect(() =>
      convert([shore, boat], {
        ...extras,
        dives: { "2025-11-10 10:00": { trainingCourse: "Deep" } },
      })
    ).toThrow("a course on a dive that isn't training")
  })

  it("refuses temperatures out of order, unless the extras correct them", () => {
    const swapped = { ...boat, watertemp_c: "17.0", watertemp_max_c: "16.0" }
    expect(() => convert([shore, swapped])).toThrow(
      "water temperature minimum above maximum"
    )
    const { root } = convert([shore, swapped], {
      ...extras,
      dives: {
        ...extras.dives,
        "2025-11-10 10:00": { minTemperature: 16, maxTemperature: null },
      },
    })
    const fun = all(root, "dive")[1]!
    expect(text(fun, "lowesttemperature")).toEqual(["289.15"])
    expect(text(fun, "maxTemperature", shylogNamespace)).toEqual([])
  })
})
