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
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const serverBuilt = existsSync(path.resolve(ROOT, "dist/server.cjs"));

let proc: ChildProcess | undefined;

async function waitForHealth(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
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

describe.skipIf(!serverBuilt)("server E2E (built production server)", () => {
  beforeAll(async () => {
    proc = spawn("node", ["dist/server.cjs"], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
      stdio: "ignore",
    });
    await waitForHealth();
  });

  afterAll(() => {
    proc?.kill("SIGKILL");
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
});
