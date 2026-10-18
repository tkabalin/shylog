import { z } from "zod"

const logins = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((login) => login.trim())
      .filter(Boolean)
  )
  .pipe(z.array(z.string()).min(1))

const schema = z
  .object({
    // Unset means production, so forgetting NODE_ENV in a deployment can
    // never turn the dev login on.
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("production"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TS_HOSTNAME: z.string().min(1).default("shylog"),
    SHYLOG_APP_NAME: z.string().min(1).default("Shylog"),
    // Compared with the browser's Origin header, which never has a path or
    // trailing slash.
    SHYLOG_ORIGIN: z
      .url({ protocol: /^https?$/ })
      .transform((url) => new URL(url).origin),
    SHYLOG_DATA_DIR: z.string().min(1),
    SHYLOG_ALLOWED_LOGINS: logins,
    SHYLOG_DEV_LOGIN: z.string().min(1).optional(),
  })
  // The dev login bypasses the Tailscale identity check, so a production
  // server must never start with it set.
  .refine((env) => !(env.NODE_ENV === "production" && env.SHYLOG_DEV_LOGIN), {
    message: "SHYLOG_DEV_LOGIN must not be set in production",
    path: ["SHYLOG_DEV_LOGIN"],
  })

export type Env = z.infer<typeof schema>

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  // Compose passes `VAR=` for an unset `${VAR:-}`; treat empty as unset so
  // defaults apply and optional values stay off.
  const set = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== "")
  )
  const result = schema.safeParse(set)
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
