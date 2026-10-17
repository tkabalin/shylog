# Design

`hifi/` holds the hi-fi wireframes for Shylog, exported from Claude Design. They are the source of truth for layout; [SPEC.md](../SPEC.md) is the source of truth for behaviour.

Each board is a `.dc.html` file: one phone screen at 390 px wide, with its markup, styles and mock data inline. They need Claude Design's runtime (`support.js`) to render, so open them in the original canvas to see them; the source is readable as is. The `font`, `accent`, `dark` and `icons` props on each board were design-time toggles, not app settings.

| Board | Screen |
| --- | --- |
| `LogHifi2` | Log |
| `DiveDetailHifi` | Dive detail |
| `EditDiveHifi` | Add or edit a dive |
| `SitePickerHifi` | Choose or create a site |
| `StatsHifi`, `StatsEmptyHifi` | Statistics, and its early-days state |
| `SettingsHifi` | Settings |
| `RecentlyDeletedHifi` | Recently deleted |
| `CertsHifi` | Certifications |
| `EntitiesHifi`, `EntityDetailHifi` | Sites, people and trips, and one item's detail |
| `ImportHifi`, `ImportReviewHifi`, `PairedHifi`, `ChangePairingHifi`, `ImportDoneHifi` | Import: upload, review, paired dives, change a pairing, summary |
| `IconKeyHifi` | Icon key |

[NOTES.md](NOTES.md) lists where the wireframes contradict the spec. Follow the spec there.
