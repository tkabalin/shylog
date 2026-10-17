# Shylog

> Self-hosted, mobile-first PWA for logging scuba dives. One diver, reached only over Tailscale. SQLite on the server is the source of truth; UDDF is how data arrives (Subsurface imports) and leaves (nightly export).

## General rules

SPEC.md is the source of truth for the **backend spec, implementation details, and tech stack**

The Claude Design Hi-Fi wireframes are the source of truth for the **UI/UX**

- For example, if a field is not shown on the wireframes but is mention in the spec, presume the spec is outdated BUT flag this to the user

- However, follow implementation details in the SPEC, such as to use shadcn components, rather than copying the code of components exactly from the wireframes

**Subsurface as a reference**: Shylog is not a recreation of Subsurface, but Subsurface's open-source code ([subsurface/subsurface](https://github.com/subsurface/subsurface)) is a useful reference. The goal of this project is not to reinvent the wheel, but rather create a dive logging app that suits my needs with an attractive UI. When building Shylog, Claude can check it for ideas or advice on technical problems such as profile scaling, sample handling, UDDF, and dive computer data, so problems it has already solved are not solved again. The profile chart rules in the spec came from `core/profile.cpp` and `profile-widget/`.

## How to read the spec

- Build only what the current spec describes. These parts are history, not requirements:
  - the **Before** column of the **Design changes** table
  - the whole **Review history (not requirements)** section (many of its resolutions were later replaced)
- Everything under **Not in v1** and **Later** is out of scope. Do not scaffold for it beyond what **Instance configuration** requires.
- If the spec contradicts itself, or a design screen contradicts the spec, stop and ask. The spec wins over the design for behaviour; the design wins for layout.

## Stack (all decided, do not substitute)

- pnpm workspace: `apps/web`, `apps/server`, `packages/core`
- Web: React, Vite, vite-plugin-pwa, shadcn/ui with preset `b1sAmWXiM` (cyan accent and chart colour, Inter), shadcn charts (Recharts), Dexie
- Server: Node LTS, TypeScript, Hono (typed RPC client used by `apps/web`), better-sqlite3 (not `node:sqlite`), @xmldom/xmldom, tsup for the build
- Validation: Zod schemas in `packages/core`, shared by client and server
- Deployment: Docker Compose on the home server, app plus a Tailscale sidecar, HTTPS via Tailscale Serve
- Testing (proposed, confirm in the planning session): Vitest for unit and integration tests, Playwright for the web app

## Rules that are easy to get wrong

- **Units**: metric in the app; database units per the spec's Units table. Gas fractions are integers in tenths of a per cent (324 = 32.4%), cylinder volumes integers in millilitres. Never compare floats for grouping.
- **Time**: dive times are local wall-clock strings at the site, with no zone or offset. Do not introduce `Date` objects with time zones into storage or ordering.
- **Hand beats computer**: an import never overwrites a hand-entered value. `field_meta` records the source of each field.
- **Calculations** (SAC, MOD, max PO₂, CNS, OTU, vertical rate, average depth, surface interval) follow Subsurface's code exactly as described in the spec, including its rounding. Max PO₂ setting defaults to 1.4 bar, not Subsurface's 1.6. When unsure, read the referenced function in github.com/subsurface/subsurface rather than inventing a method.
- **Offline**: only new dives can be created offline, as drafts. Edits to synced data are plain API calls that need a connection. Do not build a general offline op queue.
- **Ids** are client-generated, start with a letter (e.g. `dive-<uuid>`), and are valid UDDF ids.
- **Config**: nothing assumes a single instance. Logins, hostname, origin, data directory, and app name come from env (`SHYLOG_ALLOWED_LOGINS`, `TS_HOSTNAME`, `SHYLOG_ORIGIN`, `SHYLOG_DATA_DIR`, `SHYLOG_APP_NAME`). No hard-coded paths, ports, `container_name`, or named volumes.
- **Security**: checks apply to `/api/*` only. The dev identity bypass must refuse to start in production.
- **Data safety**: every write is one transaction and journalled in `ops`. Schema changes are numbered migrations preceded by a snapshot.

## UI conventions

- Phone first, used with wet hands: touch targets about 44px below `md:`, 16px input text, bottom navigation on phones, sidebar from `md:` up.
- Sentence case headings, no serif fonts, tabular numerals for figures, one accent colour used sparingly.
- Native date and time inputs. `inputmode="decimal"` for decimals, `inputmode="numeric"` for whole numbers, `type="number" step="0.1"` for fields that can be negative. Accept a comma as the decimal separator.
- Every chart has a table alternative for screen readers. Sync states use words and icons, not colour alone.
- Statistics and the profile chart are lazy-loaded chunks.

## Workflow

- A milestone is done only when typecheck, lint, and tests pass and its acceptance criteria in are met. Show the evidence (test output, screenshots) rather than asserting it.
- For UI work, run the app and take a Playwright screenshot at phone width (390px) to compare with the matching design screen.
- Use conventional commits.
- Do not push without asking.
- Git worktrees should be placed in `.claude/worktrees`

## Code Style

- Don't abstract or extract shared code until there are at least two call sites needing it — either two real usages, or one usage plus a second that's definitely coming. A merely hypothetical future usage doesn't justify the abstraction.
- Comment the **why**, not the what. This codebase deliberately keeps reasoning next to the code, so don't strip comments out or leave a non-obvious decision bare.
- Keep a comment block to about three lines, and to the length of the comments already in that file.
