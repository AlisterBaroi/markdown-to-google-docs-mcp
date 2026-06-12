/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { Folder, FolderPlus, Search, ChevronRight, Home, Loader2, RefreshCw } from 'lucide-react';
import { DriveFolder } from '../types';
import { createDriveFolder } from '../utils/docsExporter';

interface FolderSelectorProps {
  accessToken: string | null;
  onSelectFolder: (folderId: string, folderName: string, fullPath: string) => void;
  selectedFolderId: string;
  onTokenExpired?: () => Promise<string | null>;
}

export default function FolderSelector({ accessToken, onSelectFolder, selectedFolderId, onTokenExpired }: FolderSelectorProps) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Folder navigation path stack (starts at my drive root)
  const [pathStack, setPathStack] = useState<Array<{ id: string; name: string }>>([
    { id: 'root', name: 'My Drive' },
  ]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const currentFolder = pathStack[pathStack.length - 1];

  // Fetch folders in the current directory or via search
  const fetchFolders = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      let query = "mimeType='application/vnd.google-apps.folder' and trashed=false";
      
      if (searchQuery.trim()) {
        // Drive query escaping: backslashes first, then quotes (order matters).
        const escaped = searchQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        query += ` and name contains '${escaped}'`;
      } else {
        query += ` and '${currentFolder.id}' in parents`;
      }

      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        query
      )}&fields=files(id,name,parents)&orderBy=name&pageSize=50`;

      const doFetch = (token: string) =>
        fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      let res = await doFetch(accessToken);

      // Token likely expired (~1h lifetime) — refresh silently once and retry.
      if (res.status === 401 && onTokenExpired) {
        const fresh = await onTokenExpired();
        if (fresh) res = await doFetch(fresh);
      }

      if (!res.ok) {
        throw new Error('Failed to retrieve folders from Google Drive.');
      }

      const data = await res.json();
      setFolders(data.files || []);
    } catch (err: any) {
      console.error(err);
      setError('Could not load drive folders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, [accessToken, currentFolder.id, searchQuery]);

  // Helper to compute full path string
  const getFullPath = (folderName: string, stack: Array<{id: string, name: string}> = pathStack) => {
    const stackPath = stack.map(f => f.name).join(' / ');
    return stack.length > 0 && stack[stack.length - 1].name === folderName
      ? stackPath
      : `${stackPath} / ${folderName}`;
  };

  // Handle drilling down into a folder
  const handleOpenFolder = (folder: DriveFolder) => {
    // Clear search query first so we don't carry over searches
    setSearchQuery('');
    const newStack = [...pathStack, { id: folder.id, name: folder.name }];
    setPathStack(newStack);
    onSelectFolder(folder.id, folder.name, newStack.map(f => f.name).join(' / '));
  };

  // Handle clicking breadcrumb to navigate up
  const handleNavigateToBreadcrumb = (index: number) => {
    setSearchQuery('');
    const newStack = pathStack.slice(0, index + 1);
    setPathStack(newStack);
    const target = newStack[newStack.length - 1];
    onSelectFolder(target.id, target.name, newStack.map(f => f.name).join(' / '));
  };

  // Create a new folder in Drive
  const handleCreateFolder = async (e: FormEvent) => {
    e.preventDefault();
    if (!accessToken || !newFolderName.trim()) return;

    setIsCreatingFolder(true);
    setError(null);

    try {
      const parentId = currentFolder.id;
      const folderId = await createDriveFolder(accessToken, newFolderName.trim(), parentId);
      
      // Select the new folder
      setNewFolderName('');
      await fetchFolders();
      onSelectFolder(folderId, newFolderName.trim(), getFullPath(newFolderName.trim()));
    } catch (err: any) {
      console.error(err);
      setError('Failed to create folder. Please try again.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[520px] transition-colors duration-200" id="folder-selector">
      {/* Header with quick breadcrumbs */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center text-sm text-slate-650 dark:text-slate-300 gap-1 flex-wrap">
          <Home className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          {pathStack.map((folder, index) => (
            <div key={folder.id} className="flex items-center">
              {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mx-0.5" />}
              <button
                onClick={() => handleNavigateToBreadcrumb(index)}
                className={`hover:text-blue-600 dark:hover:text-blue-400 font-semibold transition cursor-pointer ${
                  index === pathStack.length - 1 ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-500'
                }`}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>
        
        <button
          onClick={fetchFolders}
          disabled={loading}
          className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title="Refresh folders"
          id="btn-refresh-folders"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
        </button>
      </div>

      {/* Search and Quick folder creation inputs */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2 bg-white dark:bg-slate-900">
        {/* Search Input */}
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 outline-none focus:border-blue-500 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-950 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 min-w-0"
            id="search-folders-input"
          />
        </div>

        {/* Quick Folder Creation */}
        <form onSubmit={handleCreateFolder} className="relative min-w-0">
          <input
            type="text"
            placeholder="New folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="w-full pl-3 pr-24 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 outline-none focus:border-blue-500 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-950 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            disabled={isCreatingFolder}
            id="new-folder-name"
          />
          <button
            type="submit"
            disabled={isCreatingFolder || !newFolderName.trim()}
            className="absolute right-1 top-1 bottom-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-xs"
            id="btn-create-folder"
          >
            {isCreatingFolder ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FolderPlus className="w-3.5 h-3.5" />
            )}
            <span>Create</span>
          </button>
        </form>
      </div>

      {/* Folders List Container */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0 bg-slate-50/20 dark:bg-slate-950/20">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Scanning folders in Google Drive...</p>
          </div>
        )}

        {error && (
          <div className="p-4 mx-2 my-2 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs rounded-xl border border-red-100 dark:border-red-900/40 font-medium">
            {error}
          </div>
        )}

        {!loading && !error && folders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Folder className="w-10 h-10 text-gray-300 dark:text-slate-700 mb-2" />
            <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">No sub-folders found</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 max-w-[240px]">
              {searchQuery ? 'Adjust your search terms.' : 'Create a new folder above if you want to organize.'}
            </p>
          </div>
        )}

        {!loading && !error && folders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1">
            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  onClick={() => onSelectFolder(folder.id, folder.name, getFullPath(folder.name))}
                  onDoubleClick={() => handleOpenFolder(folder)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none ${
                    isSelected
                      ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-400 dark:border-blue-700 shadow-sm'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-xs'
                  }`}
                  id={`folder-item-${folder.id}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className={`w-5 h-5 shrink-0 ${isSelected ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`} />
                    <span className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">{folder.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenFolder(folder);
                    }}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg text-gray-400 dark:text-gray-550 hover:text-gray-600 dark:hover:text-slate-300 transition shrink-0"
                    title="Open folder"
                    id={`btn-open-folder-${folder.id}`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / Info */}
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <p className="font-medium">
          Selected save path:{' '}
          <span className="text-blue-600 dark:text-blue-400 font-semibold truncate max-w-[200px] inline-block align-bottom">
            {selectedFolderId === 'root' ? 'My Drive (Root)' : 'Selected Sub-Folder'}
          </span>
        </p>
        <p className="text-slate-400 dark:text-slate-500 hidden sm:block">Double-click folder row to browse inside</p>
      </div>
    </div>
  );
}
