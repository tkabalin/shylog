# Statistics

What the Statistics screen shows and how it works it out: the headline figures and charts, SAC rate over time, records and dive-number milestones, and the Patterns engine that turns a log into plain-language findings. The per-dive figures it builds on (SAC rate, water temperature, average depth) are in [calculations.md](calculations.md), the screen's place in the app is in [ui.md](ui.md), and how the log reaches the phone is in [offline-sync.md](offline-sync.md). The full rules, every threshold included, are in [planning/SPEC.md](planning/SPEC.md) under Statistics and Patterns.

Everything on the screen is worked out on the phone from the log it already holds, in `apps/web/src/stats/`. There is no statistics endpoint: the server's job is to store dives, and the phone has every dive anyway.

## The screen

The screen opens on all time, with the dive count and hours at the top. Beside the count, a year chip filters every figure, chart and pattern to one year. The year is kept in the address, so opening a record's dive and coming back keeps it. Dives marked as ignored are left out of everything here, as are the freedives and very short dives an import skips.

| Section                 | What it shows                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Air consumption         | SAC rate per dive over time with a five-dive rolling average, and its distribution behind a tap              |
| Records and averages    | Deepest, longest, coldest and warmest dives, total depth descended, streaks, averages and the next milestone |
| Patterns                | The top three findings, with All patterns on its own screen                                                  |
| Dives per month, year   | A bar per month in a year, or per year for all time, with the diving anniversary under it                    |
| Depth                   | Dives in each depth band: 0 to 10, 10 to 18, 18 to 30 and over 30 m                                          |
| Conditions              | Current, surge, visibility, workload, thermal comfort, weather and surface, each with its most common answer |
| Habits                  | Time of day, entry and gas, answered in a few words ("Mostly mornings")                                      |
| Sites, buddies, regions | Ranked lists, three until Show all                                                                           |
| Tags                    | Dives per tag, each opening the Log filtered to it                                                           |

**Early days.** Below five dives, a chart has too little to show and every pattern would fail its minimums, so the screen shows the totals and records it has, with a note that charts and patterns follow from five dives. A year with fewer than five dives in a bigger log still shows its charts, as the log as a whole is past that stage.

**Averages follow Subsurface.** Average SAC rate is weighted by each dive's duration and leaves out rates of 0.1 L/min or less as bogus, as `process_dive` in Subsurface's `core/statistics.cpp` does, so the figure matches what a diver sees there. Average duration and average maximum depth are plain means.

## SAC rate over time

Air consumption is the figure a diver most wants to see improve, so it leads the screen. Each rated dive is a point, with a rolling average of the last five dives drawn through them, and the card's title says how far that average has moved since the first full window ("1.5 L/min since Dec 2025, now 12.2").

**Dive number by default, dates on request.** A switch beside the chart's key chooses between dives spaced evenly along their numbers and dives placed on a time axis. The chart opens on dive number: on a time axis, a gap of a few years between diving seasons squeezed a whole season into one corner of the chart.

**Outliers are pinned, not plotted.** One dive with a leaking regulator can read twice the usual rate, and on a linear axis it would squash every other dive into a band at the bottom. A rate more than three interquartile ranges above the upper quartile (Tukey's "far out"), and more than twice the median, is drawn as a caret on the top edge with its value. The second test exists because a handful of near-identical rates has no spread to measure from.

**The distribution sits behind a tap.** It shows the weighted average again, the median and standard deviation, and the best and worst dive linked as records are. From five rated dives it adds a histogram in 1 L/min bins with the normal curve for those rates over it, and a box plot on the same axis underneath. The curve is scaled to the dives expected in a 1 L/min window, so a tight spread can't tower over the bars.

## Records and milestones

**Coldest and warmest use the dive's water temperature**, the hand-entered value where there is one and otherwise the computer's minimum. The computer's maximum would be the obvious choice for warmest, but its first samples read near-surface or air temperature, so the warmest dive would be a three-minute dip in 3.9 m of water whose computer peaked at 34 °C. On a tie, the earlier dive holds the record.

**Total depth descended** sums every dive's maximum depth and measures it against a ladder of landmarks: "You've descended Lion's Head", then "twice", "3 times", with progress to the next rung under it. A single landmark gives a figure that either sits at "0.7 times" for a year or runs into the dozens, so the ladder is spaced to pass a new rung every few dozen dives early on and still have something ahead of a very large log.

| Rung                                              | Height    |
| ------------------------------------------------- | --------- |
| Leaning Tower of Pisa                             | 56 m      |
| Eiffel Tower                                      | 330 m     |
| Table Mountain                                    | 1,085 m   |
| Kilimanjaro                                       | 5,895 m   |
| Mount Everest                                     | 8,849 m   |
| Challenger Deep, the bottom of the Mariana Trench | 10,935 m  |
| Olympus Mons, on Mars                             | 21,900 m  |
| The Kármán line, the edge of space                | 100,000 m |

The full ladder has 23 rungs, mixing local South African peaks with world ones. The heights are one ascending list in the code, so a rung can be added without touching the logic.

**Streaks come in two lengths**, since a dive trip and steady local diving build different kinds: the most consecutive diving days, and the most consecutive weeks with a dive. A streak still running says so. **The diving anniversary** gives the years and months since the first dive, and ignores the year filter, as it is about the whole log.

### Dive-number milestones

Some dive counts open doors in diving: enough dives to start Divemaster training, to certify, to qualify as an instructor, and then the recognition levels after that. Shylog marks eight of them.

| Dive | Line                                         |
| ---- | -------------------------------------------- |
| 40   | Can start Divemaster training                |
| 50   | Master Diver                                 |
| 60   | Can qualify as a Divemaster                  |
| 100  | Century diver (can qualify as an instructor) |
| 250  | Elite diver                                  |
| 500  | Gold diver                                   |
| 750  | Platinum diver                               |
| 1000 | Diamond diver                                |

The numbers come from the two big training agencies' published requirements, but the lines name neither: they are there for fun, not as a standard to check against. A count that only one agency uses, such as one agency's 75 dives for its instructor course, was left out, as its line could only speak for that agency.

**The save celebrates it.** Every new dive sends seven small bubbles up from its maximum depth figure, as if breathed out at depth. Saving a milestone dive plays a bigger burst from the bottom of the screen, and the milestone's line unfolds under the dive's number. Only the newest dive in the log can celebrate: back-filling an old logbook dive that the server numbers 40, in a log of 120, hasn't reached anything. A dive saved offline counts by the number the Log shows it with, and celebrates once.

**Statistics shows the next one.** The last row of Records and averages reads like the landmark ladder, "8 dives to dive 60", with a bar for the way from the last milestone passed, and the milestones already passed behind a tap. Milestones follow the whole log's dive numbers, so they show on all time and the current year only: under an earlier year, "next milestone" read as that year's.

## Patterns

The Patterns section shows findings about the diver's own diving, such as "Your SAC rate is 3.9 L/min higher in moderate or stronger current". They come from a fixed catalogue of hand-written rules, not machine learning. With a log of tens or a few hundred dives, a model would find noise; a catalogue of rules that make diving sense, each with a bar it must clear, finds things that are true and says them plainly. The catalogue is deliberately large: every rule is checked on every log, and only those that clear the bar are shown.

### Computing

Each dive takes its effective values, so a hand-entered value beats the computer's, and water temperature is the dive's effective minimum, as the records use. A dive missing a field drops out of every rule that uses it rather than counting as a zero. Visibility logged in metres joins the visibility rating as low (under 5 m), average (5 to 10 m) or high (over 10 m), so the two ways of logging it count together.

### Rule types

| Type       | What it finds                                                                                  | Example                                           |
| ---------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Difference | A measure that differs between groups of a field                                               | SAC rate higher in moderate or stronger current   |
| Threshold  | An outcome that flips at a cut-off of a measurement                                            | Cold on all 5 dives below 16 °C, none above 20 °C |
| Change     | An average or share against the previous year, or the first half of the log against the second | Nitrox on 52 % of dives, up from 10 %             |
| Trend      | The direction of a measure, from a straight-line fit                                           | SAC rate down 2.9 L/min since January             |
| Habit      | A strong concentration in one value                                                            | 70 % of dives at one site                         |
| Season     | Water temperature varying by month within a region                                             | Warmest in March and coldest in August            |
| Record     | Most dives in a month, longest gap between dives                                               | 14 dives in one month                             |

**Difference rules carry most of the catalogue.** SAC rate alone is compared across nineteen fields: current, surge, workload, thermal comfort, depth band, water temperature band, gas, cylinder, time of day, dive of the day, entry, region, dive centre, buddy, and the dry suit, night, drift and photo tags among them. Maximum depth, duration, ascent alarms per dive, feeling cold, visibility, current and surge, and workload each have their own list. Ascent alarms count only dives with a computer profile, since a hand-logged dive can't have had one and counting it as none would pull the average down.

**How a field splits depends on its kind.** A field with an order, such as current from none to strong, is split at every boundary between its levels, so the rule can find "moderate or stronger" against "none to mild" rather than comparing five small groups. A field with no order, such as entry or region, sets one value against all the others. People, dive centres, trips and tags compare the dives with them against the dives without, so "with a buddy" counts every dive that buddy was on, whoever else came.

**Trends fit along dive order, not dates.** The fit spaces dives evenly, as the SAC chart's dive number axis does. Against dates, a gap of years in the log turned a four-minute change in duration either side of it into a steep 26-minute climb. A trend is only checked where the same measure has no qualifying change, as both say which way it went.

### The bar a pattern must clear

Each rule type needs enough dives that one bad day can't make a finding, and each measure needs a difference big enough to matter to a diver.

| Measure       | Smallest difference that counts                  |
| ------------- | ------------------------------------------------ |
| SAC rate      | 1.5 L/min, and 10 % of the lower group's average |
| Maximum depth | 3 m                                              |
| Duration      | 5 minutes                                        |
| Temperature   | 2 °C                                             |
| Ascent alarms | 0.5 per dive                                     |
| Shares        | 20 percentage points                             |

| Rule type        | Dives needed                                             |
| ---------------- | -------------------------------------------------------- |
| Difference       | 5 in each group                                          |
| Threshold        | 4 on each side, with at least 80 % of each side matching |
| Change and trend | 8 in each period                                         |
| Habit            | A share of at least 60 % across at least 10 dives        |
| Season           | 5 with a water temperature in each of two months         |
| Record           | None: records always qualify                             |

SAC rate has a relative minimum as well as a fixed one, because 1.5 L/min is a big change for a diver who breathes 10 L/min and a small one at 25. Where a field can be split several ways, the split with the biggest qualifying difference is used. A threshold scans whole-degree cut-offs and picks the cleanest split: the highest matching share on its weaker side, then on its other side, then the narrowest gap between the two cut-offs.

### Choosing and showing

**Score.** Each qualifying pattern is scored as its effect divided by its minimum, times the square root of the smallest group's dive count. The first part says how far past the bar a finding is; the second weights it by how many dives back it, square-rooted so a large effect on five dives doesn't beat a solid one on fifty. Ties break by rule id, so the selection only changes when the data does.

**The top three are varied and new.** Statistics shows at most one pattern per measure and one per field, so the three don't all say SAC rate. Records, habits and SAC rate over time never lead: records repeat the Records card and habits the Habits answers, and a second figure for SAC over time beside the chart's own five-dive average read as a contradiction. SAC rate against anything else can lead. If nothing qualifies, the section is hidden. All patterns lists every finding on its own screen, grouped by measure, with habits and records last.

**Wording describes rather than explains.** A pattern says "is higher in", never "because of": a log can show that SAC is higher in strong current, but not why. The bold part of each sentence reads on its own, and its figure is the difference between the rounded figures shown under it, never the unrounded one: a sentence that said 4.4 L/min above rows showing 20.4 and 16.1 looked wrong, even though it was right.

**Tapping a pattern shows the evidence.** It opens in place to show the groups behind it, each with its dive count and figure, and a small chart. A difference draws each group's dives in a lane with its average marked, so a gap that six steady dives make reads differently from one that a single bad dive makes. A threshold draws every dive along the water temperature, the cold ones filled, and lists the dives between its cut-offs as left out so the rows add up. A season draws the region's twelve months, with the two it compares in the accent colour.

## Keeping it fast

**Statistics is its own chunk.** The screen's code and its chart library load only when the screen is opened, so the Log, the screen opened most, stays light. The router starts loading the chunk on `pointerdown` on the tab, so a tap rarely waits for it, and the service worker precaches it, so Statistics works offline.

**Figures are cached until the log changes.** The cache is keyed by the in-memory log itself rather than the server's version string, since a dive saved offline changes the log without changing the server's version. The day is part of the key too, as running streaks and the anniversary move with it. Patterns are cached separately by log and year only, as none of them depend on the day; working out the whole catalogue on a 630-dive log takes about 7 ms.

**Differences add each group up once.** A field can split its dives many ways, one per site among them, and walking every dive for every split made the difference rules most of the catalogue's time on a 1000-dive log. Each rule now totals every value of the field in one pass and takes a split's two sides from those totals. A dive's values for a field, and its figure for a measure, are each worked out once and shared by every rule that uses them, as most fields and measures are compared several times. Totals added in another order can differ in their last bits, enough to flip a tie or a minimum, so they only rule splits out, with a bound on that rounding error; the few splits that could still be the answer are walked as before, and the walk decides.

**The slow part was layout, not maths.** The first version took about 550 ms to open with 42 dives and 2.5 s with 630, on a production build. Profiling showed Recharts' grid laying out an x-axis tick per dive just to place vertical grid lines it never drew, measuring each label in the DOM, and each measurement restyled the whole document. Giving the grid an empty set of vertical lines and drawing tick labels as plain text removed the measuring altogether.

**Below the records, the screen paints a frame later.** The header, Air consumption and Records and averages render first; everything below them, Patterns included, renders on the frame after, behind placeholder cards at their final size, so nothing jumps when it lands. With both fixes, a first open takes about 100 ms and a re-open under 60 ms on either log size. Coming back to Statistics from a record's dive restores the scroll position and any rows that were open, which the router's own scroll restore couldn't do while the lower sections were still waiting for their frame.

The bars and strips have a table alternative for screen readers. The SAC trend has none: its table, a row per dive, added about 4,000 elements and a task of 200 to 300 ms at 4x CPU slowdown after every open of a 1000-dive log, and in an app built for one diver the charts' speed comes first.
