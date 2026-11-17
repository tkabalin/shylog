# Export

How the log leaves Shylog, so it is never locked in. Every night, and on demand from the You tab, the server writes the whole log as UDDF 3.2.1, the open exchange format dive software reads, and as a CSV for spreadsheets. Snapshots of the database are the backup that restores use (see [server.md](server.md)); the exports are what lets the log outlive Shylog itself. How a UDDF export comes back in is in [import.md](import.md), the units the database stores in [data-model.md](data-model.md), and the CI checks summarised here in [testing.md](testing.md). The full rules are in the [spec](planning/SPEC.md).

## Two files, two readers

| File                | For                                                                                    | Holds                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `export/dives.uddf` | Subsurface and other dive software, and rebuilding the log if every snapshot were lost | Every field, every profile sample and event, and the standard data an imported dive brought with it     |
| `export/dives.csv`  | A spreadsheet or pandas                                                                | One row per dive, one column per field, in the app's units, with the profile as JSON in its last column |

Both are built on the server from the database, in one read transaction, so the two files always describe the same log.

## The nightly copy, and downloads

At midnight in the server's time zone the nightly job (`apps/server/src/jobs/nightly.ts`) deletes expired import previews, writes the database snapshot, then writes both exports, in a worker thread so the server keeps answering ([server.md](server.md#nightly-backups) has why). Each export is written to a temp file in the same folder and fsynced. The UDDF is parsed a dive at a time, then the rest of the file without the dives, and its dives counted; the CSV is read back by a standard CSV parser and its rows counted and measured. Only when both pass are they renamed over the previous files, so a failed check of either leaves both of last night's files in place. A server that was stopped over midnight runs the job at startup if today's snapshot or either export file is missing.

A failed export is logged, leaves the last-export time where it was, and raises an alert on the You tab with an Export now button that runs the same write again.

**Downloads never replace the nightly copies.** The You tab's UDDF and CSV rows build a fresh file for the download alone, checked the same way, and leave `export/` and the last-export time untouched. The server's files are the backup copy, so the only things that replace them are the nightly job and Export now, just as downloading a snapshot never touches the nightly snapshots. A database that failed its integrity check refuses to export at all, since its reads can't be trusted and the last good export is the better copy.

On a phone the file goes to the share sheet, whose Save to Files lets the diver choose a folder rather than landing in Downloads. On a computer, or a browser that can't share files, it downloads instead. Closing the share sheet is treated as a choice, not a failure, and an export slow enough to outlast the tap's permission to open the sheet falls back to a plain download.

## UDDF

The export is plain UDDF that opens in Subsurface without Shylog installed, every dive in its own repetition group. Each dive keeps its Shylog id, and nothing in the file depends on when it was written, so two exports of an unchanged log are byte-identical. Units follow the standard, not the app:

| Quantity         | Database                       | UDDF                 |
| ---------------- | ------------------------------ | -------------------- |
| Temperature      | °C                             | kelvin               |
| Pressure         | bar                            | pascals              |
| Tank volume      | millilitres (integer)          | cubic metres         |
| Gas mix          | tenths of a per cent (integer) | fraction from 0 to 1 |
| Depth, durations | metres, seconds                | metres, seconds      |

Cylinder volumes and oxygen are stored as integers precisely so the export can group identical cylinders into one UDDF tank and identical gases into one mix without comparing floating-point numbers: 32.4% nitrox never shares a mix with 32%.

### The `<shylog>` element

Many of Shylog's fields have no UDDF element: the surface conditions, surge, weather, rough visibility rating, maximum water temperature, gear details, tags, training agency and course, which of the dive's people were dive professionals, the trip, the dive centre and its region, a site's water type when it isn't the one its body of water implies, whether the surface interval was set by hand, whether the dive is ignored, and its mandatory stops. Trips and dive centres are here too, because UDDF's `divetrip` and `divebase` require data Shylog doesn't keep, such as a rating and a link.

UDDF provides `<applicationdata>` for exactly this: program-specific data that other readers pass through without interpreting, each program under its own child element. Shylog writes its fields in `<applicationdata><shylog>` under its own XML namespace, adding to an existing `<applicationdata>` instead of creating a second. So the file holds every field Shylog has, and a reader that doesn't know Shylog loses nothing it understands.

### Written for Subsurface's reader

Valid UDDF is not enough for Subsurface to read a dive correctly. Its import is an XSLT stylesheet, `xslt/uddf.xslt`, and the writer is shaped around what that stylesheet actually does:

- **The namespace.** Under any root namespace that isn't a versioned UDDF one, Subsurface opens the file with no dives and no error, so the root is UDDF 3.2's own `http://www.streit.cc/uddf/3.2/`.
- **Notes.** Subsurface reads only the first `<para>` of a dive's notes, so the notes go in one paragraph with their line breaks kept as newlines.
- **Buddies before the site.** Subsurface puts ", " between buddy names by looking only at whether the next `<link>` is another buddy, so a site link first would put a stray ", " before the first buddy's name. Buddy links come first, and a buddy's name always fills `firstname`, with any surname in `lastname`.
- **The gas link first.** Subsurface takes a cylinder's gas from the first `<link>` in `tankdata`. With the tank's link first, a nitrox dive reads as one with no gas, so the mix's link comes before it.
- **Sites.** A site's body of water is its `environment`, its region `geography/location`, and its country the ISO code in `geography/address/country`. A site with no region writes an empty `location`, which the schema requires, and which a re-import must not read as a region.

### Profiles and events

A dive's samples are written as `<waypoint>`s with time, depth, temperature and tank pressure, and its computer events as `<alarm>`s on the waypoint at their time: `surface` at its moment, and `ascent` at both the start and the end of an ascent pair, which is how the import reads them. A mandatory stop is a pair of `deco` alarms, UDDF's alarm for a stop the computer demands, and its exact start and end seconds also go in `<shylog>`, since a stop added to an older dive can end between samples, where no alarm can go.

### Passing through what Shylog doesn't model

An imported dive often carries standard UDDF that Shylog doesn't show, such as extra sample channels, deco stops, other alarms or a later gas switch. Each imported dive's original fragment is kept in `import_raw`, with the gas mixes it links to, and the export writes those elements back in their normal places (`apps/server/src/uddf/passthrough.ts`), so Subsurface and other tools read them as usual. They are written in the schema's order with their links remapped to Shylog's ids, rather than copied, because Subsurface's own exports fail the schema in several ways (ids such as `mix(21/0)`, empty link refs, `samples` after `tankdata`). A gas switch to a mix Shylog has no dive for, such as a trimix, is written back with its mix, under an id made from its make-up. Links to anything else Shylog doesn't store are dropped.

Where a field Shylog models has a typed value that differs from the computer's, the standard element carries the typed value. The gas a dive starts on always comes from the dive's own fields, so a starting gas Shylog can't hold stays air, as the import review said it would.

### Text and numbers

Characters XML 1.0 can't hold even escaped, most control characters, are dropped when a name or text field is saved, and again by the writer for older data. A carriage return, U+0085, U+2028 and U+2029 are written as character references, since a reader that ends lines as XML 1.1 does, as xmldom does, would otherwise turn them into plain line feeds. Numbers are written as plain decimals, never with an exponent, which neither `xs:decimal` nor XPath can read.

### Departures from the schema

Every export is validated in CI with `xmllint` against the official UDDF 3.2.1 XSD, vendored at `fixtures/uddf/uddf_v321.xsd`. Two failures are accepted on purpose, and nothing else may fail:

| Departure                                                                              | Why                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `<shylog>` inside `<applicationdata>`                                                  | The schema lists only registered program names. Registering `shylog` with the UDDF maintainer would remove this one                   |
| `tankdata` with no `tankpressurebegin`, for a cylinder logged without a start pressure | The schema requires a start pressure, but leaving `tankdata` out would lose the dive's gas and cylinder in Subsurface and other tools |

The check strips the `<shylog>` element and puts a stand-in start pressure into such a `tankdata` before validating, so the schema still checks the order of everything else.

### Proving that Subsurface reads it

Opening each export in Subsurface by hand doesn't scale, so CI reads exports the way Subsurface does: its namespace strip and then its own `uddf.xslt`, copied unchanged under `apps/server/test/reference/` and run with `xsltproc`. Every dive, site, buddy and mix written must come out with its date, time, depth, duration and gas. A fast-check property test (`uddf-round-trip.test.ts`) generates random logs, with awkward text, boundary numbers and computer profiles, uploads them as drafts, and exports them: the export must pass the schema, be byte-identical on a second run, read back through Shylog's own reader as stored, and be read by Subsurface's stylesheet with every field it takes. A separate test imports a real Subsurface export and exports it again, allowing only remapped ids and typed values to differ in each dive's standard elements.

### Reading it back

There is no separate restore-from-UDDF path. Shylog is restored from database snapshots, and if every snapshot were ever lost, the export comes back in through the normal import, which recognises Shylog's own files and reads them in full. Only the hand-versus-computer markers on standard fields are lost: standard elements come back as computer values and `<shylog>` values as hand values. The op journal isn't exported; it is backed up with the database.

## CSV

UDDF doesn't open in a spreadsheet, and Subsurface drops `<shylog>`, so the CSV (`apps/server/src/csv/writer.ts`) gives a plain table of the whole log for anyone who wants to chart or query it themselves. There is no CSV import.

- **Rows**: every dive that isn't deleted, ignored ones included, oldest first, as the dive numbers run.
- **Format**: RFC 4180 with a comma separator, dot decimals and CRLF line ends, in UTF-8 with a byte order mark, which Excel needs to read accents and curly quotes. A field holding a semicolon is quoted as well as one holding a comma, since Excel in a region that writes decimals with a comma splits on semicolons.
- **Values**: in the app's units, except durations, which are decimal minutes to 0.01 so a spreadsheet can sum them and the seconds can still be worked out (2,851 s is 47.52). Choice fields are their labels rather than their keys, and sites, people, trips and dive centres are named rather than linked, several names joined with `; `. Only the dive keeps its id, for joining exports made at different times. Where each value came from is left out.
- **Calculated figures**: SAC rate, MOD and max PO₂ are worked out at export with the same core functions and maximum PO₂ setting the dive detail uses; CNS and OTU are the stored figures.
- **Profile**: the last column holds the dive's samples and events as compact JSON, such as `{"samples":[[0,0.6,22,200]],"events":[["ascent",1810,1830]]}`. At about 12 characters a sample, a dive would need about 2,700 samples to pass Excel's limit for one cell, far more than either watch records.

**Text that looks like a formula.** Excel and Sheets run a cell that starts with `=`, `+`, `-` or `@` as a formula, so a note like "- saw a turtle" would show an error, and a crafted one could do worse. A text cell starting with one of these, or its full-width form, after any spaces, or starting with a tab or carriage return, gets a leading `'`. Numbers are never prefixed, so −1 °C stays a number.
