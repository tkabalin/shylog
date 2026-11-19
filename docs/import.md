# Import

How dive computer data gets into Shylog and is paired with the dives logged by hand. Hand-logged dives come first and always win; an import's main job is to attach the computer's profile to them and fill the gaps the diver left. The tables involved (`field_meta`, `fingerprints`, `import_previews`, `import_raw`) are in [data-model.md](data-model.md), the figures worked out from the samples in [calculations.md](calculations.md), and the way Shylog's own export comes back in through this same path in [export.md](export.md). The full rules are in the [spec](planning/SPEC.md).

## Two ways in

| Route                  | How                                                                                     | When                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Direct download        | The watch on its USB cable at the server, from the Import screen's Detect dive computer | The usual route for a Suunto D4i or Zoop Novo          |
| Subsurface UDDF upload | Download in Subsurface, export to UDDF, upload the file (up to 25 MB)                   | Older history, other dive computers, and as a fallback |

Both end up as the same thing: a UDDF document the server reads. A download is converted to the UDDF Subsurface would have exported for the same dives, so preview, pairing, apply, fingerprints and pass-through have one path, not two. Import needs a connection, since the server does the merge.

## Downloading from the watch

Both supported watches are in libdivecomputer's Suunto D9 family, the library Subsurface itself downloads with, and both use the same Suunto USB cable. That cable is an FTDI chip, which Linux's own `ftdi_sio` driver shows as an ordinary serial port, so the server needs no driver.

**dctool, not a binding.** No maintained Node binding for libdivecomputer exists, so the Docker image builds libdivecomputer's command-line tool, `dctool`, from a pinned upstream release with serial support only, and the server runs it as a child process (`apps/server/src/download/dctool.ts`). libdivecomputer is LGPL-2.1, which a GPL-3.0 project may ship; the image carries its licence and names its source. Each raw download is kept in the data directory, so the nightly snapshots hold it and a better parser could read it again.

**Same dive, same fingerprint.** A downloaded dive must be recognised as the same dive its Subsurface-exported self was, or every dive already imported would come back as new. libdivecomputer's parser gives no average depth, temperature summary or tank, which Subsurface works out from the samples, so the conversion (`download/convert.ts`) follows Subsurface's own code for each. That includes the duration: Subsurface's is the time below 0.75 m, not the dive time the watch records. With that, every dive the Subsurface fixtures share with a download gets the same fingerprint.

**Reaching the cable from a container.** A udev rule on the host gives the cable a fixed name and a group of its own, which the app joins. Compose lets the app open USB serial devices only, through a device cgroup rule and a read-only view of the host's `/dev`, so a cable plugged in after the container started still appears. Each instance turns this on in its env, and since libdivecomputer opens the port exclusively, a second instance's Detect says the cable is busy while the first reads it.

**One watch per instance.** An instance remembers its watch's serial number on the first download and refuses a different watch, naming it, so one diver's watch can't land in a second diver's log. Forget on the You tab clears it, for a new computer.

**Only new dives.** libdivecomputer reads the watch newest first and stops at the dive it is told it already has. Shylog keeps that marker, the start of the newest applied dive on the watch's own clock, and moves it forward only when a review is applied, so a failed or abandoned download can simply be repeated. The first download from a watch starts at the newest dive already imported from it, so a second-hand watch's earlier owner's dives are never read. A Read every dive again option remains for a dive skipped in an earlier review: fingerprints skip what is already imported, and older dives go to the left-out list, marked Earlier.

**Progress and patience.** The download answers only at the end, so the app polls the server a few times a second for libdivecomputer's progress events and fills a bar. A watch that hasn't answered within 8 seconds is taken as absent without waiting out dctool's own retries, and a download stops after two minutes. A download of only new dives takes seconds.

**Mandatory stops.** Upstream libdivecomputer suppresses the Suunto parser's stop events, so the image applies a three-line patch that reports them. The conversion writes each mandatory stop as a pair of UDDF `deco` alarms, read back as one `mandatory-stop` event. Dives imported from Subsurface before downloads existed get theirs once, from `scripts/mandatory-stops.sh`, which reads every dive on the watch, matches each to the log by fingerprint and adds only the stops, in one journalled transaction.

## The preview is scratch

An import is always preview, then confirm, and nothing touches the log until the diver confirms. Uploading a file or finishing a download stores a preview in `import_previews`, with the file itself, which apply reads again for the samples and each dive's original fragment. A preview is not log data: storing, adjusting or discarding one isn't journalled and doesn't change the log's version, so phones don't refetch the log for it. Only one waits at a time, a new upload replaces it, and it expires after seven days. The nightly job deletes expired previews before its snapshot, so their files aren't kept in backups.

## Clock offsets

The D4i keeps its home time abroad, and one export can span dives at home and a trip in another time zone, so the computer's times can't be trusted as they stand. The server estimates an offset for each day from the diver's own logged times (`import/offset.ts`). For each day, every offset a hand dive and a computer dive suggest is tried, rounded to 15 minutes and up to 14 hours either way, and the one under which the most of that day's hand dives pass the same-dive test wins, the smallest shift on a tie. A day with no such pair takes the offset of the nearest estimated day.

A dive belongs to the day it starts in local site time, so a night dive crossing midnight stays on the earlier date. If the times look off, the review's clock sheet shifts a day's offset in 15-minute steps, or resets it, and that day's pairs are proposed again. A day's dives are fixed once proposed: changing its offset shifts them without moving any to another day.

Fingerprints use the start time on the computer's own clock, before any offset, so changing an offset can never hide a dive that was already imported.

## Dives left out

**Freedives.** The D4i also records freedives, and they arrive in the export alongside scuba dives. Subsurface's UDDF carries no dive mode, so the import recognises a freedive by three signs together: no tank data, no gas, and no gap between samples longer than 2 seconds (`import/freedive.ts`). Every freedive in both real exports matches, sampled every 1 to 2 seconds, while every scuba dive has tank data and a gas and is sampled every 10 or 20 seconds. A gauge-mode dive has no gas either, but its slower sampling keeps it a normal dive.

**Blips.** A dive under five minutes that isn't a freedive is the computer waking in shallow water, a weight check before the dive, or the swim back after it. The shortest real dive in either export is 15 minutes. Without this rule each blip would be offered as a new dive on every import.

Left-out dives aren't paired or added unless the diver includes them, but they are fingerprinted, so a later import lists only new ones. The review lists them with a reason on each row, so one that was misjudged can be included. A blip that passes the same-dive test with a hand-logged dive pairs as usual instead, since the diver logged it as a dive.

## Matching and review

Pairs are proposed by closest start time on the same day, among those that pass Subsurface's same-dive test (`likely_same` in `core/dive.cpp`) after the day's offset:

- max depths differ by less than 1 m or less than 10% of the larger
- average depths the same way, when both dives have one
- durations differ by less than 5 minutes or less than 10% of the longer
- starts no further apart than half the longer duration, with a floor of 60 seconds

Each dive joins one pair at most, and ties go to the earlier dive, so a proposal never depends on the order the rows came in. Using Subsurface's test means a pair Shylog proposes is one Subsurface would also call the same dive.

The review is built for a large first import. Pairs that pass cleanly can be confirmed together without opening each. Any pairing can be changed, including by hand across days or against the same-dive test, with a warning, since the diver may know better than the clock. Unpaired computer dives are ticked to be added as new dives, and each can be skipped instead; a skipped dive gets no fingerprint, so it shows up again in a later export. Hand-logged dives on the export's days that nothing paired with are listed with how far the nearest computer dive started, and dives already imported are a count, never a list, since an export can hold hundreds.

**Gases Shylog can't hold.** Shylog has no trimix or hypoxic mixes, so a computer dive whose starting gas has helium or under 20.9% oxygen is imported on air, and the review says so before anything is imported.

## What the exports contain

The reader's rules come from reading real Subsurface exports of both watches, 72 dives from the D4i and 61 from the Zoop Novo, not from the UDDF standard alone. The Zoop Novo export has exactly the D4i's elements and placeholders, so it needs no rule of its own.

| What the export does                                                         | What the import does                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Samples carry only depth, time and temperature, in kelvin and only on change | The minimum and maximum water temperatures are the lowest and highest sample temperatures   |
| `ascent` alarms come in pairs, 1 to 21 seconds apart                         | Each pair, matched in order, becomes one event spanning both                                |
| `surface` alarms mark the start, the end and any surfacing                   | Stored, but not shown as a warning                                                          |
| The only `<switchmix>` is at time 0                                          | Read as the dive's gas, not as a gas change                                                 |
| Some samples repeat the same time                                            | Merged before anything is calculated                                                        |
| Samples run past `diveduration`, at the surface                              | Stored; the duration stays the computer's figure                                            |
| `greatestdepth` can be deeper than any sample                                | Max depth comes from it, since the computer catches peaks between samples                   |
| `averagedepth` is given to the millimetre                                    | Used directly, to the millimetre, where Subsurface's own stylesheet rounds it               |
| Oxygen is whole per cent, and air is `0.21`                                  | `0.21` is read as air, as Subsurface does                                                   |
| `leadquantity` sits under the wrong parent, and is 0 when not logged         | Read where Subsurface writes it; a 0, an empty site link and other placeholders are ignored |

Ignoring the placeholders matters more than it looks: filling empty fields from the computer would otherwise record 0 kg of weight on every dive.

## For a matched dive

**The profile always comes from the computer.** Samples and computer events are the point of importing.

**Hand values are kept.** Every field the diver typed stays, and empty fields, average depth included, are filled from the computer and marked as computer values in `field_meta`. Where the computer disagrees with a typed value (start time, max depth, average depth, duration, temperature or gas), the typed one stays and the computer's is kept beside it. The dive shows a banner with how many values differ, leading to the form, where each can be adopted or dismissed. Screens name the computer by the model the export gives, such as "your D4i".

**The gas has its own rules**, since it is the one field where the computer is most often wrong and the default is most often unchosen. It is compared as one value, Nitrox and the oxygen percentage together.

- A dive left on Nitrox no takes the computer's nitrox mix, since a new dive starts on air and a diver who leaves the gas alone while logging rarely means air.
- A typed nitrox mix keeps its decimals, and is flagged only when its whole per cent differs from the computer's, which records whole per cent.
- A typed nitrox mix against the computer's air is kept and flagged, since a computer left on air for a nitrox dive is a common slip.

**Taking the computer's values in bulk.** After a big import, hand-logged depths and times are mostly rough copies of the computer's, and adopting each one dive by dive is slow. So the review has a switch for each compared value that differs on any pair, off by default so hand still beats computer until the diver says otherwise. It is per value rather than one Use all, because the gas is the value where the hand one is usually right. A taken value becomes a computer value. One that would break a rule with a hand value it wasn't taken with, such as a computer minimum temperature above a typed maximum, stays the hand value and is flagged.

**Sites.** No Subsurface export names a site, so a dive added without one goes to a shared Unknown site for the diver to change. It is never marked as chosen, so the dive form treats it like an empty field, and it can't be renamed, merged or deleted, since its dives are at many real places.

**Fingerprints.** Every dive an import touches, paired, added or left out, stores a fingerprint of the computer dive: its start on the computer's clock, its duration, and its max depth in whole millimetres, so a re-export writing 32.660 for 32.66 still matches. A later import skips any dive it has seen, and fingerprints of deleted dives keep blocking re-imports.

## Applying

**Re-checked before anything commits.** The diver may take a while over the review, and might log or edit a dive on another phone meanwhile. The preview keeps a digest of every hand-logged dive it paired or listed, and applying first compares them. A dive changed, deleted or given a computer dive since, or a new hand dive on one of the export's days, stops the apply before anything commits; those days are proposed again and the reply names the dives, so the review asks again. The preview counts its proposals, and an apply names the one its choices were made on, so a request resent after a lost reply, made before the review asked again, is told again rather than applied.

**In chunks of 50.** Applying commits 50 computer dives per transaction, each chunk journalled under the import id, so a large first import makes no huge write-ahead log burst and a failure keeps the chunks before it. The chunks run back to back, holding other writes for the import's length, a few milliseconds a dive, since letting writes in between would let a resend or a clock change race the import. A retry is safe: a computer dive with a fingerprint is never applied twice, and once the last chunk commits the preview is deleted and its summary kept, which a late retry gets back. The summary counts dives paired, added, already imported, left out and included, and lists the dives that differ from the computer, each linking to its detail.

## Reading Shylog's own export

A Shylog export goes through the same import, so the log could be rebuilt from UDDF if every snapshot were lost. The reader recognises its own files by their generator name and takes everything: sites with their region, country, body of water, water type and link to Explore's map, people in their roles, the trip and dive centre, every standard field, and the rest from the `<shylog>` element. Standard elements come in as computer values, while the `<shylog>` values, such as tags and surge, come in as hand values, since no dive computer records them. Only the hand-versus-computer markers on standard fields are lost. See [export.md](export.md) for what the export writes.

## Logbook history

Two older logbooks came in once each through scripts in `apps/server/scripts/`, not the import, since neither holds computer data. Each reads a private extras file that maps what the logbook can't say (each site's country and region, people to leave out, per-dive corrections), and each stops the run on anything it can't read with certainty, such as a code it doesn't know, instead of guessing. Both are safe to rerun.

**SSI.** The MySSI logbook was logged by hand, so `ssi-import.ts` turns its CSV export into one offline draft per dive and uploads them to `POST /api/ops` exactly as the phone would. They become hand values with no fingerprint, and a later Subsurface import pairs the computer's profiles with them as usual. Entity ids come from SSI's own ids or from names, never from row order, so a rerun on a changed CSV never moves an id onto someone else. The script refuses to send anything while another dive in the log overlaps an SSI dive in time, so a dive typed in by hand is never doubled.

**PADI.** A second diver's history is in the PADI app's logbook, which keeps no start times and no profiles, and nearly every dive in it was also recorded by the dive computer. So it comes in after that diver's first import, not before: `padi-import.ts` matches each PADI dive to a live dive on the same date that passes the same-dive test on depth and duration alone, and fills in only what the dive lacks, through the same edit the app makes. It never sends the start time, duration, depths, temperatures or gas, which stay the computer's, and a value the diver set otherwise in the app is kept and listed. A PADI dive with no match is sent as a draft, like an SSI dive.
