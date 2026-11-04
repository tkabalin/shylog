---
paths:
  - "apps/server/src/db/migrations/**"
---

# Migrations

- `docs/SCHEMA.md` holds Mermaid ER diagrams of the schema these migrations build. A migration that adds, drops or renames a table or column, or changes a key or foreign key, updates the diagrams in the same commit.
- Keep the diagrams' conventions: units or the main constraint as the column comment, logbook tables in the first diagram and tables with no foreign keys in the second.
- A migration that only rewrites data, such as 004 and 005, leaves the file alone.
