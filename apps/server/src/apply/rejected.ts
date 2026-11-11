import type { ContentfulStatusCode } from "hono/utils/http-status"

// A request the log's rules refuse. Thrown inside a write, so the whole
// request rolls back, and returned to the draft's card or the form.
export class Rejected extends Error {
  readonly status: ContentfulStatusCode
  readonly path?: PropertyKey[]
  // More for the form, such as the entity a rename collides with.
  readonly details?: Record<string, unknown>
  // The reason as the server's log has it, without the names a message
  // like "There is already a site called …" carries.
  readonly logged: string

  constructor(
    message: string,
    status: ContentfulStatusCode = 422,
    path?: PropertyKey[],
    details?: Record<string, unknown>,
    logged = message
  ) {
    super(message)
    this.status = status
    this.path = path
    this.details = details
    this.logged = logged
  }
}
