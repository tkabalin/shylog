---
paths:
  - "apps/web/src/**"
---

# Motion

## Building

- Build every transition and animation with the animate skill, starting from its `RECIPES.md` when one matches. Motion a finger drives (drags, swipes, pinch, springs with momentum) also follows apple-design.
- Where animate says to hand a component to `pick-ui-library`, use shadcn and Base UI instead. That skill isn't installed.
- Run animate's frequency gate against Shylog's use. Tab switches, opening a dive from the Log, and theme changes don't animate. Sheets, pickers, and dialogs get a standard transition. Rare moments, like a finished import, can carry a little delight.
- No stagger on lists that are opened often (the Log, sites, people). The "Everything entering at once" rows in animate and review-animations don't apply to them.
- Put the curves (`--ease-out`, `--ease-in-out`, `--ease-drawer`) in `index.css` once, as Tailwind theme tokens, the first time one is needed. Don't repeat `cubic-bezier()` values in components.
- Rebuild the wireframes' motion instead of copying it: keep what moves and roughly how long it takes, then follow animate. The Log's `max-height` collapse is not rebuilt: its count scrolls away with the list like an iOS large title and the compact line fades in, so nothing animates height mid-scroll (D27), and the Edit dive switch moves its knob with `transform`, not `left`.
- When a screen first uses a shadcn primitive whose motion fails review-animations (for example the sheet's `ease-in-out`, or `transition-all` on Button), fix it in place in the same change.

## Adding motion the wireframes don't show

- After building or changing a screen, run the find-animation-opportunities skill on it. Then build every suggestion that passes its gate with animate, without asking first. Its "never modify source" rule covers only its own search pass.
- Tell the user what you built, one line each: where, what moves, and why (its purpose and frequency tier). Also list what it rejected and why.

## Checking

- Before calling any motion done, review it against review-animations. Claude can't invoke that skill, so read `.claude/skills/review-animations/SKILL.md` and `STANDARDS.md` and apply them to the diff. Fix every finding without asking, then review again until the verdict is Approve.
- Check every animated `backdrop-filter` or `blur()`, and every animation driven by Motion, against the animation-performance skill. Translucent chrome over scrolling content is the likeliest place for Safari on a phone to drop frames. List the findings that need a recording on a real phone in your report.
