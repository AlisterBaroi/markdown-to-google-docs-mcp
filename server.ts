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

// Setup storage maps for MCP sessions
// Key: mcpToken (generated on client, persistent) -> Value: user's session details
const sessions = new Map<string, {
  accessToken: string;
  email: string;
  displayName: string;
  settings?: ConversionSettings;
  updatedAt: number;
}>();

// Key: sessionId (generated during SSE handshake) -> Value: active client SSE connection
const activeMCPSessions = new Map<string, {
  res: express.Response;
  mcpToken: string;
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
  const PORT = 3000;

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

    console.log(`[MCP Server] Synced local session for user: ${email || "Unknown"}`);
    res.json({ success: true, message: "Credentials synced successfully to server background." });
  });

  // SSE Transport connection endpoint
  app.get("/api/mcp/sse", (req, res) => {
    const token = req.query.token as string;
    if (!token || !sessions.has(token)) {
      return res.status(401).send("Unauthorized: Invalid or non-existent MCP Connection Token. Access the /MCP setup page on the Web UI.");
    }

    // Set standard Headers for Keep-Alive Server-Sent Events stream
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    const sessionId = Math.random().toString(36).substring(2, 11);
    activeMCPSessions.set(sessionId, { res, mcpToken: token });

    // Derive absolute entry points for JSON-RPC POST communication payloads
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
    const messageUrl = `${protocol}://${host}/api/mcp/message?sessionId=${sessionId}`;

    res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);
    console.log(`[MCP Server] SSE client connected: sessionId=${sessionId} (Token info synced)`);

    // Standard heartbeat comment frame to prevent connection time outs on ingress reverse proxy layers
    const keepAliveTimer = setInterval(() => {
      res.write(":\n\n");
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
    const clientSession = activeMCPSessions.get(sessionId);

    if (!clientSession) {
      return res.status(404).json({ error: "Active MCP transmission session not found." });
    }

    const { id, method, params } = req.body;
    const { res: sseRes, mcpToken } = clientSession;
    const sessionData = sessions.get(mcpToken);

    if (!sessionData) {
      return res.status(401).json({ error: "Linked session credentials have expired or are missing." });
    }

    const { accessToken, settings = DEFAULT_SETTINGS } = sessionData;

    try {
      if (method === "initialize") {
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
        sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
        return res.status(200).send("Accepted");
      }

      if (method === "notifications/initialized") {
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
        sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
        return res.status(200).send("Accepted");
      }

      if (method === "tools/call") {
        const { name, arguments: args } = params || {};
        if (name === "convert_markdown_to_gdoc") {
          const markdown = args?.markdown_content || "";
          const titleName = args?.document_name || "Claude Converted Doc";

          console.log(`[MCP Server] Executing conversion for tool: ${titleName}`);

          try {
            // Parse Markdown Elements
            const parsed = parseMarkdown(markdown, titleName, settings.headingMapping);

            // Construct new clean Google Doc
            const documentId = await createBlankDoc(accessToken, parsed.title);

            // Style content and headers dynamically
            await styleDocContent(accessToken, documentId, parsed.elements, settings);

            // Move final styled documents in root Google Drive (default root)
            await moveFileToFolder(accessToken, documentId, "root");

            const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

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
            return res.status(200).send("Accepted");
          }
        }
      }

      // Default unhandled operation handler
      const fallbackResponse = {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found or unsupported: ${method}`
        }
      };
      sseRes.write(`event: message\ndata: ${JSON.stringify(fallbackResponse)}\n\n`);
      res.status(200).send("Accepted");
    } catch (routeErr: any) {
      console.error("[MCP Server] Message handling route crash:", routeErr);
      res.status(500).json({ error: routeErr.message || "Internal server messaging exception." });
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
