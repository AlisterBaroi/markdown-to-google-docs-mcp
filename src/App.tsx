import React, { useEffect, useState, useCallback } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout } from './auth';
import { DocSettings, DEFAULT_SETTINGS, markdownToStyledHtml } from './converter';
import { uploadHtmlToGoogleDocs, fetchFolderName } from './driveApi';
import { UploadCloud, FileText, Settings2, FolderTree, ExternalLink, LogOut, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Reusable Sign In Button Component
const GoogleSignInButton = ({ onClick, disabled }: { onClick: () => void, disabled?: boolean }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex items-center justify-center bg-white text-[#3c4043] font-medium text-[14px] rounded-md shadow-sm border border-[#dadce0] px-3 py-2 disabled:opacity-50 transition-colors hover:bg-[#f8f9fa] focus:outline-none focus:ring-2 focus:ring-[#4285F4] focus:border-transparent hover:cursor-pointer w-full max-w-sm`}
      style={{ fontFamily: '"Google Sans", Roboto, Arial, sans-serif' }}
    >
      <div className="mr-3 w-[18px] h-[18px]">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-full h-full block">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
          <path fill="none" d="M0 0h48v48H0z"></path>
        </svg>
      </div>
      <span>Sign in with Google</span>
    </button>
  );
};

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // App State
  const [settings, setSettings] = useState<DocSettings>(() => {
    const saved = localStorage.getItem('md-to-docs-settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [showSettings, setShowSettings] = useState(false);
  
  const [folderId, setFolderId] = useState(() => localStorage.getItem('md-to-docs-folder') || '');
  const [folderName, setFolderName] = useState('');
  
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [isConverting, setIsConverting] = useState(false);
  const [convResult, setConvResult] = useState<{ id: string, url: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const unsubscribe = initAuth(
      (u, _) => {
        setUser(u);
        setNeedsAuth(false);
        setIsInitializing(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
        setIsInitializing(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('md-to-docs-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('md-to-docs-folder', folderId);
    if (folderId && !needsAuth && user) {
      fetchFolderName(folderId)
        .then(name => setFolderName(name))
        .catch(() => setFolderName('Unknown Folder (Check ID or Permissions)'));
    } else {
      setFolderName('');
    }
  }, [folderId, needsAuth, user]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
    setConvResult(null);
  };

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.md')) { // allow other extensions if markdown, but strict is safer
      setFile(droppedFile);
      setConvResult(null);
      setErrorMsg('');
    } else if (droppedFile) {
       setErrorMsg('Please drop a Markdown (.md) file');
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setConvResult(null);
      setErrorMsg('');
    }
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsConverting(true);
    setErrorMsg('');
    setConvResult(null);

    try {
      // confirm dialog as we create new data in user workspace
      const confirmed = window.confirm(`Convert "${file.name}" to a Google Doc${folderId ? ` in folder "${folderName}"` : ''}?`);
      if (!confirmed) {
        setIsConverting(false);
        return;
      }

      const text = await file.text();
      const htmlContent = await markdownToStyledHtml(text, settings);
      
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const res = await uploadHtmlToGoogleDocs(htmlContent, fileNameWithoutExt, folderId || undefined);
      
      setConvResult(res);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred during conversion.");
    } finally {
      setIsConverting(false);
    }
  };

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse flex items-center gap-2"><div className="h-4 w-4 bg-gray-400 rounded-full" /><div className="h-4 w-4 bg-gray-400 rounded-full" /></div></div>;
  }

  if (needsAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-gray-100 flex flex-col items-center text-center">
          <div className="bg-blue-100 p-3 rounded-full mb-4 shrink-0">
             <FileText className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-semibold mb-2 text-gray-900">Markdown to Docs</h1>
          <p className="text-gray-600 mb-8 max-w-sm">
            Convert your markdown blogs into beautifully styled Google Docs, automatically saved to your Drive.
          </p>
          <GoogleSignInButton onClick={handleLogin} disabled={isLoggingIn} />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4 sm:px-6 md:px-8 font-sans">
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-4xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 leading-tight">Markdown Converter</h1>
            <p className="text-sm font-medium text-gray-500">Google Docs & Drive Sync</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {user?.photoURL && <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-gray-200" />}
           <button onClick={handleLogout} className="text-gray-500 hover:text-gray-800 transition flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">
             <LogOut className="w-4 h-4" /> Sign out
           </button>
        </div>
      </motion.div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col gap-6">
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                 <UploadCloud className="w-5 h-5 text-gray-500" />
                 Upload Markdown Source
              </h2>
              <div 
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors group cursor-pointer relative ${isDragging ? 'border-blue-500 bg-blue-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}
              >
                  <input 
                    type="file" 
                    accept=".md,text/markdown" 
                    onChange={handleFileChange} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {file ? (
                    <>
                       <div className="p-3 bg-green-100 text-green-600 rounded-full mb-3 shadow-none">
                         <FileText className="w-8 h-8" />
                       </div>
                       <p className="text-gray-800 font-medium text-center">{file.name}</p>
                       <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB • Click or drag to replace</p>
                    </>
                  ) : (
                    <>
                       <div className="p-4 bg-gray-100 text-gray-500 rounded-full mb-3 group-hover:bg-white group-hover:shadow-sm transition-all shadow-none">
                          <UploadCloud className="w-10 h-10" />
                       </div>
                       <p className="text-gray-800 font-medium text-center">Click or Drag to Upload</p>
                       <p className="text-sm text-gray-500 mt-1 text-center">Supports .md markdown files</p>
                    </>
                  )}
              </div>

              <div className="mt-8">
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                     <FolderTree className="w-4 h-4 text-gray-500" /> Drive Export Location (Folder ID)
                  </label>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      value={folderId} 
                      onChange={(e) => setFolderId(e.target.value)} 
                      placeholder="e.g. 1A2b3C4d5E6f7G8h9I0j_" 
                      className="flex-1 w-full border border-gray-300 rounded-lg shadow-sm px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  {folderName && <p className="text-xs text-blue-600 font-medium mt-2 py-1 px-3 bg-blue-50 max-w-max rounded-md inline-block">Targeting: {folderName}</p>}
                  {!folderId && <p className="text-xs text-gray-500 mt-2">Leave blank to save in the root of your Google Drive.</p>}
              </div>

              <div className="mt-8 pt-8 border-t border-gray-100 flex flex-col items-center">
                 {errorMsg && <div className="w-full p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">{errorMsg}</div>}
                 
                 <AnimatePresence>
                   {convResult && (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full flex items-center justify-between p-4 mb-6 bg-green-50 rounded-xl border border-green-200">
                         <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                            <div>
                               <p className="text-sm font-semibold text-green-900">Successfully Converted!</p>
                               <p className="text-xs text-green-700 font-medium">Saved to Google Drive</p>
                            </div>
                         </div>
                         <a href={convResult.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-white bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition">
                           Open Doc <ExternalLink className="w-4 h-4" />
                         </a>
                      </motion.div>
                   )}
                 </AnimatePresence>

                 <button
                    onClick={handleConvert}
                    disabled={!file || isConverting}
                    className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white font-semibold py-3 px-6 rounded-xl transition shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    {isConverting ? (
                       <><div className="animate-spin h-5 w-5 border-2 border-white/20 border-t-white rounded-full"></div> Converting...</>
                    ) : (
                       <><FileText className="w-5 h-5" /> Convert & Save to Drive</>
                    )}
                 </button>
              </div>
           </motion.div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex-1">
              <div className="flex items-center justify-between mb-6">
                 <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-gray-500" /> Style Settings
                 </h2>
                 <button onClick={() => setSettings(DEFAULT_SETTINGS)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition bg-blue-50 px-2 py-1 rounded">Reset Defaults</button>
              </div>

              <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {Object.keys(settings).map((key) => {
                  const sKey = key as keyof DocSettings;
                  const sectionName = sKey.charAt(0).toUpperCase() + sKey.slice(1);
                  return (
                    <div key={key} className="space-y-3 pb-5 border-b border-gray-100 last:border-0 last:pb-0">
                       <h3 className="text-sm font-bold text-gray-800 bg-gray-50 px-3 py-1 -mx-3 rounded">{sectionName}</h3>
                       <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Font Family</label>
                            <input type="text" value={settings[sKey].fontFamily} onChange={(e) => setSettings({...settings, [key]: {...settings[sKey], fontFamily: e.target.value}})} className="w-full text-sm border-b border-gray-200 focus:border-blue-500 py-1 bg-transparent focus:outline-none transition appearance-none" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Size (pt)</label>
                            <input type="number" value={settings[sKey].fontSize} onChange={(e) => setSettings({...settings, [key]: {...settings[sKey], fontSize: Number(e.target.value)}})} className="w-full text-sm border-b border-gray-200 focus:border-blue-500 py-1 bg-transparent focus:outline-none transition appearance-none" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Line Hgt</label>
                            <input type="number" step="0.1" value={settings[sKey].lineHeight} onChange={(e) => setSettings({...settings, [key]: {...settings[sKey], lineHeight: Number(e.target.value)}})} className="w-full text-sm border-b border-gray-200 focus:border-blue-500 py-1 bg-transparent focus:outline-none transition appearance-none" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Spacing Before</label>
                            <input type="number" value={settings[sKey].marginTop} onChange={(e) => setSettings({...settings, [key]: {...settings[sKey], marginTop: Number(e.target.value)}})} className="w-full text-sm border-b border-gray-200 focus:border-blue-500 py-1 bg-transparent focus:outline-none transition appearance-none" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Spacing After</label>
                            <input type="number" value={settings[sKey].marginBottom} onChange={(e) => setSettings({...settings, [key]: {...settings[sKey], marginBottom: Number(e.target.value)}})} className="w-full text-sm border-b border-gray-200 focus:border-blue-500 py-1 bg-transparent focus:outline-none transition appearance-none" />
                          </div>
                          {sKey === 'list' && (
                            <div>
                               <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wider">Last Item After</label>
                               <input type="number" value={settings.list.lastItemMarginBottom} onChange={(e) => setSettings({...settings, list: {...settings.list, lastItemMarginBottom: Number(e.target.value)}})} className="w-full text-sm border-b border-gray-200 focus:border-blue-500 py-1 bg-transparent focus:outline-none transition appearance-none" />
                            </div>
                          )}
                       </div>
                    </div>
                  )
                })}
              </div>
           </motion.div>
        </div>
      </div>
    </div>
  );
}
