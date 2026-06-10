/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { parseMarkdown } from "./src/utils/markdownParser";
import { createBlankDoc, styleDocContent, moveFileToFolder } from "./src/utils/docsExporter";
import { ConversionSettings } from "./src/types";
import fs from "fs";
import os from "os";

// Stored OUTSIDE the project tree on purpose: it holds live OAuth access tokens
// (never commit it), and keeping it out of the Vite-watched root avoids a
// write -> page-reload -> re-sync -> write feedback loop in dev.
const SESSIONS_FILE = process.env.SESSIONS_FILE || path.join(os.tmpdir(), "md-to-gdocs-sessions.json");

// Setup storage maps for MCP sessions
// Key: mcpToken (generated on client, persistent) -> Value: user's session details
const sessions = new Map<string, {
  accessToken: string;
  email: string;
  displayName: string;
  settings?: ConversionSettings;
  updatedAt: number;
}>();

function loadPersistedSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const rawData = fs.readFileSync(SESSIONS_FILE, "utf8");
      const parsed = JSON.parse(rawData);
      console.log(`[MCP Server] Loading ${Object.keys(parsed).length} persisted sessions.`);
      for (const [key, value] of Object.entries(parsed)) {
        sessions.set(key, value as any);
      }
    }
  } catch (err) {
    console.error("[MCP Server] Failed to load persisted sessions:", err);
  }
}

function savePersistedSessions() {
  try {
    const dataObj: Record<string, any> = {};
    for (const [key, value] of sessions.entries()) {
      dataObj[key] = value;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(dataObj, null, 2), "utf8");
  } catch (err) {
    console.error("[MCP Server] Failed to save persisted sessions:", err);
  }
}

// Key: sessionId (generated during SSE handshake) -> Value: active client SSE connection
const activeMCPSessions = new Map<string, {
  res: express.Response;
  mcpToken: string;
  connectedAt: number;
  clientOs?: string;
  clientInfo?: { name?: string; version?: string; title?: string };
}>();

const DEFAULT_SETTINGS: ConversionSettings = {
  title: {
    fontFamily: "Arial",
    fontSize: 24,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 3,
    bold: true,
    color: { red: 0, green: 0, blue: 0 }
  },
  heading1: {
    fontFamily: "Arial",
    fontSize: 20,
    lineSpacing: 100,
    spaceAbove: 20,
    spaceBelow: 6,
    bold: true,
    color: { red: 0, green: 0, blue: 0 }
  },
  heading2: {
    fontFamily: "Arial",
    fontSize: 16,
    lineSpacing: 100,
    spaceAbove: 18,
    spaceBelow: 4,
    bold: true,
    color: { red: 0, green: 0, blue: 0 }
  },
  text: {
    fontFamily: "Arial",
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 8,
    bold: false,
    color: { red: 0, green: 0, blue: 0 }
  },
  textBold: {
    fontFamily: "Arial",
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 0,
    bold: true,
    color: { red: 0, green: 0, blue: 0 }
  },
  textItalic: {
    fontFamily: "Arial",
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 0,
    bold: false,
    color: { red: 0.4, green: 0.4, blue: 0.4 }
  },
  textUnderline: {
    fontFamily: "Arial",
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 0,
    bold: false,
    color: { red: 0, green: 0, blue: 0 }
  },
  list: {
    fontFamily: "Arial",
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 4,
    bold: false,
    color: { red: 0, green: 0, blue: 0 }
  },
  headingMapping: {
    title: "#",
    heading1: "##",
    heading2: "###"
  }
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Load persisted sessions on start
  loadPersistedSessions();

  // Use JSON parsing middleware for POST calls
  app.use(express.json());

  // API Health Indicator
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", activeSessions: sessions.size });
  });

  // Keep Google Workspace / OAuth session credentials in sync with backend
  app.post("/api/mcp/sync", (req, res) => {
    const { mcpToken, accessToken, email, displayName, settings } = req.body;
    if (!mcpToken || !accessToken) {
      return res.status(400).json({ error: "Missing required fields mcpToken or accessToken" });
    }

    sessions.set(mcpToken, {
      accessToken,
      email: email || "",
      displayName: displayName || "",
      settings,
      updatedAt: Date.now()
    });

    savePersistedSessions();

    console.log(`[MCP Server] Synced local session for user: ${email || "Unknown"}`);
    res.json({ success: true, message: "Credentials synced successfully to server background." });
  });

  // List agents currently connected via SSE for the caller's token (scoped by mcpToken)
  app.get("/api/mcp/agents", (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ error: "Missing required token query parameter" });
    }

    const agents = Array.from(activeMCPSessions.entries())
      .filter(([, s]) => s.mcpToken === token)
      .map(([sessionId, s]) => ({
        sessionId,
        name: s.clientInfo?.title || s.clientInfo?.name || "Unknown agent",
        version: s.clientInfo?.version || "",
        os: s.clientOs || "",
        connectedAt: s.connectedAt
      }))
      .sort((a, b) => a.connectedAt - b.connectedAt);

    res.json({ agents });
  });

  // Dynamic Javascript bridge script to expose Remote SSE MCP to Stdio Clients
  app.get("/mcp-bridge.js", (req, res) => {
    const token = req.query.token as string;
    console.log(`[MCP Server] Request served for /mcp-bridge.js with query token: ${token || "none"}`);
    if (!token) {
      console.warn("[MCP Server] Warning: Request to /mcp-bridge.js did not supply a connection token");
      return res.status(400).send("// Error: Missing required connection token query parameter");
    }

    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
    const sseUrl = `${protocol}://${host}/api/mcp/sse?token=${token}`;

    console.log(`[MCP Server] Generating client bridge script pointing to SSE endpoint: ${sseUrl}`);

    const script = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

(async function boot() {
  const http = await import("http");
  const https = await import("https");
  const readline = await import("readline");

  const sseUrl = ${JSON.stringify(sseUrl)};
  console.error("[MCP Bridge] Booting Google Docs MCP client bridge adapter...");
  console.error("[MCP Bridge] Host/Protocol resolved: ${protocol} over ${host}");
  console.error("[MCP Bridge] Stream Transport Target (SSE):", sseUrl);

  function request(url, options = {}, redirectCount = 0) {
    if (redirectCount > 5) {
      return Promise.reject(new Error("Too many redirects"));
    }
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === "https:" ? https : http;
      const headers = options.headers || {};
      if (options.body) {
        headers["Content-Length"] = Buffer.byteLength(options.body);
      }
      console.error(\`[MCP Bridge] POST Request to Callback: \${options.method || "POST"} \${url}\`);
      if (options.body) {
        console.error(\`[MCP Bridge] POST Payload size: \${headers["Content-Length"]} bytes: \${options.body.substring(0, 150)}...\`);
      }

      const req = client.request(url, {
      method: options.method || "GET",
      headers
    }, (res) => {
      console.error(\`[MCP Bridge] Received callback response status: \${res.statusCode}\`);
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const dest = new URL(res.headers.location, url).toString();
        console.error(\`[MCP Bridge] Redirection detected [Status \${res.statusCode}] to: \${dest}\`);
        resolve(request(dest, options, redirectCount + 1));
      } else {
        resolve(res);
      }
    });

    req.on("error", (err) => {
      console.error("[MCP Bridge] HTTP client error inside callback transfer:", err);
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function run(url = sseUrl, redirectCount = 0) {
  if (redirectCount > 5) {
    console.error("[MCP Bridge] Too many redirects for SSE connection.");
    process.exit(1);
  }
  const parsedSSE = new URL(url);
  const client = parsedSSE.protocol === "https:" ? https : http;

  console.error(\`[MCP Bridge] Opening streaming HTTP connection to: \${url}\`);

  const req = client.request(url, {
    method: "GET",
    headers: {
      "Accept": "text/event-stream",
      "X-Client-Os": process.platform
    }
  }, (res) => {
    console.error(\`[MCP Bridge] Connection handshake completed! Status Code: \${res.statusCode}\`);
    console.error(\`[MCP Bridge] Response Headers: \${JSON.stringify(res.headers)}\`);

    if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
      const dest = new URL(res.headers.location, url).toString();
      console.error(\`[MCP Bridge] Redirection detected on SSE handshake -> \${dest}\`);
      run(dest, redirectCount + 1);
      return;
    }

    if (res.statusCode !== 200) {
      console.error("[MCP Bridge] Connect failed! HTTP status code:", res.statusCode);
      if (res.statusCode === 401) {
        console.error("[MCP Bridge] ERROR: Unauthorized. Check if your mcpToken matches the backend sync list.");
      }
      process.exit(1);
    }

    let buffer = "";
    res.on("data", (chunk) => {
      const chunkStr = chunk.toString();
      console.error(\`[MCP Bridge] <<< Received raw data chunk (\${chunk.length} bytes): \${chunkStr.trim().replace(/\\n/g, " | ")}\`);
      buffer += chunkStr;
      let lines = buffer.split("\\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (let line of lines) {
        line = line.replace(/\\r$/, "");
        if (line.startsWith("event:")) {
          currentEvent = line.substring(6).trim();
          console.error(\`[MCP Bridge] Parsed SSE Event: \${currentEvent}\`);
        } else if (line.startsWith("data:")) {
          const dataStr = line.substring(5).trim();
          console.error(\`[MCP Bridge] Parsed SSE Data: \${dataStr.substring(0, 100)}\`);
          handleSSEMessage(currentEvent, dataStr);
          currentEvent = "";
        } else if (line.trim() === "") {
          currentEvent = "";
        }
      }
    });

    res.on("end", () => {
      console.error("[MCP Bridge] SSE connection closed by remote server.");
      process.exit(0);
    });
  });

  req.on("error", (err) => {
    console.error("[MCP Bridge] SSE transport connection error:", err);
    process.exit(1);
  });
  req.end();
}

let messageUrl = "";
const messageQueue = [];

function handleSSEMessage(event, data) {
  if (event === "endpoint") {
    messageUrl = data;
    console.error("[MCP Bridge] SUCCESS: Registered SSE session successfully. messageUrl =", messageUrl);
    while (messageQueue.length > 0) {
      sendMessage(messageQueue.shift());
    }
  } else if (event === "message") {
    console.error("[MCP Bridge] JSON-RPC response from server forwarded to stdout:", data);
    console.log(data);
  }
}

let stdinStarted = false;
function startStdinListener() {
  if (stdinStarted) return;
  stdinStarted = true;
  console.error("[MCP Bridge] Standard input (stdin) command reader is active. Awaiting JSON-RPC requests...");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on("line", (line) => {
    if (!line.trim()) return;
    console.error(\`[MCP Bridge] >>> Read local line from Claude Code: \${line.substring(0, 150)}\`);
    if (!messageUrl) {
      console.error("[MCP Bridge] Queuing message because endpoint is not yet received.");
      messageQueue.push(line);
    } else {
      sendMessage(line);
    }
  });

  rl.on("close", () => {
    console.error("[MCP Bridge] Standard input (stdin) stream closed. Shutting down.");
    process.exit(0);
  });
}

async function sendMessage(line) {
  try {
    const res = await request(messageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: line
    });

    let resBody = "";
    res.on("data", (chunk) => {
      resBody += chunk.toString();
    });
    res.on("end", () => {
      if (res.statusCode !== 200 && res.statusCode !== 202) {
        console.error(\`[MCP Bridge] ERROR: Callback transmission failed with status \${res.statusCode}. Body: \${resBody.trim()}\`);
      } else {
        console.error(\`[MCP Bridge] Success forwarding line (StatusCode: \${res.statusCode})\`);
      }
    });
  } catch (err) {
    console.error("[MCP Bridge] Failed to forward stdin request:", err);
  }
}

  startStdinListener();
  run();
})().catch(err => {
  console.error("[MCP Bridge] Boot crash:", err);
  process.exit(1);
});
`;

    res.setHeader("Content-Type", "application/javascript");
    res.send(script);
  });

  // SSE Transport connection endpoint
  app.get("/api/mcp/sse", (req, res) => {
    const token = req.query.token as string;
    console.log(`[MCP Server] GET /api/mcp/sse received. Token: ${token || "none"}`);
    console.log("[MCP Server] Incoming request headers: " + JSON.stringify(req.headers));

    if (!token) {
      console.warn("[MCP Server] SSE handshake failed: No token provided.");
      return res.status(401).send("Unauthorized: Missing token in query params.");
    }

    if (!sessions.has(token)) {
      console.warn(`[MCP Server] SSE handshake unauthorized: Token "${token}" is not active or has been invalidated.`);
      console.log("[MCP Server] Known registered tokens: " + JSON.stringify(Array.from(sessions.keys())));
      return res.status(401).send("Unauthorized: Invalid or non-existent MCP Connection Token. Access the /MCP setup page on the Web UI.");
    }

    const sessionData = sessions.get(token);
    console.log(`[MCP Server] SSE authorized for user ${sessionData?.email || "Unknown"}`);

    // Set standard Headers for Keep-Alive Server-Sent Events stream
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none"
    });

    const sessionId = Math.random().toString(36).substring(2, 11);
    const clientOs = (req.headers["x-client-os"] as string) || "";
    activeMCPSessions.set(sessionId, { res, mcpToken: token, connectedAt: Date.now(), clientOs });

    // Derive absolute entry points for JSON-RPC POST communication payloads
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
    const messageUrl = `${protocol}://${host}/api/mcp/message?sessionId=${sessionId}`;

    res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
    console.log(`[MCP Server] SSE client connected: sessionId=${sessionId} (Token info synced)`);

    // Standard heartbeat comment frame to prevent connection time outs on ingress reverse proxy layers
    const keepAliveTimer = setInterval(() => {
      res.write(":\n\n");
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    }, 20000);

    req.on("close", () => {
      clearInterval(keepAliveTimer);
      activeMCPSessions.delete(sessionId);
      console.log(`[MCP Server] SSE client disconnected: sessionId=${sessionId}`);
    });
  });

  // Client messaging target containing JSON-RPC operations
  app.post("/api/mcp/message", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    console.log(`[MCP Server] POST /api/mcp/message invoked. sessionId = ${sessionId || "none"}`);

    const clientSession = activeMCPSessions.get(sessionId);
    if (!clientSession) {
      console.warn(`[MCP Server] WARNING: Message transmission failed. No active SSE stream found for sessionId: "${sessionId}"`);
      return res.status(404).json({ error: `Active MCP transmission session "${sessionId}" not found.` });
    }

    const { id, method, params } = req.body;
    // Redact long string args (e.g. markdown_content) so document contents never hit the logs.
    const logParams = (() => {
      const p = params || {};
      if (p.arguments && typeof p.arguments === "object") {
        const args: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(p.arguments)) {
          args[k] = typeof v === "string" && v.length > 80 ? `<string: ${v.length} chars redacted>` : v;
        }
        return { ...p, arguments: args };
      }
      return p;
    })();
    console.log(`[MCP Server] JSON-RPC request received. ID: ${id}, Method: "${method}", Params:`, JSON.stringify(logParams));

    const { res: sseRes, mcpToken } = clientSession;
    const sessionData = sessions.get(mcpToken);

    if (!sessionData) {
      console.warn(`[MCP Server] WARNING: Credentials linked to mcpToken "${mcpToken}" not found or have expired.`);
      return res.status(401).json({ error: "Linked session credentials have expired or are missing." });
    }

    const { accessToken, settings = DEFAULT_SETTINGS } = sessionData;
    console.log(`[MCP Server] Credentials verified for user: ${sessionData.email}. Workspace AccessToken present? ${!!accessToken}`);

    try {
      if (method === "initialize") {
        // Record which agent is on this session so the web UI can list connected clients
        if (params?.clientInfo) {
          clientSession.clientInfo = params.clientInfo;
        }
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: "markdown-to-gdocs-mcp",
              version: "1.0.0"
            }
          }
        };
        console.log(`[MCP Server] Responding to "initialize". Payload to SSE:`, JSON.stringify(response));
        sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
        if (typeof (sseRes as any).flush === "function") {
          (sseRes as any).flush();
        }
        return res.status(200).send("Accepted");
      }

      if (method === "notifications/initialized") {
        console.log('[MCP Server] Received "notifications/initialized" signal from client. Handshake fully complete!');
        return res.status(200).send("Accepted");
      }

      if (method === "tools/list") {
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "convert_markdown_to_gdoc",
                description: "Convert markdown formatting directly into an exquisitely formatted, custom styled Google Document placed inside Google Drive root ('My Drive'). Supports headings, bullet lists, bold, italics, tables, and rules.",
                inputSchema: {
                  type: "object",
                  properties: {
                    markdown_content: {
                      type: "string",
                      description: "The complete markdown document text to be parsed and translated."
                    },
                    document_name: {
                      type: "string",
                      description: "Optional. The target name or title of the newly created Google Doc. Defaults to 'Claude Converted Doc'."
                    }
                  },
                  required: ["markdown_content"]
                }
              }
            ]
          }
        };
        console.log(`[MCP Server] Responding to "tools/list". Payload to SSE:`, JSON.stringify(response));
        sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
        if (typeof (sseRes as any).flush === "function") {
          (sseRes as any).flush();
        }
        return res.status(200).send("Accepted");
      }

      if (method === "tools/call") {
        const { name, arguments: args } = params || {};
        console.log(`[MCP Server] Executing tools/call for tool "${name}"`);
        if (name === "convert_markdown_to_gdoc") {
          const markdown = args?.markdown_content || "";
          const titleName = args?.document_name || "Claude Converted Doc";

          console.log(`[MCP Server] Running conversion processor for Document Title: "${titleName}"`);

          try {
            // Parse Markdown Elements
            console.log(`[MCP Server] Parsing markdown input string (${markdown.length} characters)...`);
            const parsed = parseMarkdown(markdown, titleName, settings.headingMapping);
            console.log(`[MCP Server] Parse finished! Found title: "${parsed.title}", Elements count: ${parsed.elements.length}`);

            // Construct new clean Google Doc
            console.log("[MCP Server] Initializing new blank Google Document in standard Cloud Workspace...");
            const documentId = await createBlankDoc(accessToken, parsed.title);
            console.log(`[MCP Server] Document successfully instantiated with ID: ${documentId}`);

            // Style content and headers dynamically
            console.log("[MCP Server] Styling document structures and applying format templates...");
            await styleDocContent(accessToken, documentId, parsed.elements, settings);
            console.log("[MCP Server] Formatting rules applied successfully!");

            // Move final styled documents in root Google Drive (default root)
            console.log("[MCP Server] Relocating Google Document file to target drive location: Root Folder");
            await moveFileToFolder(accessToken, documentId, "root");

            const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
            console.log(`[MCP Server] Conversion process is complete! Google Doc URL: ${docUrl}`);

            const successRes = {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `Successfully converted Markdown to Google Doc!\n\nDocument Title: ${parsed.title}\nGoogle Doc URL: ${docUrl}\nSaved in: My Drive (Root)`
                  }
                ]
              }
            };
            sseRes.write(`event: message\ndata: ${JSON.stringify(successRes)}\n\n`);
            if (typeof (sseRes as any).flush === "function") {
              (sseRes as any).flush();
            }
            return res.status(200).send("Accepted");
          } catch (execErr: any) {
            console.error("[MCP Server] Tool operational conversion failure:", execErr);
            const errRes = {
              jsonrpc: "2.0",
              id,
              result: {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: `Failed to style and create Google Doc: ${execErr.message || "Unknown error during export assembly."}`
                  }
                ]
              }
            };
            sseRes.write(`event: message\ndata: ${JSON.stringify(errRes)}\n\n`);
            if (typeof (sseRes as any).flush === "function") {
              (sseRes as any).flush();
            }
            return res.status(200).send("Accepted");
          }
        } else {
          console.warn(`[MCP Server] WARNING: Client requested unknown tool: "${name}"`);
        }
      }

      // Default unhandled operation handler
      console.warn(`[MCP Server] Unhandled JSON-RPC method: "${method}"`);
      const fallbackResponse = {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found or unsupported: ${method}`
        }
      };
      sseRes.write(`event: message\ndata: ${JSON.stringify(fallbackResponse)}\n\n`);
      if (typeof (sseRes as any).flush === "function") {
        (sseRes as any).flush();
      }
      return res.status(200).send("Accepted");
    } catch (routeErr: any) {
      console.error("[MCP Server] JSON-RPC Message handling route crash:", routeErr);
      return res.status(500).json({ error: routeErr.message || "Internal server messaging exception." });
    }
  });

  // Setup Vite build server integrations
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("[MCP Server] Loaded Vite development engine middleware layers successfully.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("[MCP Server] Serving bundled production static assets: " + distPath);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[MCP Server] Operating full-stack service successfully under Port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("[MCP Server] Initialization crash:", err);
});
