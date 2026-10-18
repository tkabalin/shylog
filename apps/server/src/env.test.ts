import { describe, expect, it } from "vitest"

import { parseEnv } from "./env.ts"

const base = {
  SHYLOG_ORIGIN: "https://shylog.example.ts.net",
  SHYLOG_DATA_DIR: "/srv/shylog/test",
  SHYLOG_ALLOWED_LOGINS: "diver@example.com, support@example.com",
}

describe("parseEnv", () => {
  it("applies defaults and splits the allowed logins", () => {
    const env = parseEnv(base)
    expect(env.PORT).toBe(3000)
    expect(env.TS_HOSTNAME).toBe("shylog")
    expect(env.SHYLOG_APP_NAME).toBe("Shylog")
    expect(env.SHYLOG_ALLOWED_LOGINS).toEqual([
      "diver@example.com",
      "support@example.com",
    ])
  })

  it("requires the data directory, origin and at least one login", () => {
    expect(() => parseEnv({})).toThrow(/SHYLOG_DATA_DIR/)
    expect(() => parseEnv({ ...base, SHYLOG_ORIGIN: "shylog" })).toThrow(
      /SHYLOG_ORIGIN/
    )
    expect(() => parseEnv({ ...base, SHYLOG_ALLOWED_LOGINS: " , " })).toThrow(
      /SHYLOG_ALLOWED_LOGINS/
    )
  })

  it("reduces the origin to scheme and host", () => {
    const env = parseEnv({ ...base, SHYLOG_ORIGIN: "https://shylog.ts.net/" })
    expect(env.SHYLOG_ORIGIN).toBe("https://shylog.ts.net")
    expect(() => parseEnv({ ...base, SHYLOG_ORIGIN: "ftp://shylog" })).toThrow(
      /SHYLOG_ORIGIN/
    )
  })

  it("allows the dev login outside production", () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: "development",
      SHYLOG_DEV_LOGIN: "diver@example.com",
    })
    expect(env.SHYLOG_DEV_LOGIN).toBe("diver@example.com")
  })

  it("treats empty values as unset", () => {
    const env = parseEnv({
      ...base,
      PORT: "",
      SHYLOG_APP_NAME: "",
      SHYLOG_DEV_LOGIN: "",
    })
    expect(env.PORT).toBe(3000)
    expect(env.SHYLOG_APP_NAME).toBe("Shylog")
    expect(env.SHYLOG_DEV_LOGIN).toBeUndefined()
    expect(() => parseEnv({ ...base, SHYLOG_DATA_DIR: "" })).toThrow(
      /SHYLOG_DATA_DIR/
    )
  })

  it("treats an unset NODE_ENV as production", () => {
    expect(() =>
      parseEnv({ ...base, SHYLOG_DEV_LOGIN: "diver@example.com" })
    ).toThrow(/SHYLOG_DEV_LOGIN must not be set in production/)
  })

  it("refuses the dev login in production", () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: "production",
        SHYLOG_DEV_LOGIN: "diver@example.com",
      })
    ).toThrow(/SHYLOG_DEV_LOGIN must not be set in production/)
  })
})
