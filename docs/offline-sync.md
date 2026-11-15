# Offline sync

How the phone keeps working with no signal, and how what it holds gets to the server without being lost or doubled. The tables the phone mirrors are described in [data-model.md](data-model.md), the server's transactions and journal in [server.md](server.md), and the tests behind these rules in [testing.md](testing.md). The full rules, down to every edge case, are in the [spec](planning/SPEC.md); this page covers the design and the reasons for it.

## What works offline

Dives are often logged far from signal, on a boat or at a remote shore site, and the one thing that can't wait for a connection is recording the dive just done. So the whole log can be read offline, and a new dive can be logged, edited and deleted offline as a **draft**, along with any site, region, person, dive centre or trip it creates. Everything else is an ordinary API call that needs the server: editing, deleting or restoring a synced dive, renaming, merging or deleting an entity, changing settings, certification cards and the packing checklist.

**Why there is no general offline queue.** A queue of arbitrary edits needs a merge rule for every pair of changes two devices could make apart: a rename on one phone against a merge on another, an edit against a delete, two edits to the same field. Each of those rules is a place where a hand-entered value can quietly disappear. Limiting offline writes to creating new things leaves one kind of conflict, a duplicate, which a deduplication key settles (see [Conflict rules](#conflict-rules)). Edits to older dives are rarely urgent and can wait for signal.

While the phone is offline, or the server can't be reached, the controls that need the server are disabled, with a small wifi-off or server-off icon in the screen's bar. The disabled controls are the message, so no sentence repeats it.

**Edits to synced data** send only the fields that changed, validated with the same Zod schemas the server uses from `packages/core`. Each is applied in one transaction and journalled, and every one is safe to repeat: it sets fields rather than adding to them, entities created from the You tab get client-generated ids as drafts do, and deleting or restoring a dive twice changes nothing. If the connection drops before a reply, the form keeps its values and offers to try again.

## Two databases on the phone

The phone holds two IndexedDB databases through Dexie, deliberately separate:

- **The mirror** (`shylog`, `apps/web/src/data/db.ts`) has one table per collection of `/api/log`, plus each dive's profile samples and each certification card's images.
- **The queue** (`shylog-queue`, `apps/web/src/data/drafts.ts`) holds drafts, their queued ops, the device id and the dive form's autosaved values.

The rule: a sync clears and replaces the mirror, and never touches the queue. The mirror can always be fetched again; a draft exists nowhere else. The queue has its own schema version, so newer app code can migrate drafts that older code wrote.

### The mirror

A sync asks for `/api/log` with the version the mirror holds as its ETag. An unchanged server answers 304, which costs one small request. A changed one sends the whole log without samples, and the phone replaces every table in one Dexie transaction, so a screen never reads half of two versions. Fetching the whole log on any change is a deliberate simplification: an instance has one diver and a few devices, so the log stays small and there is no per-row change tracking to get wrong.

The log stays small because samples are kept out of it. Each dive carries what the list and the statistics need from its profile instead: a 24-point downsampled depth line for the Log's sparkline, its count of ascent alarms, its safety stop, and the time under water and mean depth that SAC needs. After each sync the phone downloads the profiles it doesn't have in the background, 25 dives a request, so every chart opens at once and works offline. Each kept profile is stored with a digest of the figures the log carries from it, so a profile that a later import replaced is fetched again. Card images are fetched the same way, keyed by the hash of each page.

Drafts are laid over the mirror when the log is read into memory, each with a provisional dive number, so a dive logged offline appears in the Log beside the synced ones.

**A newer server.** If `/api/log` reports a newer schema version than the app understands, the app stops syncing, keeps its queue, and offers to reload into the new version. It keeps asking with that version's ETag, so a server rolled back to an older version is noticed with a 304-sized request.

## Drafts and the queue

Saving a new dive writes the draft, its `upsertDive` op and an `upsertEntity` op for each entity it creates in one Dexie transaction, so neither is ever saved alone. The ops are parsed with the server's own request schema before the transaction commits, so a draft that could never upload is refused on the phone. Editing a draft rewrites its ops with fresh op ids, and deleting it removes them.

```ts
type Op =
  | (Base & {
      type: "upsertEntity"
      kind: EntityKind
      id: string
      fields: Record<string, unknown>
    })
  | (Base & { type: "upsertDive"; diveId: string; fields: DiveFields })
// Base carries opId, opVersion, deviceId and the time it was queued.
```

Drafts upload one at a time, oldest first, each as one `POST /api/ops` request carrying all of that draft's ops. The server (`apps/server/src/apply/draft.ts`) refuses an op version it doesn't support, accepting the current and previous ones so an installed copy a release behind can still upload. It skips any op id already in its journal, applies the rest in one transaction, journals them, commits, and only then replies. A draft is saved whole or not at all, and an accepted draft is never lost to a crash between the write and the reply.

| Reply           | What the phone does                                                                   | Why                                                                         |
| --------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 200             | Fetch the log, then drop the draft once its dive is in the mirror                     | The dive never leaves the screen between the two                            |
| 400 or 422      | Keep the draft with the server's reason on its card; it goes again only once edited   | A refusal that no retry will clear, such as a site deleted on another phone |
| No answer       | Leave the queue, show Can't reach the server, retry from 5 s doubling to five minutes | Tailscale is off, or the server is restarting                               |
| Any other error | Leave the queue, show Couldn't upload, retry on the same backoff                      | The server was reached, so there is nothing on the phone to check           |

An edit made while an upload is in flight replaces the ops that were sent. Before dropping or refusing a draft, the phone checks that the ops it sent are still the queued ones, and if they aren't, the new ones go on the next round.

## Re-sent uploads

Every upload is safe to send twice. Applied op ids are recorded in the server's ops journal, so a draft re-sent after a lost reply is recognised and changes nothing. Refused op ids are not recorded, so a draft fixed on the phone can be sent again, and since editing a draft always gives it fresh op ids, it is never skipped as already seen.

**The lost reply, then an offline edit.** The awkward case is a draft whose first upload landed but whose reply never arrived, and which was then edited offline. Its new op ids are fresh, but its dive id already exists on the server. The server applies it as an edit of the fields it carries, under the same rules as a hand edit, and doesn't refuse it as a duplicate.

That raises a second problem: a field the diver emptied offline is simply absent from the new upload, and an edit keeps whatever it leaves out, so a cleared note or buddy would come back. So a draft remembers every optional field it has held since it was saved, and sends each one it has lost as `null`, which an edit clears and a new dive ignores. A field the draft never held is left alone, so a change made on another device between the two uploads survives.

A draft for a dive that has since been moved to Recently deleted is refused, as is an op queued more than two years ago. Journal replay during a restore bypasses the age rule.

## Conflict rules

**Hand beats computer.** Every dive field records whether its value was typed or came from the dive computer, and an import never overwrites a typed value, with two narrow exceptions described in [import.md](import.md).

**Entities are matched by key.** A draft can create a site, region, person, dive centre or trip, and two phones offline can each create the same one under different ids. On upload the server looks for an existing entity with the same deduplication key: a site or region's name within its country, and a person, dive centre or trip's name, each normalised to ignore case, spacing, accents and curly versus straight quotes. A match records the draft's id as an **alias** of the existing entity; otherwise the entity is created. If two of a dive's people turn out to be one person, they become one, keeping the role named by their own id, and the draft isn't refused.

**Merges are online only**, from the You tab. The merged-away row is deleted and its id becomes an alias. Aliases resolve transitively, so a draft that still points at an entity merged twice since lands on the survivor.

**Deletes are remembered.** Every deleted site, region, person, dive centre and trip is recorded, so a re-sent draft that names one is refused with the reason on its card rather than bringing it back, and a repeated delete changes nothing.

**Renames are online only.** A rename that would collide with another entity's key is refused in the form, which offers to merge instead. An `upsertEntity` for an id that already exists, or is an alias, uses that entity as it is, so an offline draft can't undo a rename made since.

## When the phone syncs

iOS has no background sync for web apps, so nothing happens unless the app is open. The phone syncs on launch, on returning to the foreground, when the browser reports it is back online, every five minutes while the app is open, and after each upload. Each sync also starts the upload of anything waiting, so a draft whose upload failed earlier goes as soon as the server answers.

**No answer and a wrong answer are different.** A sync that gets no answer while the phone reports a connection means the server is out of reach, usually Tailscale turned off or the server restarting after a deploy, so it is retried after a few seconds, backing off to the five-minute check. A proxy's 502 or 504 counts as no answer, as that is what Tailscale Serve says for a server that is down. A sync the server answered with an error is a fault on the server, and asking again within seconds would only repeat it, so it waits for the five-minute check, a return to the app, or Try again.

## Sync states

Each state has its own icon and its own words on the You tab's sync card and for screen readers, so colour is never the only signal. On the Log the state is a badge on the shyshark logo, in the accent colour, and in the warning colour only where the diver has to act (see [ui.md](ui.md)).

| State                     | Icon         | Meaning                                                          |
| ------------------------- | ------------ | ---------------------------------------------------------------- |
| Synced                    | none         | Nothing waiting                                                  |
| Syncing                   | cloud upload | Drafts waiting with the server in reach, or one on its way       |
| Offline                   | wifi off     | No connection; new dives save on this device                     |
| Can't reach the server    | server off   | A connection, but no answer from the server                      |
| Server ran into a problem | server bolt  | The server answered a sync with an error                         |
| Couldn't upload           | warning      | The server answered an upload with an error; the drafts are safe |
| Not synced                | warning      | The server refused a draft; open it to see why                   |
| Syncing paused            | cloud pause  | The server is on a newer version; reload to update               |

While drafts wait, the sync card says how many and when the oldest was saved on this device, which is not the same as the dive's own date.

## Keeping drafts safe on the phone

A draft that hasn't uploaded exists only in the browser's storage, and browsers may clear it. On first launch the app calls `navigator.storage.persist()`, and once more on the first launch from the Home Screen, since Chrome grants persistence more readily to an installed app. It doesn't ask every launch, as Firefox shows a prompt each time.

iOS is the real risk: Safari can clear a site's data, and WebKit grants persistence mainly to web apps added to the Home Screen. So the You tab shows whether storage is protected, and its help steers towards installing the app, with only the steps for the phone in hand. iOS gets no Keep them safe button, since the request does nothing in a Safari tab.

**The last resort.** The You tab can save every draft on the phone, refused ones too, to `shylog-waiting-dives-<date>.json`. Each draft is stored as the `/api/ops` request body its upload would send, so if the phone is failing, each one can be sent back from a computer with a single request. Re-sent ops are idempotent, so sending one that already landed changes nothing. The file is built from the queue alone, so it works offline.

## The service worker and updates

The service worker, built with vite-plugin-pwa, precaches the app shell and every lazy-loaded chunk, so the app opens with no signal and the statistics and profile chart still load. Navigations fall back to the cached page, except `/api/` requests, which always go to the server.

**Nothing reloads by itself.** A new version installs in the background and waits. The phone checks for one on every return to the foreground, so a deploy is ready by the next launch rather than the one after. The app then offers a reload as a toast on every tab, under three rules:

- **It waits for the queue.** Drafts are sent by the code that wrote them, so the offer appears once the waiting drafts have uploaded. Refused drafts don't hold it back, so a bug fix can never be blocked by the draft it fixes.
- **It never interrupts typing.** The toast is held back while the dive form, an import step, or any form or sheet with unsaved edits is open, and appears once it closes.
- **Swiped away, it stays away** until the next launch, which takes the new version anyway.

Only the window that asked reloads; other open windows keep the code they loaded until their next launch, so an update in one tab never reloads a form open in another. A server on a newer schema is the exception to the wait: it accepts nothing from this app, so its offer appears at once, and Syncing paused stays on the You tab until the reload.
