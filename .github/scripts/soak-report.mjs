// Turns a failed nightly soak's Playwright JSON reports into issues: one
// per failing test, so each flake is fixed and closed on its own, or one
// for the night when the run itself broke.
// Usage: node soak-report.mjs <run url> <report.json>...
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const [run, ...files] = process.argv.slice(2)
const repo = process.env.REPO

// More failing tests than this in one night is a server that didn't start
// or a stalled mirror, not that many flakes.
const most = 5

const gh = (...args) =>
  execFileSync("gh", [...args, "-R", repo], { encoding: "utf8" })

// Each test's title, with its runs, failures and retried passes per browser.
const tests = new Map()
// Whatever stopped a shard short: a server that didn't start or a crashed
// worker, which the report lists apart from the tests, or a job timeout.
const stopped = []
let shards = 0
const walk = (suite, path) => {
  for (const spec of suite.specs ?? []) {
    // Without tags: a title with "@writes" in it would mention a user.
    const title = [...path, spec.title].join(" › ").replace(/\s+@\w+/g, "")
    for (const test of spec.tests) {
      const counts = tests.get(title) ?? new Map()
      const browser = counts.get(test.projectName) ?? {
        runs: 0,
        failed: 0,
        flaky: 0,
      }
      browser.runs++
      if (test.status === "unexpected") browser.failed++
      if (test.status === "flaky") browser.flaky++
      if (test.results.some((result) => result.status === "interrupted"))
        stopped.push(`${title} was cut short`)
      counts.set(test.projectName, browser)
      tests.set(title, counts)
    }
  }
  for (const child of suite.suites ?? []) walk(child, [...path, child.title])
}
for (const file of files) {
  const report = JSON.parse(readFileSync(file, "utf8"))
  shards = report.config.shard?.total ?? 1
  for (const error of report.errors)
    stopped.push(error.message.split("\n")[0].replace(/\.$/, ""))
  for (const suite of report.suites) walk(suite, [suite.title])
}
const failing = [...tests].filter(([, counts]) =>
  [...counts.values()].some((browser) => browser.failed + browser.flaky)
)

const line = (counts) =>
  [...counts]
    .filter(([, browser]) => browser.failed + browser.flaky)
    .map(([name, { runs, failed, flaky }]) =>
      [
        failed && `${name} failed ${failed} of ${runs} runs`,
        flaky && `${name} passed only on a retry in ${flaky} of ${runs} runs`,
      ]
        .filter(Boolean)
        .join(", ")
    )
    .join("; ")

// A shard that timed out or never started leaves no report at all.
const broke =
  files.length === 0
    ? "no shard left a report, so the run stopped before its tests"
    : files.length < shards
      ? `only ${files.length} of ${shards} shards left a report, so one timed out or never started`
      : stopped.length
        ? `a shard stopped short: ${stopped.slice(0, 3).join("; ")}`
        : failing.length === 0
          ? "no test failed, so something else in the run did"
          : failing.length > most &&
            `${failing.length} tests failed, too many to be flakes, so look at the run itself first`
const listed = failing.map(([title]) => `\n- ${title}`).join("")
const issues = broke
  ? [
      {
        title: "Nightly soak broke",
        body: `${run}: ${broke}.${listed && `\n\nFailing tests:${listed}`}`,
      },
    ]
  : failing.map(([title, counts]) => ({
      // GitHub's limit, cut the same way each night so it matches again.
      title: `Flaky: ${title}`.slice(0, 256),
      body: `${run}: ${line(counts)}. The run's reports hold the traces.`,
    }))

const open = JSON.parse(
  gh(
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "500",
    "--json",
    "number,title"
  )
)
// One that can't be filed doesn't stop the rest; the job still fails.
for (const { title, body } of issues)
  try {
    const known = open.find((issue) => issue.title === title)
    if (known) gh("issue", "comment", String(known.number), "--body", body)
    else
      gh("issue", "create", "--title", title, "--body", body, "--label", "bug")
  } catch (error) {
    console.error(`Couldn't file "${title}": ${error.message}`)
    process.exitCode = 1
  }
