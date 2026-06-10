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

  const codeCli = `claude mcp add markdown-to-gdocs sse "${sseUrl}"`;

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
              <div className="space-y-4 animate-in fade-in duration-200">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  Add this application as a remote server to **Claude Code** (Anthropic's CLI interactive agent). This exposes the conversion tool to let Claude build Google documents directly from your workspace directory.
                </p>

                <div className="space-y-4 pt-1">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                      <span className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                      Run Registration Command
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none mb-2">
                      Paste and execute this command in your computer's terminal to register the adapter:
                    </p>
                    <div className="relative">
                      <pre className="p-3.5 bg-slate-950 text-slate-100 font-mono text-[10px] sm:text-xs rounded-xl overflow-x-auto border border-slate-800 break-all whitespace-pre-wrap pr-12 leading-relaxed">
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
                        Claude Code will fetch your workspace session, upload the text to Google, style paragraphs matching your settings, and print out the completed Google Doc hyperlink!
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
