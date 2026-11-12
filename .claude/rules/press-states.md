---
paths:
  - "apps/web/src/**"
---

# Press states

- A tappable row's pressed tint uses the `data-press:` variant (`data-press:bg-muted data-press:duration-0`, `has-data-press:` for a row around its control, `group-data-press:` inside one), never `active:`. `lib/press.ts` sets `data-press` on a touch only once it has held still for about 90 ms, and flashes it on a quick tap, as native iOS lists do, so a finger that starts a scroll doesn't light up every row it lands on (the owner's choice, 12 November 2026).
- Buttons, chips and other controls that dim or scale on press keep `active:`, which answers on the first frame.
- Hover stays `hover:` (or `control-hover:`), which Tailwind already limits to devices that hover.
