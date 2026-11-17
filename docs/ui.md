# User interface

How Shylog looks and behaves: the conditions it is designed for, how it changes between a phone and a desktop, its visual direction, icons, colour and data visualisation, navigation, motion, and accessibility. How dives sync and what the app shows offline is in [offline-sync.md](offline-sync.md), the charts on Statistics in [statistics.md](statistics.md), and the libraries behind the interface in [tech-stack.md](tech-stack.md). Every screen's full behaviour is in [the spec](planning/SPEC.md) under "UI and mobile design".

## Designed for wet hands

A dive is logged on the phone soon after it ends, on a boat, at the shore or back at the dive centre, with wet hands and often no signal. Desktop is secondary, usable rather than rich. Each rule below follows from that phone in a wet hand.

| Rule                                         | Why                                                                                                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Touch targets of about 44 px below `desk:`   | A wet finger is imprecise. shadcn's Button, Input, Select and list rows are overridden to `h-11` in place, and shrink back to shadcn's compact sizes only with a mouse.    |
| 16 px input text                             | iOS Safari zooms the page into any focused field with smaller text, and doesn't zoom back out.                                                                             |
| Native date and time inputs on touch screens | The iOS pickers are good, and `<input type="date">` and `type="time"` return plain strings with no time zone, which is exactly how Shylog stores a dive's local time.      |
| `inputmode="decimal"` and `"numeric"`        | A number keypad rather than the full keyboard. Water temperature takes the decimal pad, which has no minus key, as sub-zero water is rare enough to arrive only by import. |
| A comma accepted as the decimal separator    | The keypad's separator follows the phone's region, so the shared parser in `packages/core` reads `18,5` as 18.5.                                                           |
| Bottom tab bar on touch screens              | Within reach of a thumb.                                                                                                                                                   |

## Phone and desk

The layout switches on a custom Tailwind variant, `desk:`, which means at least 48rem wide **and** a fine pointer. Width alone would hand a phone turned landscape the desktop chrome while it is still under a finger, and a tablet without a trackpad keeps the phone layout for the same reason. `md:` is used only for layout, such as the centred column (48rem for the Log and a dive, 36rem for the form and You's screens), and hover styles are limited to fine pointers too, since Tailwind's own `hover:` matches some Android phones and iPads and leaves a tint stuck after a tap.

**On a phone** the five destinations are a bottom bar of 28 px icons with no words: Log, Statistics, Explore, Import and You, or four on an instance with Explore off (its map covers only Cape Town). Each icon is named by its `aria-label` for screen readers. The dive form and the import's review steps cover the bar, as an iOS edit sheet would, so a tab can't leave a half-filled form behind. Pickers are bottom sheets, choice fields open a list in a sheet, and the surface interval is set on hours and minutes wheels.

**From `desk:` up** the app follows shadcn instead of iOS:

- A sidebar replaces the tab bar and folds to a 48 px rail of icons, each named in a tooltip, by its Collapse button or Ctrl+B (⌘B on a Mac). It remembers the choice in a cookie.
- Sheets open as dialogs centred over the content, with their actions in a footer, and option sheets become Selects that drop below their row.
- Date and start time open a Calendar popover and an hours and minutes popover, since the native pickers are poor on Windows, and the surface interval takes two number boxes in place of the wheels.
- Page bars carry buttons: a breadcrumb and Edit on a dive, Cancel and Save on the form, New dive beside the Log's search in place of the floating button.
- With the sidebar always in reach, leaving a form with something typed asks to discard first, as Cancel does.

Phones keep their iOS patterns unchanged. Every new screen gets its desktop form in the same change, with an end-to-end test at desktop width.

## Visual direction

The aim is sleek and minimal but recognisably Shylog, not a stock shadcn app. What sets it apart is layout, typography and the dive data itself, with no decoration for its own sake.

**One accent, used sparingly.** The shadcn preset `b1sAmWaNW` sets the base, with cyan as both the accent and the chart colour. A thin theme layer in `apps/web/src/index.css` overrides the preset's variables only where it has to: surfaces, Geist Mono, and the dark-mode accent, which the preset sets to cyan-800 and the layer lifts to cyan-400 because cyan-800 is unreadable as text on a dark background. The accent marks the active tab, the dive number pill, the source bar on computer values, and the water in the Log's sparklines; almost everything else is neutral.

**Tailwind's palette everywhere.** shadcn's colours come from it, so Shylog's do too. A colour outside it appears only where nothing in Tailwind fits, such as the muted thermal comfort scale on Statistics.

**Type.** Geist throughout, with Geist Mono in a few chosen places and tabular numerals for every other figure, so columns of depths and times line up. Headings are sentence case, never all caps, and there is no serif anywhere.

**The dive data as the decoration.** The character comes from the dives and the brand rather than ornament: the Log's sparklines, the profile chart and the shyshark (see [Icons](#icons) and [Colour and data visualisation](#colour-and-data-visualisation)). Every list of dives or days runs newest first, as the Log does, so the order never flips between screens; charts still run left to right in time.

## Icons

**One set, one style.** Every interface icon comes from Tabler's outline set, about 130 of them, so stroke weight and corners match everywhere. Where a board draws one Tabler doesn't ship, such as the calm and stormy surface waves or the three rising bars for Low, Average and High visibility, it is drawn on Tabler's grid and built with Tabler's own `createReactComponent` in `apps/web/src/components/icons/`, so it takes the same props and can't be told from the rest.

**Icons where they help, not everywhere.** The boards draw three densities of icon; Shylog builds the middle one, Essential, and decided it screen by screen. Fields in the form, the Log card's depth and duration, and the rows on You get one, as they help the eye find a row. A site's country, the dates in Recently deleted and the site picker's map pins don't, since there they would only repeat the word beside them. Where an icon follows a fact, facts are separated by a gap, and the " · " dot is kept for plain text.

**Chosen for divers.** The You tab is a scuba mask, so gear takes the scuba tank. A pattern on Statistics shows what it compares across, the current for "higher in moderate or stronger current" or a rising line for a trend, in an accent circle. An ignored dive shows an eye-off icon where its number would be.

**Icons carry state, so colour never has to alone.** Each sync state has an icon of its own, from wifi-off for offline to server-off when the server can't be reached. A dive still on the phone has a cloud-off icon with its coloured outline. A dive whose computer values differ from the typed ones gets the arrows-diff icon in the warning colour, on the import review and on its summary alike, so the two screens read as one.

**Markers stay over what they mark.** On the profile chart an alarm's warning triangle is centred over its band, the safety stop has a stairs icon and a mandatory stop a red hand. Alarms close together may overlap rather than step aside, as an icon moved off its band points at the wrong moment; only the stairs moves, the shortest distance that clears. The rules are in [calculations.md](calculations.md#the-mod-line-and-markers).

**The shyshark.** The app icon is a puffadder shyshark curled into a ring, the shy pose the species is named for, on white with a soft shadow. It is drawn full bleed with the shark inside the maskable safe zone, so iOS and Android each apply their own corner shape, and the Home Screen icon is rendered at 1024 px, as a 180 px one looked soft on the phone. In the app the shark sits in full colour at the right of the Log's dive count and scrolls away with it, carries the sync status as a badge as an app icon does, and stands larger in the middle of an empty log. It only reads from about 40 px, so it is never shrunk to a tab icon.

## Colour and data visualisation

A chart, gauge or colour earns its place only when it tells the diver something the number beside it can't: how close a value is to a limit, which way it is moving, how spread out it is. Drawing a figure that already reads clearly is decoration, so several were tried on the phone and dropped.

**Each colour has one meaning.** If a colour means a warning in one place and a category two cards down, the eye can no longer use it as a shortcut, so each has one role:

- **Cyan**, the accent, marks "this one": the active tab, the dive number pill, the source bar, the dive's own dot or bar against others, a chart's average. It never stands for a category.
- **Orange** is a warning: the computer's alarms, the sync states that need the diver, values that differ from the computer.
- **Red** is for danger: the fastest ascents, a mandatory stop, max PO₂ or CNS past its limit.
- **Green** is a good thing: a safety stop held in full, and the stable band of the ascent colours.

One collision had to be designed out. A short ascent alarm, drawn as a line rather than a band, was first orange-700, and in light mode it passed for a mandatory stop's red line, so it is now orange-500 at 60 % (70 % in dark mode).

**Colour never works alone.** Every state that has a colour also has an icon or words, as above. On a proportion strip, dives that didn't log a field are hatched rather than given a pale tint, so a missing answer never reads as the lowest level.

**One series, one colour.** Most charts show one thing, so they use the accent and neutrals only: the SAC chart draws each dive in grey and the five-dive average in cyan, and a bar chart puts only its tallest bar in the accent. Ordered answers, such as visibility or current, are a ramp from a faint floor to the accent, one step per level, since a hue per step would read as different kinds of thing rather than more or less of one. Answers with no order, such as weather, take the same ramp by rank, the most common in the accent. The one scale outside Tailwind is thermal comfort, cold to hot, in the boards' own muted tones.

**Both themes are checked on their own.** Dark mode gets its own values wherever a shared one would fail: the accent lifts from cyan-800 to cyan-400, each ascent colour goes a little lighter, and the ramp's floor is set per theme so its faintest step still shows on a dark card.

**Where the data is drawn:**

| Place              | What it shows                                                                                                                                                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log card sparkline | The dive's profile as water, densest at the surface and thinning with depth, with no line at the surface, so a card reads as a dive rather than a stock chart. Its depth axis keeps a 30 m floor, so a shallow dive looks shallow in the list.                                                                              |
| Profile chart      | Depth coloured by vertical speed, so a rushed ascent shows with no legend, the water temperature in a lane beneath, smoothed to the water column, and the computer's events as markers (see [calculations.md](calculations.md#profile-chart)).                                                                              |
| Dive figures       | Max PO₂ and CNS each carry a bar towards their limit, max PO₂ with a tick at the diver's setting, and the number and bar turn red past it. The bars sit on the label line and fill the rest of it, so every cell stays one height and bars in a column end together.                                                        |
| SAC on a dive      | The rate, its change against the last five dives, and a strip with their range as a band, their average as a tick and this dive as a cyan dot. The baseline is recent on purpose: against the whole log, every dive of a diver who has improved would look good.                                                            |
| Statistics         | SAC rate over time with a five-dive rolling average, its spread with a fitted curve, bars per month or year and per depth band, and a strip per condition (see [statistics.md](statistics.md)).                                                                                                                             |
| Patterns           | A threshold draws every dive along the water temperature with the cold ones filled; a difference draws each group's dives in a lane with its average as a line, so a difference six steady dives make reads apart from one a single bad dive makes; a season draws twelve monthly bars with the two compared in the accent. |

**Tried and dropped:** a bar for OTU, as NOAA's 300 OTU limit is per day and a bar for one dive would mislead; an oxygen and nitrogen split for the gas, which the text already says; a start-to-end pressure bar; dots beside each condition, which repeated an ordered word; and a trend line or gap chart for patterns.

## The main screens

| Screen      | What it holds                                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log         | Dives as cards grouped by month, a header with the dive count, hours underwater and deepest dive that scrolls away like an iOS large title, search, and filters for year, tag, region, depth and duration. |
| Dive        | The profile chart with its events listed beneath, the key figures, gauges for max PO₂ and CNS, the SAC rate against recent dives, and every field.                                                         |
| Add or edit | One form in sections, with the calculated SAC rate, MOD and max PO₂ as the inputs arrive. A new dive saves offline.                                                                                        |
| Statistics  | Headline figures, charts and patterns across the log, filtered by year (see [statistics.md](statistics.md)).                                                                                               |
| Import      | Download from the dive computer or upload a Subsurface export, review the pairings, then a summary (see [import.md](import.md)).                                                                           |
| You         | Sync status, the diver's certification cards, places, people and trips, backups and exports (see [export.md](export.md)), the dive computer's PO₂ setting, new-dive defaults and appearance.               |

Two rare moments celebrate. Saving a new dive sends a few small bubbles up off its max depth figure, with a larger burst for a milestone dive number, and a finished import does the same off its summary's badge. Nothing plays when a dive is edited or reopened, on a reload, or under reduced motion.

## Navigation history

An installed web app on iOS has no Back button, only the edge swipe, so the history stack has to behave like a native app's: a swipe should never land somewhere stale or step back through tabs. Every link and `navigate` call follows one rule:

- **Push** only to go one level deeper, to a screen you back out of: Log to a dive, a dive to Edit, You to a site or a person.
- **Replace** for sideways moves and finished steps: tabs, filters, search and the Statistics year; saving a new dive, whose detail takes the form's place so the form can never be reopened and saved twice; each import step, so Back from the summary can't reach a review that has already been applied.
- **Go back** to close a screen whose parent is the entry behind it, such as Save or Cancel on Edit, so the Log returns with its scroll position and filters.
- **No entry** for sheets, pickers, drawers and dialogs.

TanStack Router's default is push, which is wrong for tabs, filters and saved forms, so each link decides as it is written, and each new flow gets an end-to-end check that `page.goBack()` lands where the rule says.

## Motion and press feel

Motion is judged by how often it is seen. Tab switches, opening a dive from the Log and theme changes don't animate at all, and full-screen viewers open and close at once. Sheets, pickers and dialogs get a standard transition. Rare moments, such as a finished import or a saved dive, can carry a little delight. Frequently opened lists have no stagger.

**A tap moves on frame one.** Motion answering a tap uses a strong ease-out, so the first frame already shows the change; an ease-in-out curve read as lag on the phone. The curves are defined once as theme tokens in `index.css`, and the default transition curve is the same ease-out, so a hover or press fade answers at once. Buttons and chips dim or shift through `:active`, which responds on touch-down.

**Rows tint only on a held press.** A list row's pressed tint is set by `lib/press.ts` rather than `:active`: it marks the row only once a finger has held still for about 90 ms, about UIKit's own wait, and flashes it on a quick tap as it lifts. A finger that starts a scroll therefore never lights up every row it lands on, which is how native iOS lists behave. iOS's grey tap highlight is turned off and a long press doesn't select a button's text.

**What a finger drags keeps up with it.** In a reorder, the neighbours making room and the drop settling use a critically damped spring of about 0.12 s; a quarter of a second read as sluggish. Segmented controls and tags tick with the system haptic on iOS, which Safari offers no API for: a transparent label laid over the control hands the tap to a hidden native switch, whose toggle plays it. Android uses the Vibration API.

**Loading never flashes.** The Log stays blank for 150 ms before fading in a skeleton of the count, the bar and the first cards, each where it will land, so a quick start shows nothing and nothing moves when the log arrives. The profile chart, Statistics and the Explore map load as chunks of their own, so opening the app doesn't wait for Recharts or MapLibre.

## Where a value came from

A field can hold a value typed by hand, read from the dive computer, or worked out by Shylog, and an import never overwrites a hand value (see [import.md](import.md)). The form shows the source without colouring the value itself: a computer or calculated value has a thin cyan bar down its row's left edge, keyed by a note under its card ("From your dive computer or worked out by Shylog"), and screen readers hear "Calculated by Shylog" or the computer's name. Once the field is edited the bar goes and a reset to the computer's or calculated value takes its place. Values keep the normal text colour: the wireframes' accent-coloured values were tried in review and dropped, leaving the bar to carry the source.

Where a hand value differs from the computer's, the computer's sits on a line under the field with Use and Keep mine. The computer is named only when the app knows which one it was, and is otherwise "your dive computer".

## Offline in the interface

No screen explains being offline in a sentence. Whatever needs the server is disabled and looks it, and the screen's bar carries one small offline icon (a server icon when the phone has signal but the server doesn't answer). A dive saved on the phone and not yet uploaded has a coloured outline and a cloud-off icon on its card. The mechanics are in [offline-sync.md](offline-sync.md).

## Accessibility

- **Small charts have a table alternative.** Statistics' bars and strips render a screen-reader table beside the drawing. The dive profile and the SAC trend don't: their tables, a row for every point and for every dive, slowed the charts, and in an app built for one diver the charts' speed comes first.
- **States never rely on colour alone.** Each sync state (offline, can't reach the server, server problem, syncing, not synced, paused) has its own icon and is named for screen readers, and in words on You's sync card. An unsynced dive's outline comes with an icon and screen-reader text, and an ignored dive shows an eye-off icon read as "Ignored".
- **Icon-only controls are named.** The tab bar, the sidebar rail and icon buttons carry labels or tooltips.
- **Zoom is locked app-wide** for an installed-app feel: the viewport sets `user-scalable=no`, which iOS Safari ignores, so `touch-action: pan-x pan-y` on the root does the work there. The certification card viewer brings its own pinch to zoom, since the cards are the one thing that needs it. Text sizes, the 16 px inputs and the 44 px targets are chosen so that nothing else does.

## From wireframes to the built app

The starting point was a set of hi-fi wireframes drawn with Claude Design, one 390 px phone screen per board, kept in [planning/design/hifi/](planning/design/hifi/). They decide layout; the spec decides behaviour. Where the built app departs from a board, [planning/design/NOTES.md](planning/design/NOTES.md) says how and why: the boards use simplified maths for MOD and SAC, several of their chips and buttons are 28 to 36 px, they draw a labelled tab bar and a header pill for sync, and no board draws the desktop layout at all.

The boards' helper copy isn't binding either. A muted footer that tells the diver what the screen already shows, or what a gesture obviously does, is cut; one that says something the diver couldn't otherwise know stays, such as "Stored offline." under the certification cards.
