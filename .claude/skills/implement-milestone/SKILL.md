---
name: implement-milestone
description: Implement one milestone from docs/PLAN.md end to end, from spec to a reviewed branch and a drafted PR.
argument-hint: <milestone number>
disable-model-invocation: true
---

# Implement a milestone

Implement milestone `$ARGUMENTS` from `docs/PLAN.md`. If that isn't a milestone number in the plan, ask which one. The milestone is done when its acceptance criteria are met with evidence, the branch has passed two review rounds, and the user has a PR description to approve. Never push or open the PR without asking in that turn.

The word "milestone" stays out of code comments, commit messages, branch names, and the PR title and body. Describe the change itself.

Every shell needs `source ~/.nvm/nvm.sh; nvm use` first (`.nvmrc` pins Node 24). Mechanics for the fiddlier steps are in [reference.md](reference.md).

## 1. Load context

- Read `CLAUDE.md`, then from `docs/PLAN.md`: the conventions at the top, the decisions table, "Milestones at a glance", this milestone's section, "pnpm scripts", "Still open", and the previous milestone's **Notes for the next session**.
- Read the `docs/SPEC.md` sections the milestone's **Implements** line names, the boards it names in `docs/design/hifi/`, and `docs/design/NOTES.md`.
- Check the **Depends on** column in "Milestones at a glance" against the codebase, not the checklist ticks: for each milestone listed, the files its **Touches** line names exist and its acceptance criteria look met. Any other prerequisite there or in "Still open" (a fixture, figures the owner records) must be met too. If something is missing, stop and say so.

## 2. Preflight

- If `docs/PLAN.md` has uncommitted ticks or notes from the last session, ask the user whether to commit them first. Any other uncommitted change: ask.
- Bring `main` up to date and branch from it: on `main`, `git pull --ff-only`; elsewhere, `git fetch origin main:main`. If git refuses because `main` is checked out in another worktree, `git fetch origin` and branch from `origin/main`. Name the branch `feat/<short-slug>` (or `fix/`, `docs/`), never after the milestone.

## 3. Settle ambiguity before building

Collect anything the build would otherwise guess at: spec against board conflicts, choices the spec leaves open, items under "Still open" that this milestone touches, and anything the previous notes deferred to it. Ask them together, in as few AskUserQuestion calls as possible (up to four questions each), recommended option first. The spec wins for behaviour and the board for layout; when they disagree on anything else, ask.

## 4. Docs first

Decisions from step 3 that change `docs/SPEC.md`, `docs/PLAN.md` or `CLAUDE.md` go in a `docs:` commit before any code, so the spec stays the source of truth. Docs that describe new code follow that code in their own commit.

## 5. Build

- Commit as you go: atomic conventional commits (scope with `web`, `server`, `core` where it helps), each scoped with a pathspec, a subject plus one or two short paragraphs, ending with the `Co-Authored-By` line. Tests go with the code they test.
- Dependencies: the newest stable release that is at least three days old, unless a peer range or engine forces an older one. `pnpm-workspace.yaml` enforces the age (`minimumReleaseAge`) and blocks trust downgrades (`trustPolicy`), so a fresh release fails the install; lower the range rather than adding an exclusion, and give any exclusion a comment saying why. Check with `npm view <pkg> time engines peerDependencies` and `pnpm peers check`. Record every new or changed dependency with its version and reason for the PR. GitHub Actions follow the same rule and are pinned to a commit SHA with the version in a comment.
- Prefer the standard layout of each tool. Flag anything unusual in the PR rather than inventing structure.
- UI: follow the shadcn skill (run its commands from `apps/web`), the UI conventions in `CLAUDE.md`, and the board for layout. After adding a route file, run Vite once (`pnpm --filter @shylog/web dev` or `build`) so the router plugin regenerates `routeTree.gen.ts` before `pnpm typecheck`.

## 6. Verify

- Run typecheck and lint in full: `pnpm typecheck`, `pnpm lint`.
- Run only the test files this milestone names or touches: `pnpm vitest run <paths>` and `pnpm test:e2e <specs>`. Never `pnpm check` or a bare `pnpm test`, even where an acceptance bullet names them; CI runs the whole suite and meets those bullets.
- Check each acceptance bullet and keep the evidence: command output, file listings, screenshots.
- UI work: Playwright screenshots at 390 px (and 1024 px where the layout changes) in light and dark, kept out of git. Put each next to its board with the method in [reference.md](reference.md), and look at every pair yourself before claiming a match.

## 7. Review, twice

For each of two rounds:

1. Bring `main` up to date as in step 2. If it can't be moved, keep the review's findings to files in `git diff --name-only origin/main...HEAD`.
2. Run `/code-review high --fix --max-findings all`. If the branch touches `.github/`, `playwright.config.ts`, `vitest.config.ts` or package scripts, also start a separate subagent in parallel that reviews only the CI and test setup for correctness, speed and hardening, and reports without editing.
3. Fix every finding from both, including those the reviewer skipped, unless one needs the user's decision or contradicts the plan; list those with the reason.
4. Fold each fix into the commit it belongs to, and reword any commit message that no longer fits (see [reference.md](reference.md)). A fix that is its own logical change gets its own commit; if unsure, ask.
5. Rerun typecheck, lint and the scoped tests. Retake screenshots only if a fix touched UI.

Round two reviews the branch after round one's fixes.

## 8. Wrap up

- In `docs/PLAN.md`, tick the milestone's checklist and add **Notes for the next session** under it: decisions made, and anything deferred or to watch, carrying over whatever is still open from the previous notes. Leave these uncommitted for the user to review.
- Save new gotchas or decisions to project memory.
- Draft the PR description in the scratchpad with these sections: Summary, Decisions to review, Versions (table with reasons), Review (fixed / left as is), Test plan. End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. No "milestone" in the title or body.
- Report to the user: the check output, the screenshot and comparison paths, the PR description path, and what needs their decision. Then ask permission to push and open the PR (`gh.exe pr create`).
