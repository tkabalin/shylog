import { describe, expect, it } from "vitest"

import { cardCrop, cardFieldsSchema, cardHash, sniffImage } from "./cards.ts"

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

describe("cardFieldsSchema's thumb", () => {
  const parse = (thumb: unknown) =>
    cardFieldsSchema.safeParse({ name: "PADI Open Water", thumb }).success
  const crop = { x: 0.5, y: 0.5, scale: 2, aspect: 0.46 }

  it("is a centre inside the image, a zoom of 1 to 8 and the page's shape", () => {
    expect(parse({ x: 0, y: 1, scale: 1, aspect: 1.586 })).toBe(true)
    expect(parse({ x: 0.31, y: 0.62, scale: 8, aspect: 1080 / 120000 })).toBe(
      true
    )
  })

  it("is left out to keep the stored crop, or null to clear it", () => {
    expect(parse(undefined)).toBe(true)
    expect(parse(null)).toBe(true)
  })

  it("refuses a centre off the image, a zoom or shape out of range, or more fields", () => {
    expect(parse({ ...crop, x: -0.1 })).toBe(false)
    expect(parse({ ...crop, y: 1.1 })).toBe(false)
    expect(parse({ ...crop, scale: 0.9 })).toBe(false)
    expect(parse({ ...crop, scale: 8.1 })).toBe(false)
    expect(parse({ ...crop, scale: Infinity })).toBe(false)
    expect(parse({ ...crop, aspect: 0 })).toBe(false)
    expect(parse({ ...crop, aspect: 10001 })).toBe(false)
    expect(parse({ x: 0.5, y: 0.5, scale: 2 })).toBe(false)
    expect(parse({ ...crop, hash: "0123456789abcdef" })).toBe(false)
  })
})

describe("cardCrop", () => {
  const thumb = {
    hash: "aaaaaaaaaaaaaaaa",
    x: 0.4,
    y: 0.3,
    scale: 2,
    aspect: 0.46,
  }

  it("is the crop while the page it was made on is first", () => {
    expect(cardCrop({ images: [thumb.hash, "b"], thumb })).toEqual({
      x: 0.4,
      y: 0.3,
      scale: 2,
      aspect: 0.46,
    })
  })

  it("is ignored once another page is first, or with none", () => {
    expect(cardCrop({ images: ["b", thumb.hash], thumb })).toBeNull()
    expect(cardCrop({ images: ["b"], thumb })).toBeNull()
    expect(cardCrop({ images: [thumb.hash], thumb: null })).toBeNull()
  })
})
