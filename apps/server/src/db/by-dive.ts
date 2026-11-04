// Rows grouped into a list per dive, in the order the query gave them.
export function byDive<R extends { diveId: string }, V>(
  rows: readonly R[],
  value: (row: R) => V
) {
  const lists = new Map<string, V[]>()
  for (const row of rows) {
    const list = lists.get(row.diveId)
    if (list) list.push(value(row))
    else lists.set(row.diveId, [value(row)])
  }
  return lists
}
