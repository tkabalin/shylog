---
paths:
  - "apps/web/**"
---

# shadcn

- Use the shadcn skill when adding, changing or styling UI components.
- Before writing any new component, check whether shadcn already has one that does the job. Look in `apps/web/src/components/ui/` first, then search the registry: `pnpm dlx shadcn@latest search @shadcn -q <term> -c apps/web`. Try a few terms, because shadcn's names don't always match the job (a bottom sheet is `drawer`, a segmented control is `toggle-group`). If one fits, add it and adapt it. If none fits, build the new component from shadcn primitives, and say which ones you checked.
- Never re-add a shadcn component that is already in `apps/web/src/components/ui/`. Those files are edited once they're in the repo, and re-adding one overwrites the edits. Change it in place instead, never pass `--overwrite` to `shadcn add`, and decline the overwrite prompt when a new component depends on one that's already there.
- The repo root is a monorepo root, so the shadcn CLI refuses to run there. Point it at the web app: `pnpm dlx shadcn@latest <command> -c apps/web`. This includes `info --json`, which the skill runs on load and gets an error from at the root.
