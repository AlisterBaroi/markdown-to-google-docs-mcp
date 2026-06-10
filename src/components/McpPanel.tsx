/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { 
  ArrowLeft, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Terminal, 
  Monitor, 
  Cpu, 
  Sparkles, 
  CheckCircle2, 
  RefreshCw,
  ExternalLink
} from "lucide-react";
import { User } from "firebase/auth";

interface McpPanelProps {
  user: User | null;
  mcpToken: string;
  onRegenerateToken: () => void;
  onBack: () => void;
}

export default function McpPanel({ user, mcpToken, onRegenerateToken, onBack }: McpPanelProps) {
  const [showToken, setShowToken] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"cli" | "desktop">("cli");

  // Get current window origin (absolute host link)
  const appOrigin = window.location.origin;
  const sseUrl = `${appOrigin}/api/mcp/sse?token=${mcpToken}`;

  // Helper code copy mechanism
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // NOTE: the `--` separator is required. Without it `claude mcp add` interprets the
  // node `-e` flag as its OWN `-e/--env` option and swallows the `fetch(...?token=...)`
  // string as a KEY=VALUE env var (split on the first `=`), leaving node with no script.
  const codeCli = `claude mcp add markdown-to-gdocs -- node -e "fetch('${appOrigin}/mcp-bridge.js?token=${mcpToken}').then(r=>r.text()).then(t=>eval(t))"`;

  const localScriptCode = [
    "/**",
    " * Google Docs MCP Client Bridge",
    " * Save this file as \"gdocs-mcp.js\" in your project directory or home directory",
    " */",
    "",
    "const http = require(\"http\");",
    "const https = require(\"https\");",
    "const readline = require(\"readline\");",
    "",
    `const sseUrl = "${sseUrl}";`,
    "console.error(\"[MCP Bridge] Booting Google Docs MCP client bridge adapter...\");",
    "console.error(\"[MCP Bridge] Stream Transport Target (SSE):\", sseUrl);",
    "",
    "function request(url, options = {}, redirectCount = 0) {",
    "  if (redirectCount > 5) {",
    "    return Promise.reject(new Error(\"Too many redirects\"));",
    "  }",
    "  return new Promise((resolve, reject) => {",
    "    const parsed = new URL(url);",
    "    const client = parsed.protocol === \"https:\" ? https : http;",
    "    const headers = options.headers || {};",
    "    if (options.body) {",
    "      headers[\"Content-Length\"] = Buffer.byteLength(options.body);",
    "    }",
    "    console.error(\"[MCP Bridge] POST Request to Callback: \" + (options.method || \"POST\") + \" \" + url);",
    "    if (options.body) {",
    "      console.error(\"[MCP Bridge] POST Payload size: \" + headers[\"Content-Length\"] + \" bytes: \" + options.body.substring(0, 150) + \"...\");",
    "    }",
    "",
    "    const req = client.request(url, {",
    "      method: options.method || \"GET\",",
    "      headers",
    "    }, (res) => {",
    "      console.error(\"[MCP Bridge] Received callback response status: \" + res.statusCode);",
    "      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {",
    "        const dest = new URL(res.headers.location, url).toString();",
    "        console.error(\"[MCP Bridge] Redirection detected [Status \" + res.statusCode + \"] to: \" + dest);",
    "        resolve(request(dest, options, redirectCount + 1));",
    "      } else {",
    "        resolve(res);",
    "      }",
    "    });",
    "",
    "    req.on(\"error\", (err) => {",
    "      console.error(\"[MCP Bridge] HTTP client error inside callback transfer:\", err);",
    "      reject(err);",
    "    });",
    "",
    "    if (options.body) {",
    "      req.write(options.body);",
    "    }",
    "    req.end();",
    "  });",
    "}",
    "",
    "function run(url = sseUrl, redirectCount = 0) {",
    "  if (redirectCount > 5) {",
    "    console.error(\"[MCP Bridge] Too many redirects for SSE connection.\");",
    "    process.exit(1);",
    "  }",
    "  const parsedSSE = new URL(url);",
    "  const client = parsedSSE.protocol === \"https:\" ? https : http;",
    "",
    "  console.error(\"[MCP Bridge] Opening streaming HTTP connection to: \" + url);",
    "",
    "  const req = client.request(url, {",
    "    method: \"GET\",",
    "    headers: {",
    "      \"Accept\": \"text/event-stream\"",
    "    }",
    "  }, (res) => {",
    "    console.error(\"[MCP Bridge] Connection handshake completed! Status Code: \" + res.statusCode);",
    "    console.error(\"[MCP Bridge] Response Headers: \" + JSON.stringify(res.headers));",
    "",
    "    if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {",
    "      const dest = new URL(res.headers.location, url).toString();",
    "      console.error(\"[MCP Bridge] Redirection detected on SSE handshake -> \" + dest);",
    "      run(dest, redirectCount + 1);",
    "      return;",
    "    }",
    "",
    "    if (res.statusCode !== 200) {",
    "      console.error(\"[MCP Bridge] Connect failed! HTTP status code:\", res.statusCode);",
    "      if (res.statusCode === 401) {",
    "        console.error(\"[MCP Bridge] ERROR: Unauthorized. Check if your mcpToken matches the backend sync list.\");",
    "      }",
    "      process.exit(1);",
    "    }",
    "",
    "    let buffer = \"\";",
    "    res.on(\"data\", (chunk) => {",
    "      const chunkStr = chunk.toString();",
    "      buffer += chunkStr;",
    "      let lines = buffer.split(\"\\n\");",
    "      buffer = lines.pop() || \"\";",
    "",
    "      let currentEvent = \"\";",
    "      for (let line of lines) {",
    "        line = line.replace(/\\r$/, \"\");",
    "        if (line.startsWith(\"event:\")) {",
    "          currentEvent = line.substring(6).trim();",
    "          console.error(\"[MCP Bridge] Parsed SSE Event: \" + currentEvent);",
    "        } else if (line.startsWith(\"data:\")) {",
    "          const dataStr = line.substring(5).trim();",
    "          console.error(\"[MCP Bridge] Parsed SSE Data: \" + dataStr.substring(0, 100));",
    "          handleSSEMessage(currentEvent, dataStr);",
    "          currentEvent = \"\";",
    "        } else if (line.trim() === \"\") {",
    "          currentEvent = \"\";",
    "        }",
    "      }",
    "    });",
    "",
    "    res.on(\"end\", () => {",
    "      console.error(\"[MCP Bridge] SSE connection closed by remote server.\");",
    "      process.exit(0);",
    "    });",
    "  });",
    "",
    "  req.on(\"error\", (err) => {",
    "    console.error(\"[MCP Bridge] SSE transport connection error:\", err);",
    "    process.exit(1);",
    "  });",
    "  req.end();",
    "}",
    "",
    "let messageUrl = \"\";",
    "const messageQueue = [];",
    "",
    "function handleSSEMessage(event, data) {",
    "  if (event === \"endpoint\") {",
    "    messageUrl = data;",
    "    console.error(\"[MCP Bridge] SUCCESS: Registered SSE session successfully. messageUrl =\", messageUrl);",
    "    while (messageQueue.length > 0) {",
    "      sendMessage(messageQueue.shift());",
    "    }",
    "  } else if (event === \"message\") {",
    "    console.error(\"[MCP Bridge] Forwarding server JSON-RPC response to stdout:\", data);",
    "    console.log(data);",
    "  }",
    "}",
    "",
    "let stdinStarted = false;",
    "function startStdinListener() {",
    "  if (stdinStarted) return;",
    "  stdinStarted = true;",
    "  console.error(\"[MCP Bridge] Standard input (stdin) command reader is active. Awaiting JSON-RPC requests...\");",
    "",
    "  const rl = readline.createInterface({",
    "    input: process.stdin,",
    "    output: process.stdout,",
    "    terminal: false",
    "  });",
    "",
    "  rl.on(\"line\", (line) => {",
    "    if (!line.trim()) return;",
    "    console.error(\"[MCP Bridge] >>> Read local line from Claude Code: \" + line.substring(0, 150));",
    "    if (!messageUrl) {",
    "      console.error(\"[MCP Bridge] Queuing message because endpoint is not yet received.\");",
    "      messageQueue.push(line);",
    "    } else {",
    "      sendMessage(line);",
    "    }",
    "  });",
    "",
    "  rl.on(\"close\", () => {",
    "    console.error(\"[MCP Bridge] Standard input (stdin) stream closed. Shutting down.\");",
    "    process.exit(0);",
    "  });",
    "}",
    "",
    "async function sendMessage(line) {",
    "  try {",
    "    const res = await request(messageUrl, {",
    "      method: \"POST\",",
    "      headers: {",
    "        \"Content-Type\": \"application/json\"",
    "      },",
    "      body: line",
    "    });",
    "",
    "    let resBody = \"\";",
    "    res.on(\"data\", (chunk) => {",
    "      resBody += chunk.toString();",
    "    });",
    "    res.on(\"end\", () => {",
    "      if (res.statusCode !== 200 && res.statusCode !== 202) {",
    "        console.error(\"[MCP Bridge] ERROR: Callback transmission failed with status \" + res.statusCode + \". Body: \" + resBody.trim());",
    "      } else {",
    "        console.error(\"[MCP Bridge] Success forwarding line (StatusCode: \" + res.statusCode + \")\");",
    "      }",
    "    });",
    "  } catch (err) {",
    "    console.error(\"[MCP Bridge] Failed to forward stdin request:\", err);",
    "  }",
    "}",
    "",
    "startStdinListener();",
    "run();"
  ].join("\n");

  const codeJson = JSON.stringify({
    mcpServers: {
      "markdown-to-gdocs": {
        url: sseUrl
      }
    }
  }, null, 2);

  return (
    <div className="w-full max-w-4xl mx-auto py-4 animate-in fade-in slide-in-from-bottom-4 duration-300" id="mcp-setup-container">
      {/* Back Button and Title */}
      <div className="flex items-center space-x-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-sm cursor-pointer"
          title="Back to markdown converter"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-950 dark:text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            Model Context Protocol (MCP) Server Setup
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Register this app as an MCP server to let AI Agents (like Claude Code) seamlessly generate Google Docs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Core Settings / Token Column */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
              Your Connection Token
            </h3>

            <div className="space-y-4">
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={mcpToken}
                  readOnly
                  className="w-full pr-20 pl-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-800 dark:text-slate-200 select-all"
                />
                <div className="absolute right-1.5 top-1.5 flex items-center space-x-1">
                  <button
                    onClick={() => setShowToken(!showToken)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded cursor-pointer transition"
                    title={showToken ? "Hide Key" : "Show Key"}
                  >
                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleCopy(mcpToken, "token")}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded cursor-pointer transition"
                    title="Copy Key"
                  >
                    {copiedKey === "token" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onRegenerateToken}
                  className="flex-1 text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200/50 rounded-lg py-1.5 px-3 flex items-center justify-center gap-1.5 transition border border-transparent dark:border-slate-800 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset Token
                </button>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wide block">
                    Sync Status:
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shrink-0"></div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Live on cloud run
                    </span>
                  </div>
                </div>

                {user && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wide block">
                      Active Account:
                    </span>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mt-1 truncate">
                      {user.email}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/20 dark:from-blue-950/20 dark:to-transparent border border-blue-100 dark:border-blue-900/30 rounded-2xl p-5 shadow-sm">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-400">
              <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
              Exquisite Auto-Styling
            </h4>
            <p className="text-xs text-indigo-950/80 dark:text-slate-400 mt-2 leading-relaxed">
              When Claude Code calls this server, it formats lists and headings exactly matching the typography configurations saved in your web panel! Keep the browser open or sync frequently to preserve custom layouts.
            </p>
          </div>
        </div>

        {/* Instructions Columns */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="min-h-0">
            {/* Tab navigation */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-5">
              <button
                onClick={() => setActiveTab("cli")}
                className={`pb-2 px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "cli"
                    ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Terminal className="w-4 h-4" />
                Claude Code CLI
              </button>
              <button
                onClick={() => setActiveTab("desktop")}
                className={`pb-2 px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "desktop"
                    ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Monitor className="w-4 h-4" />
                Claude Desktop UI
              </button>
            </div>

            {/* CLI Instructions */}
            {activeTab === "cli" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  Add this application as a remote MCP Server to Claude Code (Anthropic's interactive CLI agent). This exposes the conversion tool to let Claude build styled Google Documents directly from your workspace directory.
                </p>

                <div className="space-y-5">
                  {/* Step 1 */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                      Choose Your Setup Method:
                    </h4>

                    <div className="space-y-4">
                      {/* Method A */}
                      <div className="border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl p-4 space-y-3">
                        <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Method A: One-Liner Command (Unix Shells)
                        </span>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
                          If you are on a native Linux or macOS Zsh terminal, you can run this direct payload fetch:
                        </p>
                        <div className="relative">
                          <pre className="p-3 bg-slate-950 text-slate-100 font-mono text-[10px] rounded-xl overflow-x-auto border border-slate-800 break-all whitespace-pre-wrap pr-12 leading-relaxed">
                            {codeCli}
                          </pre>
                          <button
                            onClick={() => handleCopy(codeCli, "cli")}
                            className="absolute right-2.5 top-2.5 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition cursor-pointer border border-white/5"
                            title="Copy command"
                          >
                            {copiedKey === "cli" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Method B */}
                      <div className="border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl p-4 space-y-3">
                        <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Method B: Local Bridge Script (Recommended for Windows & PowerShell)
                        </span>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
                          By creating a small file, you avoid all shell quote-escaping problems, especially on Windows or custom shells.
                        </p>
                        <ol className="list-decimal list-inside text-[11px] text-slate-500 dark:text-slate-450 space-y-1">
                          <li>Create a file named <code className="font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-slate-205 dark:border-slate-800">gdocs-mcp.js</code> in your project folder.</li>
                          <li>Copy and paste the entire script content below into it.</li>
                        </ol>

                        {/* Local Code block */}
                        <div className="relative">
                          <pre className="p-3 bg-slate-950 text-slate-100 font-mono text-[10px] rounded-xl overflow-auto border border-slate-800 max-h-[350px] leading-relaxed">
                            {localScriptCode}
                          </pre>
                          <button
                            onClick={() => handleCopy(localScriptCode, "bridgeJS")}
                            className="absolute right-2 top-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition cursor-pointer border border-white/5"
                            title="Copy Bridge Script Code"
                          >
                            {copiedKey === "bridgeJS" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-450">
                          Now, run this simple command in your terminal:
                        </p>
                        <div className="relative">
                          <pre className="p-3 bg-slate-950 text-slate-100 font-mono text-[10px] rounded-xl overflow-x-auto border border-slate-800 leading-relaxed break-all whitespace-pre-wrap">
                            {`claude mcp add markdown-to-gdocs node ./gdocs-mcp.js`}
                          </pre>
                          <button
                            onClick={() => handleCopy(`claude mcp add markdown-to-gdocs node ./gdocs-mcp.js`, "cliLocal")}
                            className="absolute right-2 top-2.5 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition cursor-pointer border border-white/5"
                            title="Copy simple command"
                          >
                            {copiedKey === "cliLocal" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                      <span className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                      Enjoy Conversion via Claude Code
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                      Once registered, you can direct Claude Code to export files using normal conversation prompts:
                    </p>
                    <div className="mt-2.5 p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold italic">
                        &quot;Convert this file README.md to google docs format using markdown-to-gdocs&quot;
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                        Claude Code will fetch your workspace session, upload the text, style formatting matching your settings, save the document to the root of your google drive, and print out the completed Google Doc hyperlink!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Desktop Instructions */}
            {activeTab === "desktop" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  Connect **Claude Desktop app** directly to this cloud service by specifying the configuration payload in your local settings profiles.
                </p>

                <div className="space-y-4 pt-1">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                      <span className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                      Identify Configuration Path
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2.5">
                      Open your desktop settings configuration file:
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 font-semibold">macOS:</span>
                        <code className="text-[11px] font-mono text-slate-500 select-all tracking-tight">~/Library/Application Support/Claude/claude_desktop_config.json</code>
                      </div>
                      <div className="flex justify-between items-center px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 font-semibold">Windows:</span>
                        <code className="text-[11px] font-mono text-slate-500 select-all tracking-tight">%APPDATA%\Claude\claude_desktop_config.json</code>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                      <span className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                      Inject Settings Payload
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none mb-2">
                      Incorporate this block inside your config file&apos;s <code className="font-mono text-slate-700 dark:text-slate-450">&quot;mcpServers&quot;</code> list:
                    </p>
                    <div className="relative">
                      <pre className="p-3.5 bg-slate-950 text-slate-100 font-mono text-[10px] sm:text-xs rounded-xl overflow-x-auto border border-slate-800 pr-12 leading-relaxed">
                        {codeJson}
                      </pre>
                      <button
                        onClick={() => handleCopy(codeJson, "json")}
                        className="absolute right-2.5 top-2.5 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition cursor-pointer border border-white/5"
                        title="Copy config JSON"
                      >
                        {copiedKey === "json" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 mt-6 pt-4 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-500 shrink-0" />
            <span>Ready. Start Claude Code or restart Claude Desktop after editing settings.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
