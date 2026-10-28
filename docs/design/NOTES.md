# Where the wireframes are wrong

The hi-fi wireframes were drawn before some spec rules were settled, and their mock data uses simplified maths. In each case below the spec wins; build from it, not from the board.

## Calculations

- **Max PO₂ and MOD**: `DiveDetailHifi` and `EditDiveHifi` use 10 m of water per bar, giving 1.37 bar and 33.6 m. The spec's method (0.101043 bar/m in salt water, 1,013 mbar surface pressure, air as 20.9%) gives 1.38 bar and 33.2 m for the same dive.
- **SAC rate**: the boards show 11.8 L/min from an ideal-gas calculation. Use the spec's real-gas formula, which gives about 11.2 to 11.3 L/min for that dive.
- **Average SAC** in `StatsHifi` is a plain mean. The spec weights by duration and drops rates of 0.1 L/min or less.
- **Patterns** in `StatsHifi` show findings the mock data can't support (fewer than 5 dives in a group, a 52% share shown as a habit). Patterns appear only when they clear the spec's bar.

## Profile chart

- Draw the MOD line ("MOD 33.2 m") and size the depth axis to the deepest point plus 3 m, rounded up to the next tick. The board has no MOD line and a fixed 35 m axis.
- Colour the depth line by vertical speed with no legend. The board's "Accent" option (plain line with a "Depth" legend) is not a choice, and an ascent exactly on a band boundary falls in the slower band, not the faster one.
- Give the chart a table alternative. An `aria-label` summary is not enough.
- Event markers are an icon centred over the event's band, with no text; the alarms list and the readout name them.
- Depth labels sit in a gutter left of the plot, not inside it as the board draws them, so a steep descent never runs under them.
- The axes fit the dive (Subsurface's zoomed plot), not the board's fixed 35 m and 48 min.
- The temperature lane's header reads only "Water temperature" and the crosshair's value. The board's min–max range moves to two labels in the gutter, at the lane's lowest and highest levels.

## Forms and inputs

- Date and time use native `<input type="date">` and `<input type="time">`, not text fields.
- `inputmode="numeric"` for whole numbers (duration, pressures); water temperature takes `inputmode="decimal"` too, so a negative one only arrives by import.
- Touch targets are about 44 px below `md:`. Several chips, segmented buttons and inline actions on the boards are 28 to 36 px.
- Date, time, site, duration and max depth are all required. The board marks only the first three.
- A new dive's date is prefilled with today; its start time is empty until tapped, then starts at 09:00; dive type comes from the new-dive defaults (Recreation unless changed).
- Training agency and course name appear when the dive type is Training. The board has no Training state.
- A failed save keeps the form's values and offers to try again.
- Dive type options are the spec's list. The Settings board's "Technical" and "Work" don't exist.
- No board has ignored dives. `EditDiveHifi` needs the Ignore this dive switch at the end of the form, and `LogHifi2` cards and the `DiveDetailHifi` title show an eye-off icon in place of the dive number, with "Ignored" as screen-reader text.
- `LogHifi2` has no depth or duration filter. Add Depth and Duration pills after the board's existing filter pills, styled the same, each opening a sheet with a range slider and Reset and Apply (see Log in the spec).

- Pickers follow D29. `SitePickerHifi` becomes a full-height bottom sheet with Cancel in place of "‹ Edit dive"; Country and Body of water open as lists inside it (body of water is a list, not a native select).
- Buddies, dive professionals and the dive centre are rows in the form that open a sheet, not the board's suggestion list inside the card. The list is "Recent" (most recently used), not "Frequent"; Add keeps the name as typed rather than capitalising it; nobody is offered for both roles.
- The ✓/✕ group sits on its own line under each field, right-aligned like the values, for all six compared fields, rather than squeezed into the row.
- Surface interval is picked on hours and minutes wheels in a sheet, with Calculated and No previous dive as rows, not typed as free text.
- Copy from last dive is one row like the form's own: the title with its icon, and the last dive's site on the right. The board's two-line card with the dive number and date is simplified away.
- Tag chips and segmented controls are 40 to 44 px tall; the ✓/✕ buttons and chip remove buttons keep their size with a 44 px tap area.

## Settings and people

- New-dive defaults use the dive form's controls (material, volume in litres, Nitrox and oxygen percentage), not the board's preset lists, and a new dive is filled from them. `EditDiveHifi` leaves them blank.
- Dive professionals are labelled "Dive professionals", with no instructor or divemaster role, and the people list shows names only, without the boards' role subtitles.

## Sites and regions

- A site's country is picked from the ISO list (`EntityDetailHifi` types it), and body of water uses the spec's options, not a named sea such as "Indian Ocean".
- Regions get their own tab on Sites, people and trips. The boards don't have one.

## Statistics, Recently deleted and Certifications

- Surge has five levels; `StatsHifi` adds "Very mild".
- The Records and averages card in `StatsHifi` and `StatsEmptyHifi` shows only deepest and longest. It also needs coldest and warmest dive, total depth descended with progress to the next landmark, the day and week streaks and the diving anniversary (see Records and milestones in the spec), in the card's existing row style.
- Patterns need the "All patterns" list and a tap through to the groups behind each one. The board shows static findings.
- Recently deleted keeps the board's restore note and adds that deleted dives keep blocking re-imports.
- Adding and editing a card both need a connection. The board only disables the list's add button.

## Import

- Name the computer by the model the export gives, not a hard-coded "D4i".

## Values from the computer

- Headline figures show the hand value. The dive detail board shows the D4i's 44 min while the hand value is 45.
- Any difference from the computer is flagged. The boards flag only depth over 1 m or duration over 3 min.

## Decisions taken after the boards

These were settled while planning the build (`docs/PLAN.md`, decisions D1 to D22) and the boards have not been redrawn for them.

- Entity detail and the Settings sections save with an explicit Save action that appears when a field changes, as the Certifications edit screen does. A colliding rename shows the error under the field with a "Merge instead" action. The boards have bare inputs.
- Every field whose hand value differs from the computer's gets the ✓ "Use D4i value" / ✕ "Keep mine" group (start time, max depth, average depth, duration, temperatures). A field holding a computer value shows the "From the D4i" marker, which becomes "Reset to the D4i value" once edited. `EditDiveHifi` draws the group only for start time and duration.
- Computer and calculated values keep the normal text colour. The accent colour `EditDiveHifi` gives D4i and calculated values was tried in review and dropped.
- A site's region is typed with the existing regions in that country offered as you type. `SitePickerHifi` has a plain free-text field.
- The Log header is the board's "Hero count" variant. The Tiles, Split, Sentence and Stat strip variants were explorations. On scroll the large count and strip scroll away with the list and the compact line fades into the sticky bar; the board keeps the 52px count beside it.
- The Import done screen lists the dives that differ from the computer, each linking to its detail. The board links the row to one dive.
- The Compare table on Change pairing also shows average depth.
- The upload card shows an indeterminate "Reading your export" state. The board's "48 of 72 dives" progress bar implies streaming that the server does not do.
- The import summary counts included freedives separately when there are any. The review board folds them into "new".
- Entities are created only from the dive form's pickers; the entity screens list, rename, merge and delete.
- The Icon key is a reference, not a screen. Each board's Essential icon set is what gets built; the key's Essential column is a vocabulary, not a per-screen rule.
- The tank-pressure lane is not built; neither computer records pressure.

## Sync

- The header pill also has a "server unreachable" state, separate from offline.
- A banner shows how many dives are waiting to sync and the age of the oldest.
- A rejected draft shows the reason on its card, and an unsynced dive's number is shown as provisional.
