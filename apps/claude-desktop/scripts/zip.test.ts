import { crc32, inflateRawSync } from "node:zlib"

import { expect, it } from "vitest"

import { zip } from "./zip.ts"

// Reads an archive back as an unzip tool does: from the end record to the
// central directory, then each entry's local header and data.
function unzip(archive: Buffer) {
  const end = archive.length - 22
  expect(archive.readUInt32LE(end)).toBe(0x06054b50)
  const count = archive.readUInt16LE(end + 10)
  let at = archive.readUInt32LE(end + 16)
  const files: Record<string, Buffer> = {}
  for (let i = 0; i < count; i++) {
    expect(archive.readUInt32LE(at)).toBe(0x02014b50)
    const crc = archive.readUInt32LE(at + 16)
    const size = archive.readUInt32LE(at + 20)
    const nameLength = archive.readUInt16LE(at + 28)
    const local = archive.readUInt32LE(at + 42)
    const name = archive.toString("utf8", at + 46, at + 46 + nameLength)
    expect(archive.readUInt32LE(local)).toBe(0x04034b50)
    const start = local + 30 + archive.readUInt16LE(local + 26)
    const data = inflateRawSync(archive.subarray(start, start + size))
    expect(crc32(data)).toBe(crc)
    files[name] = data
    at += 46 + nameLength
  }
  return files
}

it("writes a zip whose entries read back whole", () => {
  const manifest = Buffer.from('{"name":"shylog-dive"}\n')
  const bundle = Buffer.from("console.log('é')\n".repeat(500))
  expect(
    unzip(
      zip([
        ["manifest.json", manifest],
        ["server/index.mjs", bundle],
      ])
    )
  ).toEqual({ "manifest.json": manifest, "server/index.mjs": bundle })
})

it("packs the same files to the same bytes", () => {
  const files: [string, Buffer][] = [["manifest.json", Buffer.from("{}")]]
  expect(zip(files).equals(zip(files))).toBe(true)
})
