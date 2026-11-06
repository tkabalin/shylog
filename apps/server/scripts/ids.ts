import { createHash } from "node:crypto"

import { idPrefixes, normaliseName, type IdKind } from "@shylog/core"

// An id from what names the entity rather than when it first appears, so a
// rerun on an export with dives added or people left out never moves an id
// the server already holds onto someone else.
export const keyedId = (source: string, kind: IdKind, key: string) =>
  `${idPrefixes[kind]}-${source}-${createHash("sha256").update(normaliseName(key)).digest("hex").slice(0, 12)}`
