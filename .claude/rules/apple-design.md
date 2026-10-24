---
paths:
  - "apps/web/src/**"
  - "apps/web/index.html"
---

# apple-design

- Use the apple-design skill for anything a finger moves: sheets and drawers that can be dragged, swipes, pinch zoom (the card viewer), and springs with momentum. Also use it for depth, and type tracking and leading. Timed transitions follow `motion.md`.
- A motion library such as Motion is fine to add where springs, velocity handoff, or interruptible gestures need one, under the usual dependency rules.
- Chrome is opaque: bars, sticky headings, toolbars, and the tab bar use a solid `bg-background`, never `backdrop-filter` or a see-through background, even where the skill suggests translucency. Content showing through a stuck bar read as a blur bug on the phone, so the app standardised on solid chrome.
- Keep Geist. Ignore the skill's advice to default to the system font.
