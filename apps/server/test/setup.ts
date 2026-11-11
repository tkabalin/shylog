import { logTo } from "../src/log.ts"

// Every request logs a line, which would bury the test output. Errors
// still show, so an unexpected 500 comes with its stack; tests that cause
// errors on purpose read them with captureLog(), which takes their place.
logTo((line) => {
  if (/"level":"(error|fatal)"/.test(line)) process.stderr.write(line)
})
