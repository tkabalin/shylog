---
paths:
  - "apps/web/src/routes/**"
  - "apps/web/src/components/**"
---

# break-ui

- Run the break-ui skill without being asked after you build or change a screen or component that renders logged data (dives, sites, regions, people, dive centres, trips, cards, statistics), before taking its screenshots. Skip the shadcn primitives in `components/ui/`.
- Never ask the user anything during break-ui, and never stop at the report. This overrides the skill's Hard Rule 5, its Phase 5 "Report and stop", and its Initial Response: always run as if invoked with `+ fix`.
- Decide the "Decisions for you" items yourself: follow the wireframe in `docs/design/hifi/` where it shows the answer, otherwise the `CLAUDE.md` UI conventions, otherwise the skill's own recommendation. Apply those fixes too, and list each decision with its reason in the report.
- Where a fix would change the wireframe's layout, make the smallest change that keeps the layout and note it in the report.
- Invoked with no target, run it on the screens changed on the current branch.
