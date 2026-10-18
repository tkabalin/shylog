---
paths:
  - "apps/web/src/**"
  - "apps/web/index.html"
---

# apple-design

- Use the apple-design skill for anything a finger moves: sheets and drawers that can be dragged, swipes, pinch zoom (the card viewer), and springs with momentum. Also use it for translucent surfaces, depth, and type tracking and leading. Timed transitions follow `motion.md`.
- A motion library such as Motion is fine to add where springs, velocity handoff, or interruptible gestures need one, under the usual dependency rules.
- Translucent chrome (`backdrop-filter` bars, sheets, and toolbars with content scrolling under them) is welcome even where the wireframe is opaque, as long as the layout still matches the wireframe. Give it a `prefers-reduced-transparency` fallback.
- Keep Geist. Ignore the skill's advice to default to the system font.
