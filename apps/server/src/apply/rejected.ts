import type { ContentfulStatusCode } from "hono/utils/http-status"

// A request the log's rules refuse. Thrown inside a write, so the whole
// request rolls back, and returned to the draft's card or the form.
export class Rejected extends Error {
  readonly status: ContentfulStatusCode
  readonly path?: PropertyKey[]

  constructor(
    message: string,
    status: ContentfulStatusCode = 422,
    path?: PropertyKey[]
  ) {
    super(message)
    this.status = status
    this.path = path
  }
}
