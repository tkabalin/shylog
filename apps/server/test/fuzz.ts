// fast-check options for the property tests. The seed is fixed, so CI tries
// the same cases every time and a red build is always the change's;
// SHYLOG_FUZZ_SEED=random explores, or replays a printed seed, and
// SHYLOG_FUZZ_RUNS raises the run count for a long local soak.
export function fuzzOptions(defaultSeed: number, defaultRuns = 60) {
  const seed = process.env.SHYLOG_FUZZ_SEED
  return {
    numRuns: Number(process.env.SHYLOG_FUZZ_RUNS) || defaultRuns,
    ...(seed === "random" ? {} : { seed: Number(seed) || defaultSeed }),
  }
}
