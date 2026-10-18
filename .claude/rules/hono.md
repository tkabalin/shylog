---
paths:
  - "apps/server/**"
---

# hono

- Use the hono skill for server work: routes, middleware, validation, tests, and the RPC types the web app's client uses.
- Shylog is on Hono 4, running on Node through `@hono/node-server`. Ignore the skill's v5-only notes (runtime helpers in separate `@hono/<runtime>` packages, ESM only, Node 22.12): on Hono 4, Node helpers such as `serveStatic` and `getConnInfo` come from `@hono/node-server`. Its Cloudflare Workers, JSX, and streaming sections don't apply.
- Don't install the Hono CLI yet. The skill asks for `@hono/cli@next`, a 1.0 release candidate, which the dependency rules rule out. Check behaviour with `app.request()` or `testClient` in Vitest instead, which is also how the server is tested. Revisit when 1.0 is stable.
- Keep routes chained off the app in `app.ts` so `AppType` keeps inferring them for the typed client.
