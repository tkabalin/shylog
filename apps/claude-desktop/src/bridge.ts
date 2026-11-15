import {
  SdkHttpError,
  StreamableHTTPClientTransport,
  type JSONRPCMessage,
} from "@modelcontextprotocol/client"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import type { Readable, Writable } from "node:stream"

// Claude Desktop's own connectors reach a server from Anthropic's cloud,
// which can't see the tailnet. Desktop starts this as a local server over
// stdio instead, and it passes every message to the instance's /mcp from
// the laptop, where Tailscale vouches for the diver as it does for the app.
export async function bridge(
  url: URL,
  options: { timeoutMs?: number; stdin?: Readable; stdout?: Writable } = {}
) {
  // Under Desktop's own 60 s, so its error says why.
  const timeoutMs = options.timeoutMs ?? 30_000
  const local = new StdioServerTransport(options.stdin, options.stdout)
  const remote = new StreamableHTTPClientTransport(url, {
    fetch: (input, init) => {
      const timeout = AbortSignal.timeout(timeoutMs)
      return fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, timeout])
          : timeout,
      })
    },
  })

  // Requests still owed an answer, each on a clock of its own: the fetch's
  // timeout only fails a send whose reply never starts, and one that stalls
  // after its headers would otherwise leave Desktop waiting unanswered.
  const pending = new Map<string | number, NodeJS.Timeout>()
  const settle = (id: string | number) => {
    const timer = pending.get(id)
    clearTimeout(timer)
    return pending.delete(id)
  }
  const fail = (id: string | number, message: string) => {
    // Once only, as the fetch and the clock can both time out.
    if (!settle(id)) return
    void local.send({ jsonrpc: "2.0", id, error: { code: -32603, message } })
  }

  local.onmessage = (message: JSONRPCMessage) => {
    // Cancelling means nothing to a server that answers each request whole.
    if ("method" in message && message.method === "notifications/cancelled") {
      return
    }
    // Only a request has an id to answer; a lost notification goes.
    const id = "method" in message && "id" in message ? message.id : undefined
    if (id !== undefined) {
      pending.set(
        id,
        setTimeout(() => fail(id, silent(url, timeoutMs)), timeoutMs)
      )
    }
    remote.send(message).catch((error: unknown) => {
      if (id !== undefined) fail(id, failure(url, error, timeoutMs))
      else console.error(failure(url, error, timeoutMs))
    })
  }
  remote.onmessage = (message: JSONRPCMessage) => {
    // An answer that comes after its request was failed is dropped, as
    // Desktop has had its one reply.
    if (
      !("method" in message) &&
      message.id !== undefined &&
      !settle(message.id)
    ) {
      return
    }
    // The 2025 protocol names its version on every request after the
    // handshake; the 2026 one carries it in each message.
    const result = "result" in message ? message.result : undefined
    if (typeof result?.protocolVersion === "string") {
      remote.setProtocolVersion(result.protocolVersion)
    }
    void local.send(message)
  }
  // stdout carries only messages, so anything else goes to stderr, which
  // Desktop keeps in the server's log.
  local.onerror = remote.onerror = (error) => console.error(error)

  await remote.start()
  await local.start()
  return {
    async close() {
      for (const id of [...pending.keys()]) settle(id)
      await remote.close()
      await local.close()
    },
  }
}

const silent = (url: URL, timeoutMs: number) =>
  `Shylog at ${url.host} didn't answer within ${timeoutMs / 1000} s; check that Tailscale is connected`

// What Claude is told when the instance doesn't answer.
function failure(url: URL, error: unknown, timeoutMs: number) {
  if (error instanceof SdkHttpError) {
    if (error.status === 403) {
      return `Shylog at ${url.host} refused this device's Tailscale login`
    }
    // Something answered, so Tailscale is up and the instance is failing.
    return `Shylog at ${url.host} answered with an error (${error.message})`
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return silent(url, timeoutMs)
  }
  const reason = error instanceof Error ? error.message : String(error)
  return `Can't reach Shylog at ${url.host}; check that Tailscale is connected (${reason})`
}
