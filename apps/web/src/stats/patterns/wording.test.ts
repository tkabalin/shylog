import { describe, expect, it } from "vitest"

import type { Named } from "./catalogue"
import {
  changeWords,
  differenceWords,
  figure,
  habitWords,
  recordWords,
  seasonWords,
  shareWords,
  thresholdWords,
  trendWords,
} from "./wording"

const current: Named = {
  label: "Moderate or stronger",
  phrase: "in moderate or stronger current",
}
const calm: Named = { label: "None to mild", phrase: "in none to mild current" }
const text = (words: string[]) => words.join("")

describe("wording", () => {
  it("describes what the log shows rather than explaining it", () => {
    const sentences = [
      differenceWords("sac", [17.2, 13.3], current),
      differenceWords("maxDepth", [16.1, 20.4], current),
      shareWords(
        "cold",
        [
          { count: 7, total: 10 },
          { count: 2, total: 10 },
        ],
        [current, calm]
      ),
      thresholdWords({ count: 5, total: 5 }, { count: 0, total: 6 }, 16, 20),
      changeWords("sac", 13.1, 15.2, { year: "2026", before: "2025" }),
      changeWords("ascentAlarms", 2.3, 0.5, { later: 21, earlier: 21 }),
      trendWords("sac", 15.2, 12.3, "2026-01-14T09:00:00", "2026"),
      habitWords("site", "Castle Rock", { count: 7, total: 10 }),
      habitWords("buddy", "Sam", { count: 6, total: 10 }),
      seasonWords("Simon's Town", [17.5, 13.5], "March", "August"),
    ].map(text)
    expect(sentences).toEqual([
      "Your SAC rate is 3.9 L/min higher in moderate or stronger current.",
      "You dive 4.3 m shallower in moderate or stronger current.",
      "You felt cold on 70% of dives in moderate or stronger current, against 20% in none to mild current.",
      "You felt cold on all 5 dives below 16 °C, and on none above 20 °C.",
      "Your average SAC rate fell from 15.2 to 13.1 L/min in 2026 against 2025.",
      "Ascent alarms rose from 0.5 to 2.3 a dive over your last 21 dives against the 21 before.",
      "Your SAC rate is down 2.9 L/min since January.",
      "70% of your dives are at Castle Rock.",
      "Sam is on 60% of your dives.",
      "Simon's Town is 4 °C warmer in March than in August.",
    ])
    for (const sentence of sentences)
      expect(sentence).not.toMatch(/because|due to|so that|caus/i)
  })

  it("sets apart a figure that reads on its own", () => {
    expect(differenceWords("sac", [17.2, 13.3], current)[1]).toBe(
      "3.9 L/min higher"
    )
    expect(
      thresholdWords({ count: 5, total: 5 }, { count: 0, total: 6 }, 16, 20)[1]
    ).toBe("cold on all 5 dives below 16 °C")
    expect(
      shareWords(
        "lowVisibility",
        [
          { count: 6, total: 6 },
          { count: 0, total: 9 },
        ],
        [
          { label: "August", phrase: "in August" },
          { label: "Other months", phrase: "in other months" },
        ]
      )
    ).toEqual([
      "Visibility was ",
      "low on all 6 dives",
      " in August, against none in other months.",
    ])
    expect(
      changeWords("ascentAlarms", 2.3, 0.5, { later: 21, earlier: 21 })[1]
    ).toBe("rose from 0.5 to 2.3 a dive")
  })

  it("names the dives once where the group is a kind of dive", () => {
    expect(
      text(
        shareWords(
          "cold",
          [
            { count: 7, total: 10 },
            { count: 2, total: 10 },
          ],
          [
            {
              label: "Dry suit dives",
              phrase: "on dry suit dives",
              dives: "dry suit dives",
            },
            {
              label: "Other dives",
              phrase: "on other dives",
              dives: "other dives",
            },
          ]
        )
      )
    ).toBe(
      "You felt cold on 70% of dry suit dives, against 20% of other dives."
    )
  })

  it("puts a trip in the past tense", () => {
    const trip: Named = {
      label: "On Sodwana 2026",
      phrase: "on Sodwana 2026",
      past: true,
    }
    expect(text(differenceWords("maxDepth", [30.5, 16], trip))).toBe(
      "You dived 14.5 m deeper on Sodwana 2026."
    )
  })

  it("says the difference between the figures it shows", () => {
    // 20.44 and 16.06 show as 20.4 and 16.1, 4.3 apart, though 4.38 apart.
    expect(text(differenceWords("maxDepth", [20.44, 16.06], current))).toBe(
      "You dive 4.3 m deeper in moderate or stronger current."
    )
    // Minutes from seconds: 52.4 and 45.6 min show as 52 and 46.
    expect(text(differenceWords("duration", [3144, 2736], current))).toBe(
      "Your dives are 6 min longer in moderate or stronger current."
    )
    expect(
      text(
        trendWords("ascentAlarms", 0.46, 2.34, "2019-02-10T09:00:00", undefined)
      )
    ).toBe("Ascent alarms are up 1.8 a dive since Feb 2019.")
  })

  it("rounds as the rest of the app does", () => {
    expect(text(seasonWords("Simon's Town", [18.04, 16], "March", "May"))).toBe(
      "Simon's Town is 2 °C warmer in March than in May."
    )
    expect(
      text(seasonWords("Simon's Town", [18.46, 16], "March", "May"))
    ).toContain("2.5 °C")
    expect(
      text(habitWords("site", "Castle Rock", { count: 299, total: 300 }))
    ).toBe("99% of your dives are at Castle Rock.")
    expect(
      text(
        thresholdWords({ count: 4, total: 5 }, { count: 1, total: 6 }, -1, 3)
      )
    ).toBe(
      "You felt cold on 4 of 5 dives below −1 °C, and on 1 of 6 above 3 °C."
    )
    // No alarms reads as none, not 0.0.
    expect(figure("ascentAlarms", 0.02)).toEqual({
      value: "none",
      unit: undefined,
    })
    expect(
      text(
        changeWords("ascentAlarms", 1.2, 0, { year: "2026", before: "2025" })
      )
    ).toBe("Ascent alarms rose from none to 1.2 a dive in 2026 against 2025.")
    const periods = { year: "2026", before: "2025" }
    expect(
      changeWords("nitrox", 1, 0.2, periods, [
        { count: 10, total: 10 },
        { count: 2, total: 10 },
      ])[1]
    ).toBe("rose from 20% to all dives")
    expect(
      changeWords("nitrox", 0, 1, periods, [
        { count: 0, total: 9 },
        { count: 9, total: 9 },
      ])[1]
    ).toBe("fell from all to none")
  })

  it("words the records the Records card doesn't show", () => {
    expect(text(recordWords.month("2026-07", 15))).toBe(
      "Your busiest month was July 2026, with 15 dives."
    )
    expect(text(recordWords.gap(12, "2026-07-01", "2026-07-13"))).toBe(
      "Your longest gap between dives was 12 days, from 1 Jul 2026 to 13 Jul 2026."
    )
    expect(text(recordWords.gap(1, "2026-07-01", "2026-07-02"))).toContain(
      "1 day,"
    )
    expect(text(recordWords.gap(2260, "2019-10-15", "2025-12-22"))).toContain(
      "6 years 2 months"
    )
  })
})
