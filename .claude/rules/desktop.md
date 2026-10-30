---
paths:
  - "apps/web/src/**"
---

# Desktop

- Build every new screen, sheet, or form for `desk:` (48rem wide with a mouse or trackpad) in the same change, not as a follow-up. The You tab shipped without it and needed a second PR (#28) to catch up. The decided patterns are in `docs/design/NOTES.md` under Desktop. Desktop should be usable rather than rich, and phones keep their iOS patterns unchanged.
- Switch on `useDesk()` in code and the `desk:` variant in classes. Use `md:` only for layout: the centred column is `md:mx-auto md:max-w-*`, 48rem for the Log and a dive, 36rem for forms and You's screens. A bar inside the column lines up with it through `md:px-[max(0.5rem,calc((100%-<width>)/2))]`.
- Reuse the shared pieces before writing desktop code. Drawers and sheets already open as centred dialogs, with `SheetBar` actions moved into the footer (Cancel and Done or Add on the right, Back on the left). On desktop, option sheets become a `SelectRow` that drops below the row, with `empty` matching the phone row's `PickRow` text. Dates and times use `DatePopover` and `TimePopover` in place of native inputs.
- Headers: a sub-screen shows a `parent › screen` breadcrumb (You's screens use `PageBar` with `crumb`). The page's actions go in the bar as shadcn buttons: outline for Edit and Cancel, filled for Save. A Save that only applies after an edit is always shown and disabled until there is one; it doesn't pop in.
- A screen with edits that aren't saved yet guards leaving on desktop with `LeaveGuard` and a "Discard changes?" dialog (Keep editing / Discard changes). Actions that leave on purpose, such as delete or merge, skip it.
- Size controls for a mouse: a search field is `desk:h-9 desk:rounded-lg`, as the Log's is. Phone touch targets stay as they are below `desk:`.
- Check the result with a desktop e2e test (in `shell.spec.ts`'s "at desktop width" block) and screenshots at 1280 and 800px wide in both themes, as well as the usual 390px phone shot.
