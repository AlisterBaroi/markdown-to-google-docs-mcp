/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  FileText, 
  Settings as SettingsIcon, 
  FolderOpen, 
  LogOut, 
  Play, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink,
  ChevronRight,
  BookOpen,
  ArrowRight,
  Sun,
  Moon,
  Terminal
} from 'lucide-react';
import { User } from 'firebase/auth';

import { initAuth, googleSignIn, logout } from './utils/firebaseAuth';
import { parseMarkdown } from './utils/markdownParser';
import { createBlankDoc, styleDocContent, moveFileToFolder } from './utils/docsExporter';
import { ConversionSettings, UploadedFile } from './types';

import FileUploader from './components/FileUploader';
import FolderSelector from './components/FolderSelector';
import SettingsPanel from './components/SettingsPanel';
import McpPanel from './components/McpPanel';

// Default user guidelines settings
const DEFAULT_SETTINGS: ConversionSettings = {
  title: {
    fontFamily: 'Arial',
    fontSize: 24,
    lineSpacing: 100, // standard line height
    spaceAbove: 0,
    spaceBelow: 3,
    bold: true,
    color: { red: 0, green: 0, blue: 0 }
  },
  heading1: {
    fontFamily: 'Arial',
    fontSize: 20,
    lineSpacing: 100,
    spaceAbove: 20,
    spaceBelow: 6,
    bold: true,
    color: { red: 0, green: 0, blue: 0 }
  },
  heading2: {
    fontFamily: 'Arial',
    fontSize: 16,
    lineSpacing: 100,
    spaceAbove: 18,
    spaceBelow: 4,
    bold: true,
    color: { red: 0, green: 0, blue: 0 }
  },
  text: {
    fontFamily: 'Arial',
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 8,
    bold: false,
    color: { red: 0, green: 0, blue: 0 }
  },
  textBold: {
    fontFamily: 'Arial',
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 0,
    bold: true,
    color: { red: 0, green: 0, blue: 0 }
  },
  textItalic: {
    fontFamily: 'Arial',
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 0,
    bold: false,
    color: { red: 0.4, green: 0.4, blue: 0.4 } // dark gray 3
  },
  textUnderline: {
    fontFamily: 'Arial',
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 0,
    bold: false,
    color: { red: 0, green: 0, blue: 0 }
  },
  list: {
    fontFamily: 'Arial',
    fontSize: 11,
    lineSpacing: 100,
    spaceAbove: 0,
    spaceBelow: 4, // Final bullet spaceBelow is 8pt handled programmatically in Docs Exporter
    bold: false,
    color: { red: 0, green: 0, blue: 0 }
  },
  headingMapping: {
    title: '#',
    heading1: '##',
    heading2: '###'
  }
};

const LOCAL_STORAGE_SETTINGS_KEY = 'md_to_gdocs_converter_settings';

export default function App() {
  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const persisted = localStorage.getItem('md_to_gdocs_theme');
      if (persisted !== null) {
        return persisted === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // App UI state
  const [activeTab, setActiveTab] = useState<'upload' | 'settings'>('upload');
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_SETTINGS);
  
  // Files queue
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  
  // Save Location Drive folder details
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string; fullPath: string }>({
    id: 'root',
    name: 'My Drive (Root)',
    fullPath: 'My Drive (Root)'
  });

  // Processing triggers
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Routing & MCP states
  const [isMcpRoute, setIsMcpRoute] = useState<boolean>(() => {
    return window.location.pathname.toUpperCase() === "/MCP";
  });

  const [mcpToken, setMcpToken] = useState<string>(() => {
    let token = localStorage.getItem("mcp_connection_token");
    if (!token) {
      const array = new Uint8Array(24);
      window.crypto.getRandomValues(array);
      const hex = Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
      token = `mcp_${hex}`;
      localStorage.setItem("mcp_connection_token", token);
    }
    return token;
  });

  // Handle browser popstate navigation dynamically
  useEffect(() => {
    const handlePopState = () => {
      setIsMcpRoute(window.location.pathname.toUpperCase() === "/MCP");
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Proactively sync credentials to the Express background to permit Claude Code conversions
  useEffect(() => {
    if (user && accessToken && mcpToken) {
      const syncSession = async () => {
        try {
          const res = await fetch("/api/mcp/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              mcpToken,
              accessToken,
              email: user.email,
              displayName: user.displayName,
              settings
            })
          });
          const data = await res.json();
          console.log("[MCP] Credentials synchronized with server:", data);
        } catch (err) {
          console.error("[MCP] Credentials synchronization failed:", err);
        }
      };

      syncSession();
      // Keep state fresh and active on server
      const interval = setInterval(syncSession, 3 * 60 * 1000); // 3 minutes
      return () => clearInterval(interval);
    }
  }, [user, accessToken, mcpToken, settings]);

  // Update theme class on HTML element layout
  useEffect(() => {
    try {
      localStorage.setItem('md_to_gdocs_theme', isDark ? 'dark' : 'light');
    } catch (err) {
      console.error('Failed to preserve theme selection:', err);
    }
    
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Initialize Auth state listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setLoadingAuth(false);
        setAuthError(null);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setLoadingAuth(false);
      }
    );

    // Warm up style settings from LocalStorage
    try {
      const storedSettings = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
          headingMapping: {
            ...DEFAULT_SETTINGS.headingMapping,
            ...(parsed.headingMapping || {})
          }
        });
      }
    } catch (err) {
      console.error('Failed to load settings from local storage:', err);
    }

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setLoadingAuth(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.message || '';
      const errCode = err?.code || '';
      
      if (errCode === 'auth/user-cancelled' || errMsg.includes('user-cancelled') || errMsg.includes('IdP denied access')) {
        setAuthError(
          'Authorization Canceled or Denied: To use this app, please sign in with Google and make sure you check the boxes to grant Google Drive and Google Docs permissions. (We need these to save files directly to your Drive folders).'
        );
      } else if (errCode === 'auth/popup-closed-by-user' || errMsg.includes('popup-closed-by-user')) {
        setAuthError(
          'The sign-in popup window was closed before completing authentication. Please click "Sign in with Google" again and complete the login process.'
        );
      } else if (errCode === 'auth/popup-blocked' || errMsg.includes('popup-blocked')) {
        setAuthError(
          'The sign-in popup was blocked by your browser. Please allow popups for this site and try signing in again.'
        );
      } else {
        setAuthError(
          `Sign in unsuccessful: ${err?.message || 'Unknown error'}. Please try again and confirm permissions for Google Drive & Docs.`
        );
      }
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setUploadedFiles([]);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Saved presets update
  const handleUpdateSettings = (newSettings: ConversionSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const handleResetSettings = () => {
    handleUpdateSettings(DEFAULT_SETTINGS);
  };

  // Save selected Drive folder
  const handleSelectFolder = (folderId: string, folderName: string, fullPath: string) => {
    setSelectedFolder({ id: folderId, name: folderName, fullPath });
  };

  // Uploader operations
  const handleFilesParsed = (newFiles: UploadedFile[]) => {
    setUploadedFiles(prev => [...prev, ...newFiles]);
    setSuccessCount(0); // reset status count on new files
    setGlobalError(null);
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setGlobalError(null);
  };

  const handleClearAll = () => {
    setUploadedFiles([]);
    setSuccessCount(0);
    setGlobalError(null);
  };

  // Batch convert and write to Drive
  const handleConvertAll = async () => {
    if (!accessToken || uploadedFiles.length === 0) return;

    setIsProcessing(true);
    setGlobalError(null);
    let successfullyConverted = 0;

    // We process each file sequentially
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      
      // Skip already success files unless re-tried
      if (file.status === 'success') {
        successfullyConverted++;
        continue;
      }

      // Mark converting state
      setUploadedFiles(prev => {
        const copy = [...prev];
        copy[i] = { ...copy[i], status: 'converting', error: undefined };
        return copy;
      });

      try {
        // 1. Parsing markdown line objects & headers
        const parsed = parseMarkdown(file.content, file.name, settings.headingMapping);

        // 2. Provision empty Google Doc
        const documentId = await createBlankDoc(accessToken, parsed.title);

        // 3. Write and format paragraphs
        await styleDocContent(accessToken, documentId, parsed.elements, settings);

        // 4. Move document to chosen folder
        await moveFileToFolder(accessToken, documentId, selectedFolder.id);

        const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

        // 5. Commit success details
        setUploadedFiles(prev => {
          const copy = [...prev];
          copy[i] = { 
            ...copy[i], 
            status: 'success', 
            docId: documentId, 
            docUrl: docUrl 
          };
          return copy;
        });
        successfullyConverted++;
      } catch (err: any) {
        console.error(`Error converting ${file.name}:`, err);
        setUploadedFiles(prev => {
          const copy = [...prev];
          copy[i] = { 
            ...copy[i], 
            status: 'failed', 
            error: err.message || 'Conversion failed.' 
          };
          return copy;
        });
      }
    }

    setSuccessCount(successfullyConverted);
    setIsProcessing(false);
  };

  // Display loader while auth checks on boot
  if (loadingAuth && !user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors duration-200">
        <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-500 animate-spin mb-3" />
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Connecting Google Workspace...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors duration-200" id="application-container">
      {/* Dynamic Navigation Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm transition-colors duration-200" id="navigation-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[60px] flex items-center justify-between">
          <button 
            onClick={() => {
              window.history.pushState({}, "", "/");
              window.dispatchEvent(new Event("popstate"));
            }}
            className="flex items-center space-x-3 text-left focus:outline-none cursor-pointer hover:opacity-90 transition-opacity"
            id="home-logo-btn"
          >
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm select-none shadow-sm">
              M
            </div>
            <div className="flex flex-col justify-center gap-[3px]">
              <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white block leading-none">Markdown to Docs</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold block leading-none">Transform Markdown files into Google Docs</span>
            </div>
          </button>

          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0 border border-transparent dark:border-slate-800">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="font-semibold text-[11px] hidden sm:inline">Google Drive Connected</span>
              </div>
            )}

            {/* Dark Mode Toggle Button */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition duration-150 cursor-pointer select-none"
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle Dark Mode"
              id="theme-toggle-btn"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-white fill-white/20" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              )}
            </button>

            {user && (
              /* User Profile Dropdown */
              <div className="relative">
                <button 
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  className="flex items-center justify-center focus:outline-none rounded-full ring-2 ring-transparent transition hover:ring-blue-100 dark:hover:ring-blue-900 active:ring-blue-200 cursor-pointer select-none"
                >
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt="avatar" 
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm" 
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center border border-blue-200 dark:border-blue-800 shadow-sm">
                      {(user.displayName || 'U')[0]}
                    </div>
                  )}
                </button>

                {/* Dropdown Menu */}
                {showProfileDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowProfileDropdown(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate leading-tight">{user.displayName || 'Author'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">{user.email}</p>
                      </div>
                      <div className="p-1 mt-1 space-y-1">
                        <button
                          onClick={() => {
                            setShowProfileDropdown(false);
                            window.history.pushState({}, "", "/MCP");
                            window.dispatchEvent(new Event("popstate"));
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg font-medium transition cursor-pointer select-none text-left"
                          title="View MCP Server connection details"
                        >
                          <Terminal className="w-4 h-4 text-slate-500" />
                          MCP Server
                        </button>
                        <button
                          onClick={() => {
                            setShowProfileDropdown(false);
                            handleLogout();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 rounded-lg font-medium transition cursor-pointer select-none text-left"
                          title="Disconnect and log out"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col justify-between min-h-0">
        {!user ? (
          /* Sign-In Welcome Gate Layout with a bordered card */
          <div className="max-w-[540px] mx-auto my-auto w-full px-4 py-8" id="welcome-gate">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-10 shadow-md flex flex-col items-center text-center gap-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-full">
                <BookOpen className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Convert Markdown Files to Google Docs</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 max-w-md mx-auto leading-relaxed">
                  Connect your Google account to parse markdown (.md) files to Google Docs with formatting automatically. Style + save custom formatting for future uses, and organize your files within customized Drive folders.
                </p>
              </div>

              {authError && (
                <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 p-3 rounded-xl border border-red-100 dark:border-red-900/30 font-semibold max-w-md flex items-start gap-2 text-left">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <span>{authError}</span>
                </div>
              )}

              {/* Google Sign-In Styled Button matching specs */}
              <button 
                onClick={handleLogin} 
                className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold text-xs py-3 px-4 shadow-sm transition-all duration-200 cursor-pointer"
                id="google-login-btn"
              >
                <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-full h-full block">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="font-roboto">Sign in with Google</span>
              </button>
            </div>
          </div>
        ) : isMcpRoute ? (
          <McpPanel 
            user={user}
            mcpToken={mcpToken}
            onRegenerateToken={() => {
              if (confirm("Are you sure you want to invalidate your current token and generate a new one? You will need to update your Claude config.")) {
                const array = new Uint8Array(24);
                window.crypto.getRandomValues(array);
                const hex = Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
                const newToken = `mcp_${hex}`;
                setMcpToken(newToken);
                localStorage.setItem("mcp_connection_token", newToken);
              }
            }}
            onBack={() => {
              window.history.pushState({}, "", "/");
              window.dispatchEvent(new Event("popstate"));
            }}
          />
        ) : (
          /* Active Workspace Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="active-workspace">
            {/* Left Column: Files & Controls & Presets */}
            <div className="lg:col-span-7 flex flex-col gap-6" id="left-sidebar-controls">
              
              {/* Tabs for Markdown and Style Presets */}
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`py-2.5 px-4 text-xs font-bold border-b-2 transition select-none cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'upload'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 font-bold'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  id="tab-selector-upload"
                >
                  <FileText className="w-4 h-4" />
                  Files and queue
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`py-2.5 px-4 text-xs font-bold border-b-2 transition select-none cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'settings'
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 font-bold'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  id="tab-selector-presets"
                >
                  <SettingsIcon className="w-4 h-4" />
                  Typography and Layout Presets
                </button>
              </div>

              {/* Tab Views */}
              {activeTab === 'upload' ? (
                <FileUploader
                  onFilesParsed={handleFilesParsed}
                  uploadedFiles={uploadedFiles}
                  onRemoveFile={handleRemoveFile}
                  onClearAll={handleClearAll}
                />
              ) : (
                <SettingsPanel
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onResetSettings={handleResetSettings}
                />
              )}

              {/* Master execution block */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl flex flex-col gap-5 shadow-sm" id="master-execution-panel">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Ready to convert?</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium leading-relaxed">
                      Saving into:{' '}
                      <span className="font-bold text-blue-600 dark:text-blue-400 truncate inline-block max-w-[200px] sm:max-w-[400px] align-bottom">
                        {selectedFolder.fullPath}
                      </span>
                    </p>
                  </div>

                  <button
                    onClick={handleConvertAll}
                    disabled={isProcessing || uploadedFiles.length === 0}
                    className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200/50 dark:shadow-none select-none cursor-pointer transition shrink-0"
                    id="btn-trigger-conversion"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Converting Posts...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Convert & Save to Drive
                      </>
                    )}
                  </button>
                </div>

                {/* Conversion outcome feedback alerts */}
                {globalError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-semibold rounded-xl border border-red-100 dark:border-red-900/35 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                    <span>{globalError}</span>
                  </div>
                )}

                {successCount > 0 && !isProcessing && (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-350 text-xs font-semibold rounded-xl border border-emerald-100/80 dark:border-emerald-900/30 flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="font-bold text-sm text-emerald-900 dark:text-emerald-300">Conversion completed successfully!</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                        {successCount} Markdown file(s) were compiled and stored in Google Drive. Read links are active below.
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Completed Google Docs hyperlinks */}
                {uploadedFiles.some(f => f.status === 'success') && (
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex flex-col gap-2.5">
                    <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Access Created Google Documents:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[140px] overflow-y-auto pr-0.5">
                      {uploadedFiles.filter(f => f.status === 'success').map((f, idx) => (
                        <a
                           key={`success-link-${idx}`}
                           href={f.docUrl}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 transition truncate select-none text-xs text-emerald-800 dark:text-emerald-300 font-bold"
                           title="Open Google Doc in new tab"
                        >
                           <span className="truncate mr-2">{f.name.replace(/\.md$/i, '')}</span>
                           <ExternalLink className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Destination Browser Folder Selection */}
            <div className="lg:col-span-5 flex flex-col gap-4.5" id="right-sidebar">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
                <FolderOpen className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <h3>Google Drive Destination Save Path</h3>
              </div>

              <FolderSelector
                accessToken={accessToken}
                selectedFolderId={selectedFolder.id}
                onSelectFolder={handleSelectFolder}
              />
            </div>
          </div>
        )}
      </main>
      
      {/* Absolute Bottom Status Bar */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-5 transition-colors duration-200" id="application-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
          <p>© 2026 <a href="https://github.com/alisterbaroi" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold underline transition-colors">Alister Baroi</a>. All rights reserved.</p>
          <p className="text-slate-400 dark:text-slate-500">Uses Google Documents & Google Drive APIs.</p>
        </div>
      </footer>
    </div>
  );
}
