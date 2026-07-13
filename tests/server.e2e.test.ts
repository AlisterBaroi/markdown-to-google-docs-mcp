/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * End-to-end test against the real built production server (dist/server.cjs).
 * Exercises the code paths that don't require Google credentials: the mermaid image
 * hosting lifecycle, the MCP bridge script, the SSE auth gate, and health.
 * Run `npm run build` first; the suite skips itself if the build is missing.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { version as pkgVersion } from "../package.json";

const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const DIST_SERVER = path.resolve(ROOT, "dist/server.cjs");
const serverBuilt = existsSync(DIST_SERVER);
// The package.json version is baked into dist/server.cjs at build time, so
// version-sensitive assertions are only meaningful against a build at least as new
// as package.json; otherwise they'd fail spuriously on correct source.
const distFresh =
  serverBuilt && statSync(DIST_SERVER).mtimeMs >= statSync(path.resolve(ROOT, "package.json")).mtimeMs;
// Isolated session store: the default SESSIONS_FILE in os.tmpdir() is shared with real
// dev-server runs, and the MCP tests below register fake sessions we must not leak there.
// Fixed name on purpose (concurrent suite runs already collide on the fixed PORT): the
// next run's afterAll cleans up an orphan left behind by a crashed run.
const SESSIONS_FILE = path.join(os.tmpdir(), "md-to-gdocs-e2e-sessions.json");

let proc: ChildProcess | undefined;
let procExited = false;

async function waitForHealth(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (procExited) {
      throw new Error(`Server process exited before becoming healthy (is port ${PORT} already in use?)`);
    }
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* server not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server did not become healthy in time");
}

// Yields parsed SSE events (heartbeat comment frames carry no data and are skipped).
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        let event = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice("event: ".length).trim();
          else if (line.startsWith("data: ")) data += line.slice("data: ".length);
        }
        if (data) yield { event, data };
      }
    }
  } finally {
    // Also runs when a consumer exits early (for-await break / .return()): cancel()
    // closes the SSE connection and releases the body lock — releaseLock() alone
    // would release the lock but leave the socket open.
    await reader.cancel().catch(() => {});
  }
}

describe.skipIf(!serverBuilt)("server E2E (built production server)", () => {
  beforeAll(async () => {
    // Self-heal an orphan store from a crashed previous run before the server loads it.
    rmSync(SESSIONS_FILE, { force: true });
    proc = spawn("node", ["dist/server.cjs"], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), SESSIONS_FILE },
      stdio: "ignore",
    });
    // Fail fast (with a useful message) if the server dies at startup — e.g. EADDRINUSE
    // from a leaked prior run — instead of polling for the full 30s.
    proc.once("exit", () => {
      procExited = true;
    });
    await waitForHealth();
    // Identity check: a healthy response alone can't prove OUR spawn answered — our
    // process may die of EADDRINUSE after a stale squatter on the same port passed the
    // poll. Only our spawn was given this SESSIONS_FILE path, so a probe session that
    // shows up in that file proves the responder is the process we just started.
    const probeToken = `e2e-boot-probe-${process.pid}`;
    const probe = await fetch(`${BASE}/api/mcp/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mcpToken: probeToken, accessToken: "probe" }),
    });
    if (!probe.ok || !existsSync(SESSIONS_FILE) || !readFileSync(SESSIONS_FILE, "utf8").includes(probeToken)) {
      throw new Error(
        `A server responded on port ${PORT}, but it is not the one this suite spawned (stale process from a previous run?).`,
      );
    }
  });

  afterAll(() => {
    proc?.kill("SIGKILL");
    rmSync(SESSIONS_FILE, { force: true });
  });

  it("health endpoint responds ok", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  it("mermaid image lifecycle: upload -> fetch -> delete -> gone", async () => {
    // Minimal 1x1 PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    const up = await fetch(`${BASE}/api/mermaid`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
    });
    expect(up.status).toBe(200);
    const { url } = await up.json();
    expect(url).toContain("/api/mermaid/");

    const got = await fetch(url);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toContain("image/png");
    const gotBuf = Buffer.from(await got.arrayBuffer());
    expect(gotBuf.equals(png)).toBe(true);

    const del = await fetch(url, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await del.json()).deleted).toBe(true);

    // After explicit cleanup the image is gone (no longer served).
    const gone = await fetch(url);
    expect(gone.status).toBe(404);
  });

  it("rejects an empty mermaid upload", async () => {
    const res = await fetch(`${BASE}/api/mermaid`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: Buffer.alloc(0),
    });
    expect(res.status).toBe(400);
  });

  it("mcp-bridge.js requires a connection token", async () => {
    const noToken = await fetch(`${BASE}/mcp-bridge.js`);
    expect(noToken.status).toBe(400);

    const withToken = await fetch(`${BASE}/mcp-bridge.js?token=abc123`);
    expect(withToken.status).toBe(200);
    expect(withToken.headers.get("content-type")).toContain("javascript");
    expect(await withToken.text()).toContain("MCP Bridge");
  });

  it("SSE endpoint rejects a missing token", async () => {
    const res = await fetch(`${BASE}/api/mcp/sse`);
    expect(res.status).toBe(401);
  });

  it.skipIf(!distFresh)("MCP initialize reports the package.json version in serverInfo", async () => {
    // /api/mcp/sync stores credentials without validating them against Google
    // (that only happens when a tool runs), so a fake token passes the SSE auth gate.
    const sync = await fetch(`${BASE}/api/mcp/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mcpToken: "e2e-version-token",
        accessToken: "fake-access-token",
        email: "e2e@test.local",
        displayName: "E2E Test",
      }),
    });
    expect(sync.status).toBe(200);

    const ctrl = new AbortController();
    try {
      const sse = await fetch(`${BASE}/api/mcp/sse?token=e2e-version-token`, { signal: ctrl.signal });
      expect(sse.status).toBe(200);
      const events = sseEvents(sse.body!);

      // First frame is the "endpoint" event carrying the JSON-RPC message URL.
      const endpoint = await events.next();
      expect(endpoint.done).toBe(false);
      expect(endpoint.value.event).toBe("endpoint");
      const messageUrl = endpoint.value.data;

      const post = await fetch(messageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { clientInfo: { name: "e2e-test", version: "0.0.0" } },
        }),
      });
      expect(post.status).toBe(200);

      // The initialize result arrives on the SSE stream, not the POST response.
      const msg = await events.next();
      expect(msg.done).toBe(false);
      const payload = JSON.parse(msg.value.data);
      expect(payload.id).toBe(1);
      expect(payload.result.serverInfo.name).toBe("markdown-to-gdocs-mcp");
      expect(payload.result.serverInfo.version).toBe(pkgVersion);
    } finally {
      ctrl.abort();
    }
  });
});
