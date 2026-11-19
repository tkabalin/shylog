# Server

How the server keeps a dive log safe and makes its health visible: how every write is made, journalled and checked, how the log is backed up and restored, and what the server logs. The stack it runs on is in [tech-stack.md](tech-stack.md), the tables it writes in [data-model.md](data-model.md), and who may call it in [security.md](security.md). The commands for backups, restores and reading the logs are in the [README](../README.md#backups-and-restores); the full rules are in the [spec](planning/SPEC.md).

## One process, one writer

One Node process runs Hono, serves the built app and the API, and is the only thing that ever writes `shylog.db`. A dive log has one diver and a few devices, so a single writer is never a bottleneck, and it removes every question about concurrent writers: there is no connection pool, no lock to take, and nothing else that could hold a stale view of the data. The one other connection is the exports' own, read-only, in a worker thread (see [Nightly backups](#nightly-backups)).

The database is opened with SQLite's write-ahead log (`journal_mode=WAL`), so reads never wait for a write; `synchronous=FULL`, so a commit is on disk before the server replies; foreign keys on and never deferred; and a five-second busy timeout for the backup tools that open the file alongside the server.

## Every write is one transaction

Every change to the log, whether a draft dive uploaded from the phone, an edit to a synced dive, a merge, a new certification card or a chunk of an import, goes through one function, `write()` in `journal.ts`. It runs the change, the journal entry and a new version id in a single transaction. If anything in it throws, the whole request rolls back and the reason goes back to the phone: to the draft's card for an upload, or under the field in the form for an edit.

**Derived figures in the same transaction.** Dive numbers, surface intervals, average depths calculated from samples, water temperatures, and CNS and OTU depend on other dives: CNS carries over from earlier dives on the same trip, and a dive number shifts when an earlier dive is added. After each change the server recalculates them across the log before committing. Doing it inside the write means the log is never seen half updated, and recalculating everything rather than tracking what changed is simple. Surface intervals and CNS carry-over come from one pass over the log sorted by start time, so recalculating a thousand dives takes about a tenth of a second.

**A change that changes nothing writes nothing.** Every edit sets fields rather than adding to them, so it is safe to repeat. A repeated delete or an edit that matches what is stored journals nothing and keeps the version, so phones don't refetch the log for nothing.

## The journal

Every write is recorded in the `ops` table with a server sequence number and the time it was applied, in the same transaction as the change. That covers draft uploads, edits to synced data, merges, imports (with their full payload), alias matches made during uploads, the remembered dive computer, and migrations. The journal is complete enough that replaying it onto an older copy of the database reproduces the current one exactly, which is what makes restores precise (see [Restores](#restores)).

Entries are ordered by server sequence, never by a client's timestamp, since a phone's clock can be wrong. Entries from one transaction share a commit time that no other transaction has, so a replay can group them back together and give each change the time it was first applied.

The journal is also the record of which uploads have been applied. A draft's operations carry client-generated ids, and an id already in `ops` is skipped, so a phone that resends after a lost reply never duplicates a dive. How the phone uses that is in [offline-sync.md](offline-sync.md).

## The version phones check

Each commit stores a new random id in `meta` as the data version, which is also the log's ETag. Phones ask for `GET /api/log` with the version they hold when the app opens, when it comes back to the front, after each upload and every five minutes, so an unchanged log costs only a 304.

The version is random rather than a counter for one reason: a restore. A counter would go back to an earlier value when an older snapshot is restored, and a phone that had already seen that value would wrongly think it was up to date. A random id can never repeat one a client holds.

## Imports

An import is the largest write the server makes: a Subsurface export or a download from the watch can hold hundreds of dives. It is applied in chunks of 50 dives, one transaction and one journal entry per chunk, so a large import never makes one huge write-ahead log, and a failure keeps the chunks before it and reports what was applied. The chunks run back to back without letting other requests in between, because a resend or a change on another phone landing mid-import could race it. At a few milliseconds a dive, the wait is short.

**Previews are scratch.** Before anything is applied, the server reads the file and stores a preview for the diver to review. Storing, adjusting or discarding a preview is not journalled and doesn't change the version: it isn't log data, and a restore that loses one costs only an upload. Previews expire after seven days, and the nightly job deletes expired ones before its snapshot so their files aren't kept in backups. How an import pairs dives is in [import.md](import.md).

## Integrity checks

Foreign keys, `CHECK` constraints and unique keys are enforced on every statement. On top of that, `PRAGMA integrity_check` runs at startup and once a day. A failure pauses every write: requests that would change data get a 503 saying saving is paused, and the You tab shows an alert. Reads keep working, so the diver can still open the log, and the phone's error reports still get through, since they matter most at that moment.

The pause lasts until the database is restored, even if a later check passes, because a database that failed once can't be trusted to be whole. A damaged database is also never snapshotted, so the newest snapshot stays a good one, and never migrated.

## Migrations

Schema changes are numbered TypeScript migrations, run in order when the server starts. Before each one the server takes a `VACUUM INTO` copy of the database as `snapshots/pre-migration-<n>-<time>.db`, skipped only for a new, empty database. Each migration runs in its own journalled transaction, and `PRAGMA foreign_key_check` must come back clean before it commits, otherwise it rolls back and the server stops. Foreign keys are off during a migration, as SQLite's table rebuilds need, so that check is the guard.

A server older than the database's schema refuses to start, since older code would write rows it doesn't understand. That is also what makes an update's rollback safe (see [Updates](#updates)).

## Health

`GET /api/health` reports the size of the write-ahead log, the integrity status and whether writes are paused, the dive count, the times of the last snapshot and export, whether the last nightly export failed, and the instance's name. The You tab shows the dive count and the backup times, so an unexplained drop in dives or a stalled backup is easy to notice. The count includes ignored dives, because its job is to reveal lost data.

The same endpoint is Docker's healthcheck: `cli.js health` calls it from inside the container as an allowed login would, and the update script waits on it. A failed integrity check still counts as healthy there, since the server keeps serving reads and the You tab carries the alarm.

## Nightly backups

At midnight in the server's local time zone, the server runs one job:

1. Deletes expired import previews.
2. Writes a consistent snapshot with `VACUUM INTO` to a temporary name, compresses it, flushes it and renames it to `snapshots/shylog-<date>.db.gz` only once complete. A crash part-way never leaves a half-written file under a real name.
3. Prunes snapshots to keep the daily ones for 90 days, the newest of each week for two years and the newest of each month forever. Keeping the newest of each period gives the same set whether pruning runs every night or after a gap. Pre-migration snapshots are never pruned.
4. Writes the UDDF and CSV exports from one read transaction, each to a temporary file that is flushed and checked (the UDDF parsed a dive at a time and its dives counted, the CSV read back and its rows counted), and renames both only once both pass.

A failed snapshot or export is logged and leaves the previous file in place, and a failed export shows on the You tab until an export succeeds. A server that was stopped over midnight runs the job when it starts. The data folder, with the snapshots, the exports and the certification card images, sits under one parent folder that the home server's off-site backup covers, and every format is open: the snapshot opens in any SQLite tool, the UDDF export in Subsurface, the CSV in a spreadsheet. The exports themselves are described in [export.md](export.md).

**Exports run beside the server.** An export of a thousand imported dives takes several seconds, most of it spent passing through what the import kept of each dive and checking the result. On the server's own thread every other request would wait that long, and an export that ran out of memory would end the server before it could record the failure. So the nightly export, Export now and Download UDDF each run in a worker thread with a read-only connection of its own. Write-ahead logging lets it read beside the server's writes, and one read transaction gives it the log as it was when the export began. The check parses each dive on its own, then the rest of the file without them, as one parse of the whole 20 MB file needs more memory than the container's 1 GB allows; that keeps the same guarantee, a well-formed file holding every dive.

**One export at a time, with a heap cap.** The worker's heap is capped at three eighths of the container's memory, 384 MB of the default 1 GB, where a thousand dives need about 64 MB. An export that outgrows it ends the worker alone and fails like any other, leaving the last files in place. Export now or a download during the nightly run waits for it and then reads the log afresh, as two exports at once would double the memory.

Losing at most a day of changes is the accepted worst case: dives logged by hand can be re-entered, and the dive computers keep their profiles until they are downloaded again.

## Restores

Every restore is the same swap, run with the app stopped: the snapshot is unpacked to a new file and its integrity checked before anything is touched, so a wrong name or a damaged snapshot leaves the instance as it was. Then the current database moves aside together with its `-wal` and `-shm` files (the last commits may still be in the write-ahead log), and the snapshot takes its place.

The journal is what turns a day-old snapshot into a precise restore. When bad data has been written but the database is still readable, the server restores the last snapshot from before the damage and replays the moved-aside database's journal onto it, up to a chosen sequence number. Each entry is applied as it was first applied, with its original time, and the entries left out are listed.

| Situation                           | Restore                                           | Replay                                                          |
| ----------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Bad data written, database readable | The last snapshot before the damage               | The journal after it: all, up to a sequence number, or none     |
| Disk lost or database unreadable    | The latest snapshot                               | None possible; up to a day of changes re-entered or re-imported |
| Every snapshot lost                 | A new database built by importing the UDDF export | None; hand and computer markers are lost                        |

The journal can't rebuild certification card images, which are files beside the database, so a restore checks every image the restored database names against its hash and lists any that are missing or changed.

**The restore drill.** A backup that has never been restored is a hope. `cli.js drill` restores last night's snapshot into a scratch folder, replays a copy of the live journal onto it, and compares the result with the live database table by table and row by row, card image files included. It never writes to the live database, so it runs with the app up. The only differences it allows are the ones that are meant to differ: the version id, the backup times and the scratch import previews. CI also runs it inside every image it builds.

## Updates

`scripts/update.sh` updates one instance to the newest published image. If the image hasn't changed it does nothing. Otherwise it takes a snapshot, starts the new image and waits up to three minutes for the healthcheck. If the new server doesn't turn healthy, the script retags the old image and starts it again.

The rollback is safe because of the migration rule: a new server that has already migrated the database leaves a schema the old server refuses to start on, so the old image never writes to a database it doesn't understand. In that case the app is left stopped, and the script prints the restore command for the snapshot it took first. Its exit code says which of the three happened.

## The MCP endpoint

The same process serves an MCP server at `/mcp`, so Claude Code, and Claude Desktop through a small extension, can look a dive up, search the log, log and edit dives, and tidy sites, people, dive centres and trips from a chat. It is a second way in, not a second set of rules: reads come from the same log the app downloads, and each write goes through the same apply functions as a draft upload or an edit, in one journalled transaction. The derived pass and a restore's replay can't tell a dive Claude logged from one the app did.

**Stateless.** Each request gets a fresh server through the MCP SDK's handler, so nothing is kept between calls and a restart loses nothing.

**The app's units, named.** Tools take and give `durationMin`, `maxDepthM` and `oxygenPercent`, never the database's seconds and tenths of a per cent under bare names, where 47 minutes sent as 47 seconds would pass validation. A parameter a tool doesn't know is refused, so a misnamed one can't quietly save a dive without its value.

**Hand beats computer, still.** Everything Claude enters is a hand value. A value sent back exactly as it was read is dropped first, so a figure the server worked out, such as the surface interval or an average depth from the samples, doesn't turn into the diver's own by being repeated.

**No deleting.** There are no tools to delete or restore a dive or to delete a site or person. Those stay in the app, where the diver sees what goes.

**Explore's dive sites too.** Two read-only tools search the dive site map's sites by name, area, type, shore or boat access, depth, the wind and swell, season, skills and what a site is good for (the same tags Explore's filters use), who may dive there and distance from a point, and give a site's named features (pinnacles, a wreck's bow and stern, the shore entry) and its Wikivoyage page as Markdown, or a whole page several sites share, which a log site can link to when the dive was at none of them in particular. They read the same committed files the app ships, imported from the web app and bundled into the server's build, so Claude and the map never disagree. Claude looks the forecast up itself and reads each site's Conditions, which is how "the best shore dive tomorrow" gets answered.

Who may call it is in [security.md](security.md#the-mcp-endpoint).

## Logging

The server writes one JSON object per line to stdout with pino, so Docker collects it and any log shipper, such as Grafana Alloy into Loki, picks it up with no configuration in Shylog. Every line carries its level, an `event` name, the instance (its `TS_HOSTNAME`) and the version (the commit the image was built from), so lines from two instances in one log store are told apart.

**Request ids from the phone.** The app sends an `X-Request-Id` with every API call. The server keeps it if it is well formed, makes one if not, echoes it on the response, and holds it in async context so code deep inside an import logs under the same id without being handed a logger. Each `/api` and `/mcp` request logs one line with its method, route, status, duration and request id, and a refused request adds its reason. Each MCP tool call adds a line with the tool, its outcome and its duration, never its arguments.

**Errors from the phone.** The app reports its own failures (failed syncs, rejected drafts, code that failed to load, uncaught errors) to `POST /api/client-log`, which logs them beside the server's lines under the id of the call that failed, so one query finds both sides of a problem. Reports are capped in size and rate, never queued offline, and write nothing to the database.

**Quiet where it should be.** Routine calls to `/api/version` and `/api/health` log at debug level, as do refusals by the report rate limit, so they never bury everything else. Static files aren't logged.

**No dive contents.** Logs hold ids, counts and timings, never what the diver wrote. Fields named for content (bodies, notes, names, animals, gear) are removed by pino's redaction even if a call passes them by mistake. See [security.md](security.md).
