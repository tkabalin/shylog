import { z } from "zod"

// Ids are generated on the client and written to the UDDF export as they
// are, so they must be XML ids, which cannot start with a digit; the kind
// prefix guarantees that and catches an id passed for the wrong kind.
export const idPrefixes = {
  dive: "dive",
  site: "site",
  region: "region",
  person: "person",
  diveCentre: "centre",
  trip: "trip",
  card: "card",
  op: "op",
  device: "device",
} as const
export type IdKind = keyof typeof idPrefixes
export type Id<K extends IdKind> = `${(typeof idPrefixes)[K]}-${string}`
export type DiveId = Id<"dive">

// Browsers and Node 24 both provide Web Crypto, but core's lib settings have
// neither DOM nor Node types. randomUUID is avoided, as browsers withhold it
// from plain-HTTP pages such as a dev server opened by LAN address.
declare const crypto: { getRandomValues(array: Uint8Array): Uint8Array }

// A version 4 UUID (RFC 9562): random apart from the version and variant.
function uuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function newId<K extends IdKind>(kind: K): Id<K> {
  return `${idPrefixes[kind]}-${uuid()}`
}

export function idSchema<K extends IdKind>(kind: K) {
  const pattern = new RegExp(`^${idPrefixes[kind]}-[A-Za-z0-9._-]{1,64}$`)
  return z.custom<Id<K>>(
    (value) => typeof value === "string" && pattern.test(value),
    `Expected a ${kind} id`
  )
}
