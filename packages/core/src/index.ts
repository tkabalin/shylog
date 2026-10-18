// Ids are generated on the client and must be valid UDDF ids, which cannot
// start with a digit, hence the kind prefix.
export type DiveId = `dive-${string}`
