import { validator } from "hono/validator"
import type { z } from "zod"

// Checks a JSON body with one of core's schemas, the same ones the client
// builds requests with, and replies with the first problem and where it is.
export const json = <S extends z.ZodType>(schema: S) =>
  validator("json", (value, c) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      const [issue] = parsed.error.issues
      return c.json({ error: issue.message, path: issue.path }, 400)
    }
    return parsed.data as z.output<S>
  })
