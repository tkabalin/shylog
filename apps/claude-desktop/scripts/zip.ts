import { crc32, deflateRawSync } from "node:zlib"

// A .mcpb is a zip with the manifest at its root. Written here with zlib
// rather than Anthropic's mcpb CLI, whose dependencies fail the workspace's
// trust policy. Deflated entries, UTF-8 names, and a fixed 1980 date so the
// same build packs the same bytes.
export function zip(files: [string, Buffer][]) {
  const parts: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const [name, data] of files) {
    const path = Buffer.from(name)
    const body = deflateRawSync(data)
    const fields = (header: Buffer, at: number) => {
      header.writeUInt16LE(20, at) // version needed: 2.0
      header.writeUInt16LE(0x0800, at + 2) // UTF-8 name
      header.writeUInt16LE(8, at + 4) // deflate
      header.writeUInt16LE(0, at + 6) // time
      header.writeUInt16LE(0x21, at + 8) // date: 1980-01-01
      header.writeUInt32LE(crc32(data), at + 10)
      header.writeUInt32LE(body.length, at + 14)
      header.writeUInt32LE(data.length, at + 18)
      header.writeUInt16LE(path.length, at + 22)
    }
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    fields(local, 4)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4) // made by
    fields(entry, 6)
    entry.writeUInt32LE(offset, 42)
    parts.push(local, path, body)
    directory.push(entry, path)
    offset += local.length + path.length + body.length
  }
  const size = directory.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(size, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...directory, end])
}
