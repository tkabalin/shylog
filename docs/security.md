# Security

Who can reach a Shylog instance, how the server decides whether to answer, and what is left where. The network and container setup is described in [tech-stack.md](tech-stack.md), what the server logs in [server.md](server.md), and the deployment steps, tailnet policy and smoke test in the [README](../README.md#deploying). The full rules are in the [spec](planning/SPEC.md).

## Threat model

An instance holds one diver's log: dates and places of dives, the names of buddies and instructors, free-text notes, and photos of certification cards. None of it is valuable to a stranger, but all of it is personal, and the log is irreplaceable to its owner. The design aims to keep it unreadable to anyone else and unwritable by anything but the diver's own app.

| Who                                          | How they could reach the app                                  | What stops them                                                                    |
| -------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Anyone on the internet                       | They can't: the app has no public address                     | Tailscale, and a container that listens only inside the sidecar's network          |
| Other people on the tailnet                  | Through the tailnet, if the policy lets them                  | The tailnet policy, then the allow-list of logins                                  |
| A website open in the diver's browser        | Through the diver's own browser, which can reach the tailnet  | The `X-Shylog` header, the `Origin` check and the content type check               |
| A crafted import file                        | Uploaded by the diver, believing it to be a Subsurface export | Size caps, a strict reader, and scrubbing of anything passed through to the export |
| A bug or a compromised dependency in the app | Running inside the container                                  | A read-only, unprivileged container with no capabilities                           |

There are no accounts, passwords or sessions in Shylog, so there is nothing to phish, brute force or leak from a database of credentials. The trade is that identity rests entirely on Tailscale.

## Tailscale is the front door

The app is never on the public internet. Each instance runs as two containers: a Tailscale sidecar that joins the tailnet under the instance's hostname, and the app, which shares the sidecar's network namespace, listens on 127.0.0.1 only, and publishes no ports. The only way to reach the server is through Tailscale Serve in the sidecar, which terminates HTTPS with a real certificate for the tailnet name and forwards to the app.

**The tailnet policy.** Tailscale's default policy lets every device reach every other, so the README replaces it with grants that let each node be reached on port 443 only by its own diver's login, plus the owner's for support. The second diver reaches their instance through a node shared with their Tailscale account and can't reach the owner's at all.

## Identity from Tailscale Serve

When Serve forwards a request, it adds a `Tailscale-User-Login` header naming the Tailscale user on the calling device, and strips any copy the client sent, so the header can't be forged from the browser. The server checks it against the instance's allow-list, `SHYLOG_ALLOWED_LOGINS`. No login is written in the code: each instance's list comes from its env file, with the owner's login on both instances and the second diver's only on theirs.

Devices with a tag, such as servers, get no identity header from Serve, so only personal devices of an allowed user can use the app. Serve sends a login with non-ASCII characters as an RFC 2047 encoded word, which the server decodes before comparing, so such a login isn't refused by mistake.

A request that fails the check gets `403 Login not allowed`. The README's smoke test checks this on every new instance, including the shared node.

## Requests from other websites

The tailnet keeps strangers out, but not the diver's own browser. Any website open in another tab can make the browser send a request to the instance's hostname, and Tailscale would carry it with the diver's identity. Without more checks, a malicious page could submit a form that deletes a dive. Three checks close that:

**The `X-Shylog` header.** Every API request must carry it, with any value. A browser lets a page on another origin add a custom header only after a CORS preflight, which the server never approves, so a cross-site request either arrives without the header and is refused, or never arrives. The app's API client adds it to every call.

**The `Origin` on writes.** Every request that changes data must also send an `Origin` exactly matching `SHYLOG_ORIGIN`. Browsers set this header themselves, so it catches a cross-site write that somehow got past the first check.

**The content type on writes.** A request with a body must send the type its route takes: JSON for draft uploads and edits, the UDDF file for an import, multipart only for a certification card's images. HTML forms can send only form encodings and plain text without a preflight, so a forged form is refused here too.

None of this needs a token, a cookie or a session, which an app with no accounts doesn't have.

## Checks apply to `/api/*` only

The checks run only on the API. The app's HTML, scripts, manifest and service worker are fetched by the browser itself, which can't add a custom header to them, and they hold no dive data: the app's code is public in the repo anyway. Everything with data in it, from the log to a certification card image, is under `/api` and passes every check. The health endpoint is no exception, so even the instance's dive count needs an allowed login.

## The development bypass

In development there is no Tailscale in front of the server, so `SHYLOG_DEV_LOGIN` supplies a login in place of the header. It is used only when the header is absent, and must itself be in the allow-list. The server refuses to start with it set in production, and an unset `NODE_ENV` counts as production, so forgetting to set the environment in a deployment can never turn the bypass on. The same rule covers the one other development-only setting, an alternative folder for the built app.

## Limits on what a request can send

A JSON body over 5 MB is refused before it is parsed, an import file over 25 MB, a card image over 10 MB, and an error report from the phone over 16 KB, with reports also capped at 30 a minute. Every request body is validated against the Zod schemas in `packages/core` before it reaches the database, and every write runs in one transaction, so a malformed request changes nothing.

**Import files are untrusted.** An import file comes from the diver, but it is still XML from another program, and parts of it are kept: standard UDDF elements Shylog doesn't model are stored and written back into the export. A crafted file could otherwise use a processing instruction or a CDATA section to break out of such an element when the export is written, so comments, processing instructions and CDATA are stripped from everything passed through, characters XML can't hold are dropped, and only the root's namespace is rewritten. The reading itself is in [import.md](import.md).

**Card images are checked by their bytes.** The server reads an uploaded image's type from its first bytes rather than trusting the type the browser sent, accepts only PNG, JPEG and WebP, and serves it with `X-Content-Type-Options: nosniff`, so a file can't be passed off as something a browser would run.

**Exports guard their readers.** In the CSV export, a text cell that a spreadsheet would read as a formula, such as one starting with `=`, gets a leading apostrophe, so a note can't run as a formula in Excel or Sheets. See [export.md](export.md).

## The container

The app container runs as the unprivileged `node` user, on a read-only filesystem with only `/tmp` writable in memory and the instance's data folder mounted. It drops every Linux capability, can't gain new privileges, and has memory and process limits so a fault can't take the host down with it. Base images are pinned by digest, so a rebuilt tag can't change what runs unseen, and pnpm refuses any dependency release younger than three days.

Downloading from the dive computer needs the USB cable, so an optional Compose override grants exactly that: the host's `/dev` mounted read-only without its submounts, permission to open USB serial devices, and membership of one group that a udev rule gives the cable alone. Any other serial device on the host stays out of reach. CI checks that the override grants nothing more, and that no instance publishes a port or uses a named volume.

## What the logs never contain

Logs hold ids, counts and timings, never what the diver wrote: no dive notes, no names of sites or people, no request bodies. Fields named for content are stripped by the logger even if code passes them by mistake. The request id the phone sends is logged only if it matches the expected pattern, and replaced otherwise, so arbitrary text in a header can't reach the log. Logs can then go to a shared log store without carrying the diver's data with them.

## Data on the device

The phone keeps a copy of the log so it works offline: every dive with its profile, the sites and people, the certification card images, and any drafts not yet uploaded, all in the browser's IndexedDB for the instance's origin. A few preferences, such as the theme, live in local storage, and the import review keeps its choices in session storage until it is applied.

That copy is protected by the device itself, its lock screen and its storage encryption. There is no sign-out, since there is no account: removing the data from a device means removing the app or clearing the site's data. Each instance has its own hostname and so its own origin, so the owner's log and the second diver's never share a store, even installed side by side on one phone. The page also asks search engines not to index it, in case an instance is ever exposed by mistake.
