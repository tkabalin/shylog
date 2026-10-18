---
paths:
  - "apps/web/**"
---

# shadcn

- Use the shadcn skill when adding, changing or styling UI components.
- The repo root is a monorepo root, so the shadcn CLI refuses to run there. Point it at the web app: `pnpm dlx shadcn@latest <command> -c apps/web`. This includes `info --json`, which the skill runs on load and gets an error from at the root.
