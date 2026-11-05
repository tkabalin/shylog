import type { Extras } from "./convert.ts"

// Invented dives in the shape of the export job's CSV, which prefixes every
// SSI column with odin_user_log_ and writes gappy codes as floats.
export function csv(rows: Record<string, string>[]) {
  const names = [...new Set(rows.flatMap(Object.keys))]
  const quote = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
  return [
    names.map((name) => `odin_user_log_${name}`).join(","),
    ...rows.map((row) => names.map((name) => quote(row[name] ?? "")).join(",")),
  ].join("\n")
}

export const shore = {
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
export const boat = {
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
export const freedive = {
  ...shore,
  id: "103",
  nr: "1",
  dive_type: "6",
  datetime: "2025-12-08 11:09",
}

export const extras: Extras = {
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
