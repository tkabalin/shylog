# Calculations

How Shylog works out the figures a diver reads off a dive: SAC rate, MOD and maximum PO₂, CNS and OTU, average depth, surface interval, vertical rate and the safety stop, how the profile chart is built from the same rules, and the no-stop times and best mix that You's dive planning tools show. The units these work in are in [data-model.md](data-model.md), the dive computer data they start from is in [import.md](import.md), and the figures they feed on the Statistics screen are in [statistics.md](statistics.md). The formulas and every rounding step are in the full spec, [planning/SPEC.md](planning/SPEC.md), under Calculations and Profile chart.

All of it lives in `packages/core/src/calc/`, so the phone and the server run the same code: the phone works out SAC and MOD as a dive is typed, and the server works out CNS, OTU, average depth, surface intervals and the safety stop when a dive's samples are written, and stores them on the dive.

## Following Subsurface

[Subsurface](https://github.com/subsurface/subsurface) is the established open-source desktop dive log, and its UDDF export is one of the two ways dive computer data reaches Shylog. It has already solved these problems, and a diver who checks a dive in both apps should see the same numbers. So rather than invent a method, each calculation follows Subsurface's own function, statement by statement, including its integer arithmetic and its rounding.

That means working in whole millimetres and whole millibar, as Subsurface does. Depth becomes pressure through `calculate_depth_to_mbarf`: the surface pressure plus depth times water density, where salt water is 10,300 grams per 10 litres and fresh 10,000. Surface pressure comes from the dive computer's export when it has one, so altitude dives work, and otherwise is 1,013 mbar. Anything shallower than 0.75 m counts as the surface. Ambient pressures and PO₂ values are rounded to the mbar at the same points Subsurface rounds them, because a figure that is right to four decimals but rounds differently would still show a different number on screen.

| Figure                      | Subsurface's function                            | Worked out by        |
| --------------------------- | ------------------------------------------------ | -------------------- |
| SAC rate                    | `calculate_sac` (`core/divelist.cpp`)            | Phone, as you type   |
| MOD                         | `gas_mod` (`core/dive.cpp`)                      | Phone                |
| Max PO₂                     | `calculate_depth_to_mbarf`                       | Phone                |
| CNS, with carry-over        | `calculate_cns_dive`, `calculate_cns`            | Server, from samples |
| OTU                         | `calculate_otu`                                  | Server, from samples |
| Time under water, avg depth | `fixup_dc_duration` (`core/divecomputer.cpp`)    | Server, from samples |
| Surface interval            | `get_surface_interval`                           | Server               |
| Vertical rate               | `analyze_plot_info` (`core/profile.cpp`)         | Phone, on the chart  |
| Safety stop                 | None: Shylog's own rule                          | Server, from samples |
| No-stop time (Bühlmann)     | `plan` in Recreational mode (`core/planner.cpp`) | Phone, in the tools  |
| Best mix for a depth        | `best_o2` (`core/dive.cpp`)                      | Phone, in the tools  |

## SAC rate

SAC rate is the gas a diver breathes per minute, scaled back to the surface, so dives at different depths can be compared. The naive version multiplies the cylinder's volume by the pressure drop, but air is not an ideal gas: a full cylinder at 200 bar holds a few per cent less than that, so an ideal-gas SAC reads high. Subsurface corrects for this with a cubic virial fit for the compressibility factor Z of oxygen and nitrogen, and Shylog uses the same fit. Each pressure becomes litres at 1 atm, rounded to the millilitre, the difference is divided by the duration and by the ambient pressure at the average depth, and the result is rounded to the millilitre per minute.

**Nitrox affects SAC only through Z.** A cylinder of 32 % nitrox compresses slightly differently from air, so the SAC for a nitrox dive needs its oxygen fraction. On the dive form, SAC stays hidden until the mix is entered, rather than showing an approximate figure as if the dive were on air: a number that is quietly a little wrong is worse than one that appears a moment later.

**A hand-entered value wins.** Subsurface always takes duration and average depth from the samples. Shylog takes them from the samples too, unless the diver typed their own, because everywhere else in the app a hand-entered value beats the computer's. The server stores the samples' figures on the dive, so the phone can work out SAC without downloading the profile.

## MOD and max PO₂

The maximum operating depth is how deep a gas can be breathed before its oxygen partial pressure passes a limit. Shylog follows `gas_mod` in integer arithmetic, and keeps Subsurface's rounding rule (round down, except within 0.01 m of the next step) but applies it at 0.1 m rather than 1 m. Subsurface's cylinder table shows 33 m for 32 % nitrox at 1.4 bar; Shylog shows 33.2 m, as a diver planning to the limit wants the extra 20 cm. `gas_mod` already takes the rounding step as an argument, so this is the same function called with 100 mm instead of 1000.

The PO₂ limit is 1.4 bar by default, not Subsurface's 1.6. It is a setting for the whole log, and it should match the dive computer's own alarm, so that Shylog flags a dive as over the limit exactly when the computer did. Max PO₂ assumes the dive's one gas was breathed at its deepest point, and is highlighted when it passes the setting.

## CNS and OTU

CNS and OTU track oxygen exposure: CNS as a percentage of a daily limit, OTU as a measure of lung exposure. The Suunto D4i shows both but leaves them out of its export, so the server works them out from the profile. Both walk the samples segment by segment, with the PO₂ at each end. CNS uses Subsurface's two-line fit to the log of the NOAA table, and OTU a third-order approximation of Baker's equation for changing PO₂. Subsurface truncates the segment's mean PO₂ and scaled time to whole numbers, so Shylog does too.

**CNS carries over between dives.** Shylog walks back through earlier dives for as long as each ended within 12 hours of the next one starting, then walks forward, halving the running total for every 90 minutes at the surface and adding each dive's own CNS. A dive in a trip only counts other dives from the same trip, as Subsurface does. Because of this, an edit to one dive can change the CNS of every dive after it, so the server recalculates the later dives in the same transaction.

## Average depth and surface interval

**Time under water and average depth** come from `fixup_dc_duration`: the time-weighted mean depth, leaving out stretches where both samples are at the surface, so a few minutes bobbing at the end of a dive don't drag the average up towards zero. These are the fallbacks when the dive computer's export has no average depth of its own, and the figures SAC uses unless the diver typed a value.

**The surface interval** is the time from the end of the dive that started most recently before this one. A dive ends at its start plus the later of its duration and its last sample below the surface. If that dive was still going when this one began, the interval is 0. Dive times are local wall-clock strings with no time zone, as in Subsurface, so the arithmetic never has to guess at offsets.

## Safety stop

Subsurface doesn't detect a safety stop, and the dive computer marks only mandatory stops, never the recommended three-minute one. So this is the one calculation that is Shylog's own, built on the dive computer maker's manuals where they say anything.

A dive gets a stop only if it went deeper than 10 m, and only its final ascent counts: going back below 10 m starts the count again. Time in the band from 3 to 6.4 m is measured along the straight line between samples, so only the part of each line inside the band counts. That matters because the computer mixes 10 s and 20 s sampling, and counting whole samples would give the same stop two different lengths. The manuals say 3 to 6 m; the 6.4 m edge and the two-minute drift allowance were fitted so that every stop in the real logs counts as full, since the dive computer's own log can't settle them.

Visits to the band join into stretches: drifting out for up to two minutes pauses a stretch, and a longer drift ends it. The stop is the last stretch that held 170 s in the band (three minutes, less 10 s lost to interpolation at 20 s sampling), or failing that the longest. Under a minute is no stop, and a minute to just under three is a short one.

## No-stop time and best mix

Two tools on You help plan a dive rather than read one back: Best mix lists the nitrox mixes with their MODs and the no-stop time (NDL) at a target depth, and NDL table lists one mix's NDL and PO₂ at every depth down to just past its MOD.

**Bühlmann, as Subsurface plans a recreational dive.** Subsurface's planner has a Recreational mode that answers exactly this question: how long can I stay at this depth and still swim straight up? It descends at 18 m/min, then adds a minute at the bottom for as long as a direct ascent at 9 m/min, tested every 2 seconds, keeps every tissue under its Bühlmann ZHL-16C limit. Shylog runs the same steps with the same constants, including Subsurface's own choice of starting the tissues at 78.1 % nitrogen. The diver picks a gradient factor of 70, 85 or 100, which is GF high; GF low stays at Subsurface's 30, since on a no-stop dive it only touches the ascent and moves the answer by a minute at most. The time counts from leaving the surface, as bottom time does in the US Navy manual. As a guide, 32 % nitrox at 30 m gives 16, 23 and 31 minutes at GF 70, 85 and 100.

**The US Navy table as a fourth option.** Subsurface has no table model, but a diver trained on tables may want one, so the US Navy Diving Manual's Table 9-7 is offered beside Bühlmann: read at the exact or next deeper row, with nitrox at its equivalent air depth, as the manual's Chapter 10 does.

**The best mix to a tenth.** Subsurface's `best_o2` divides the PO₂ limit by the ambient pressure and rounds down to a whole per cent. Best mix keeps the tenth, so 35 m at 1.4 bar gives 30.7 %, whose MOD is the depth itself; it still rounds down, so the MOD never comes out shallower than the depth.

## Departures from Subsurface

Each of these is a deliberate choice. Where one touches a figure the differential test below compares, the test applies it to Subsurface's answer first, so a departure can't hide a real mismatch. The one exception is an end pressure of 0 bar, which the test never generates, since Subsurface has no way to tell it from a missing reading.

| Departure                 | Subsurface                         | Shylog                            | Why                                                                               |
| ------------------------- | ---------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| MOD step                  | Whole metres in the cylinder table | 0.1 m                             | A diver planning to the limit wants the precision                                 |
| Max PO₂ default           | 1.6 bar                            | 1.4 bar                           | Matches the dive computer's own alarm                                             |
| Duration and depth in SAC | Always from the samples            | A hand-entered value wins         | Hand beats computer everywhere in the app                                         |
| Surface interval          | No limit                           | Over 48 hours is no previous dive | After two days the interval no longer matters, and a figure of 300 hours is noise |
| End pressure of 0 bar     | Read as no reading                 | A real reading                    | Shylog has a separate "not logged", so an empty cylinder can be recorded          |
| CNS ceiling               | Integer overflows                  | Capped at 999 %                   | Only wrong data gets near it, such as 100 % oxygen typed on a deep dive           |
| SAC on nitrox             | Uses whatever mix is set           | Waits for the oxygen fraction     | Compressibility depends on the mix, so an air figure would be slightly off        |
| Best mix                  | Whole per cent                     | 0.1 %                             | The tool shows the exact mix beside the whole ones                                |
| No-stop time past 6 hours | The planner's last minute          | 6 h+                              | A limit that long is no limit for a recreational dive                             |

## Proving it: the differential test

Unit tests against hand-worked values show a calculation works on the cases someone thought of. "Follows Subsurface exactly" is a stronger claim, and it needs checking on every input, not just a fixture's. So `packages/core/test/reference/` holds Subsurface's own functions, copied from a pinned commit into a single C++ file with each function's statements and order intact, and only the data structures flattened to the one gas and one dive computer Shylog has.

The test compiles that file once, keeps it running, and talks to it over a pipe: one line in, one line out. Subsurface's code is GPL-2.0, so it stays a separate test program that is never linked into Shylog. [fast-check](https://fast-check.dev/) then generates random dives, profiles and logs, and every rounded figure from the TypeScript must equal the C++ answer exactly: gas volume, SAC rate, MOD, CNS with carry-over, OTU, time under water, average depth, dive end, surface interval, the import's likely-same match, the profile chart's points, speeds, speed bands, axis ticks and labelled depths, the planner's no-stop time and the best mix.

**The generators aim at the edges.** Random depths alone would almost never land on 0.75 m, so depths are weighted towards the surface threshold, and a coarse grid hits the chart's 2 m label rules exactly. Gaps between dives fall a second either side of the 12-hour CNS window and the 48-hour cap. Sample steps mix the dive computer's 10 and 20 s with short steps that trigger the chart's speed lookback and long gaps that trigger interpolation.

**The seed is fixed.** CI tries the same thousand cases per property on every run, so a red build is always the change's fault and never a newly found random case. An environment variable switches to a random seed, or replays a printed one, for a long local soak. See [testing.md](testing.md).

**Floating point needed two fixes.** The C++ is built with `-ffp-contract=off`, because JavaScript never fuses a multiply and an add into one instruction and an ARM compiler would, which changes the last bit. And V8's `exp` and `pow` can be one unit in the last place off glibc's, so unrounded intermediate figures are compared to within a relative 10⁻¹², while every figure Shylog shows is compared exactly.

The safety stop has no Subsurface to compare against, so it is tested on hand-built profiles, with its counts of full, short and no stops pinned on two real dive computer exports.

## Profile chart

The dive detail draws the dive computer's samples against elapsed time: depth as the main line with the surface at the top, water temperature in a lane underneath, and the computer's events as markers. Which points are plotted, where the axes end, how ticks are spaced and which depths are labelled all follow Subsurface's `core/profile.cpp` and `profile-widget/`; the visual style is Shylog's own. Because these rules live in core, the differential test covers them too.

### Vertical speed colours

The depth line is coloured by how fast the diver was moving, so a rushed ascent shows at a glance with no legend to read. Subsurface uses tighter bands for ascents than descents, since a fast ascent is the dangerous one, and Shylog keeps its thresholds, compared in whole millimetres per second.

| Band     | Colour     | Ascent (m/min) | Descent (m/min) |
| -------- | ---------- | -------------- | --------------- |
| Stable   | green-800  | under 1.5      | under 1.5       |
| Slow     | lime-500   | 1.5 to 4.56    | 1.5 to 9.12     |
| Moderate | yellow-500 | 4.56 to 9.12   | 9.12 to 18.24   |
| Fast     | amber-600  | 9.12 to 18.24  | 18.24 to 30.42  |
| Crazy    | red-600    | over 18.24     | over 30.42      |

The colours are the nearest Tailwind shades to Subsurface's, each a little lighter in dark mode to hold its contrast. A segment's band looks back to a point at least 15 s and two points earlier, so one jittery sample can't paint a stretch red, but a segment already fast or crazy keeps its single-step band so a real spike is never smoothed away.

### Chart points and axes

**No gap is wider than 10 s.** Where samples are further apart, a point is interpolated every 10 s, and a point is added at every computer event, so the colour changes and the crosshair land where things happened. Nothing is thinned. The line stops one sample past the end of the dive, so a computer that keeps logging at the surface doesn't trail a flat line along the top.

**The chart fills its space.** Time runs from 0 to the end of the dive and depth from the surface to the deepest point plus 3 m, rounded up to the next tick. Subsurface's default view adds a 30-minute and 30 m minimum, which left a 10 m dive in the top third of the chart; the detail chart uses Subsurface's zoomed rules instead. The Log's small sparklines keep the 30 m floor, so a shallow dive still looks shallow in the list.

**Ticks come from the space available.** Each axis allows one tick per 1.5 label widths across or two label heights down, then rounds the step up to a tidy interval: 5, 10, 12, 15, 20, 30 or 60 minutes for time, and 1, 2, 4, 5 or 10 times a power of ten for depth. A 38 m dive gives 41 m, which with room for ten labels is 4.1 m a tick, rounded to 5, so the axis ends at 45 m.

**Only the peaks are labelled.** The deepest point gets a depth label, then the search skips three label widths to each side and labels the next point at least 2 m deeper than the shallowest point passed, along with that shallowest point. A multilevel dive gets a label at each level without a label on every wiggle. Subsurface also labels temperatures along the line; on a lane this short they collided, so Shylog labels only the lowest and highest, in the gutter.

**Vertical rate** in the crosshair's readout is the depth change from the previous chart point, truncated to whole millimetres per second as Subsurface's tooltip does, so it moves in steps of 0.06 m/min.

### The MOD line and markers

The gas's MOD is drawn as a horizontal line with a short label, but only when it falls inside the depth axis. It never widens the axis: stretching every chart to 56 m to show an air dive's MOD would flatten the dive itself, so most air dives show no line, and a nitrox dive near its limit does.

**Alarms** are drawn as faint bands over their recorded span, each with an icon above it. An ascent alarm of a few seconds would draw under 6 px wide, so it becomes a line where it began instead, and the crosshair still names it for 6 px from there, so samples a few seconds apart can't step over it.

**The safety stop** is not a warning, so it is drawn apart from the alarms: a faint green band for as long as it ran, with a stairs icon, both grey for a short stop. **A mandatory stop** from a dive computer download is a red line where the stop became mandatory, with a red hand icon. The watch begins every such stop on an ascent alarm, so the hand stands for both rather than stacking two icons.

**Icons move the least distance that clears.** When icons would overlap, each is moved the shortest distance, to either side, that keeps 4 px between it and its neighbours. An earlier version hopped each icon past its neighbours in turn and sent the stairs over the deepest part of the dive, far from the stop it marked.

### Water temperature

Dive computers record whole degrees, and their sensor lags the water by minutes, so the recorded line starts warm and flickers by a degree. The lane is smoothed by default: a reading counts once the diver has held a depth for a minute, readings are grouped into 3 m bands, and where the bands differ by 2 °C or more the dive had a thermocline and each point takes the temperature of the water column at its depth. A menu on the lane's caption switches to the line as the computer logged it. Smoothing changes only the drawing; the dive's recorded temperatures, records and statistics are untouched.

### Loading and accessibility

The chart library, not the maths, is the heavy part of the app, and the Log is the screen opened most, so the chart is its own lazily loaded chunk. It loads in the background once the Log is idle, so a dive's first opening rarely waits for it, and a dive whose samples are already on the phone draws its chart within a few frames with no skeleton. A dive still loading shows nothing for 150 ms and then a skeleton at the card's final size, so a fast load never flashes one.

The profile has no table alternative for screen readers. Its table of every point was about 1,700 elements, and even rendered a frame after the chart it held the page for about 110 ms at 4x CPU slowdown on a 1000-dive log, so it was dropped: in an app built for one diver, the chart's speed comes first. See [ui.md](ui.md) for the rest of the dive detail.
