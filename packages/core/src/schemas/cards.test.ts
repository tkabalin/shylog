import { describe, expect, it } from "vitest"

import { cardHash, sniffImage } from "./cards.ts"

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part
    )
  )

describe("sniffImage", () => {
  it("knows the stored types and HEIC or HEIF by their first bytes", () => {
    expect(sniffImage(bytes("\x89PNG\r\n\x1a\n"))).toBe("image/png")
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
    expect(sniffImage(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("image/webp")
    for (const brand of ["heic", "heix", "hevc", "mif1", "msf1"]) {
      expect(sniffImage(bytes([0, 0, 0, 24], "ftyp", brand))).toBe("heif")
    }
  })

  it("knows nothing else, an AVIF, an MP4 or an SVG included", () => {
    expect(sniffImage(bytes([0, 0, 0, 24], "ftyp", "avif"))).toBeNull()
    expect(sniffImage(bytes([0, 0, 0, 24], "ftyp", "isom"))).toBeNull()
    expect(sniffImage(bytes("<svg></svg>"))).toBeNull()
    expect(sniffImage(bytes([0xff, 0xd8]))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})

describe("cardHash", () => {
  it("is the first 16 hex digits of the SHA-256", () => {
    // The SHA-256 of nothing.
    const hex =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    const sha = new Uint8Array(
      hex.match(/../g)!.map((pair) => parseInt(pair, 16))
    )
    expect(cardHash(sha)).toBe("e3b0c44298fc1c14")
  })
})
