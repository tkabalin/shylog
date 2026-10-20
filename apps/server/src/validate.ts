import { validator } from "hono/validator"
import type { z } from "zod"

import { Rejected } from "./apply/rejected.ts"

// Checks a value with one of core's schemas, the same ones the client builds
// requests with, and refuses it with the first problem and where it is.
export function parse<S extends z.ZodType>(
  schema: S,
  value: unknown
): z.output<S> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    const [issue] = parsed.error.issues
    throw new Rejected(issue.message, 400, issue.path)
  }
  return parsed.data
}

export const json = <S extends z.ZodType>(schema: S) =>
  validator("json", (value) => parse(schema, value))
