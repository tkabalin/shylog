# Reference

## Folding review fixes into their commits

The branch should read as if each commit was right the first time. Never create `fixup!` commits.

1. Stage everything with `git add -A`, then save one patch per target commit, scoped by path: `git diff --cached -- <paths> > <scratchpad>/patches/<name>.patch`.
2. Check that the patches cover every file in `git diff --cached --name-only`, then keep a backup with `git stash push -m review-fixes`.
3. Rebase from the branch's fork point, so a freshly updated `main` doesn't move the base too. Mark the targets by **subject**, not hash; a hash-based sed no-ops silently. The subjects below are placeholders, and regex characters such as `(` need escaping:

   ```bash
   GIT_SEQUENCE_EDITOR="sed -i -E 's/^pick ([0-9a-f]+) (feat\(web\): add the|ci: run)/edit \1 \2/'" \
     git rebase -i "$(git merge-base main HEAD)"
   ```

4. At each stop: `git apply --index <patch> && git commit --amend --no-edit && GIT_EDITOR=true git rebase --continue`.
5. Confirm `git diff stash@{0} HEAD` is empty, then drop the stash.
6. To reword, mark the commit `edit` the same way and run `git commit --amend -F <message file>`.

Each patch must apply to the commit's own version of the file. If `git apply` fails or `rebase --continue` stops on a conflict, run `git rebase --abort && git stash pop`, then fold that hunk into the later commit that last touched the file, or ask.

## Putting the app next to a board

The boards in `docs/design/hifi/` need Claude Design's runtime (`support.js`) to render, so they can't be opened directly.

1. From the board, copy the `<style>` block inside `<helmet>` and the markup for the part being compared. Replace `{{...}}` bindings with the board's default values, which are in its `data-props` and `renderVals()`. Drop `<sc-if>`/`<sc-for>` wrappers, keeping the branch the board shows by default.
2. Wrap it in a page whose root element has the classes the board's root class expression produces for its defaults (for `LogHifi2`, `xiess sl cyan`, adding `dark` for dark mode). Load Geist from Google Fonts.
3. Screenshot it at 390 × 844 with Playwright's library, imported by absolute path since the script lives in the scratchpad: `<repo root>/node_modules/.pnpm/node_modules/playwright/index.mjs`. Await `document.fonts.ready` first.
4. Compose app and board side by side with PIL, labelled, with a 2x crop of the area being compared.

App screenshots may go in the gitignored `apps/web/e2e/__screenshots__/`. Board renders and composites go in the scratchpad.

## Briefing the visual reviewer

Give it the diff scope (`git diff --name-only <base>...HEAD`), the routes and components the branch added or changed, the boards they follow, how to start the app (API server with its seed, then Vite), and the scratchpad folder for its shots. Ask it to cover, for each screen:

- 390 px in light and dark, and 1024 px where the layout changes;
- the whole page, scrolled through, with each sheet, drawer, picker and menu open;
- loading, empty and error states, forced with `page.route` (hang or fail the API), and worst-case data such as long names, missing fields and large numbers;
- pressed, focused and disabled states where the branch styles them.

Reading an image downscales it, so it must crop each area of interest at 2x with PIL and read the crops, not only full pages or contact sheets. What to look for: misalignment and uneven spacing, clipped, overflowing, truncated or overlapping text, wrong or low-contrast colours, anything that breaks in dark mode, inconsistent type sizes or weights, figures without tabular numerals, touch targets under about 44 px, content under the safe areas or sticky bars, layout shift between states, and differences from the board. Each finding names the screen, state, theme and width, the screenshot path, and what looks wrong. It logs console errors while it works and reports those too.

## Local quirks

- On `/mnt/c`, Vite's first dependency optimisation takes more than 30 s and the first e2e run times out. Run it again once `apps/web/node_modules/.vite` is warm.
- Wait on a server by probing its port (`until curl -s localhost:PORT; do sleep 1; done`), never with `pgrep -f`, which matches the waiting shell itself.
