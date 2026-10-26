// RFC 4180 as pandas writes it: quoted fields may hold commas, newlines and
// doubled quotes. Returns one record per row, keyed by the header.
export function readCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char !== '"') field += char
      else if (text[i + 1] === '"') field += text[++i]
      else quoted = false
    } else if (char === '"') quoted = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += char
  }
  if (field || row.length) rows.push([...row, field])
  const [header, ...records] = rows
  if (!header) return []
  return records.map((values) =>
    Object.fromEntries(header.map((name, i) => [name, values[i] ?? ""]))
  )
}
