---
paths:
  - "apps/web/src/routes/**"
  - "apps/web/src/components/**"
---

# History

- Every `<Link>`, `navigate` call, and `router.history` call follows the spec's "Navigation history" rule (under Mobile rules): push only to go one level deeper, replace for sideways moves and finished steps, go back to close a screen whose parent is behind it, and no entry for sheets and dialogs.
- Decide push, replace, or back for each new link as you write it. TanStack's default is push, which is wrong for tabs, filters, and saved forms.
- Give each new flow an e2e check that `page.goBack()` lands where the rule says.
