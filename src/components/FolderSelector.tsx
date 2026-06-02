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
}

export default function FolderSelector({ accessToken, onSelectFolder, selectedFolderId }: FolderSelectorProps) {
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
        query += ` and name contains '${searchQuery.replace(/'/g, "\\'")}'`;
      } else {
        query += ` and '${currentFolder.id}' in parents`;
      }

      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        query
      )}&fields=files(id,name,parents)&orderBy=name&pageSize=50`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

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
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[400px]" id="folder-selector">
      {/* Header with quick breadcrumbs */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center text-sm text-slate-600 gap-1 flex-wrap">
          <Home className="w-4 h-4 text-slate-400" />
          {pathStack.map((folder, index) => (
            <div key={folder.id} className="flex items-center">
              {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 mx-0.5" />}
              <button
                onClick={() => handleNavigateToBreadcrumb(index)}
                className={`hover:text-blue-600 font-semibold transition ${
                  index === pathStack.length - 1 ? 'text-slate-900 font-bold' : 'text-slate-500'
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
          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          title="Refresh folders"
          id="btn-refresh-folders"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
        </button>
      </div>

      {/* Search and Quick folder creation inputs */}
      <div className="p-3 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-2 bg-white">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-xl border border-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 placeholder:text-slate-400"
            id="search-folders-input"
          />
        </div>

        {/* Quick Folder Creation */}
        <form onSubmit={handleCreateFolder} className="flex gap-2">
          <input
            type="text"
            placeholder="New folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 placeholder:text-slate-400"
            disabled={isCreatingFolder}
            id="new-folder-name"
          />
          <button
            type="submit"
            disabled={isCreatingFolder || !newFolderName.trim()}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 rounded-xl flex items-center gap-1 cursor-pointer transition shrink-0 shadow-xs"
            id="btn-create-folder"
          >
            {isCreatingFolder ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FolderPlus className="w-3.5 h-3.5" />
            )}
            Create
          </button>
        </form>
      </div>

      {/* Folders List Container */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0 bg-slate-50/20">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs text-gray-500 font-medium">Scanning folders in Google Drive...</p>
          </div>
        )}

        {error && (
          <div className="p-4 mx-2 my-2 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100 font-medium">
            {error}
          </div>
        )}

        {!loading && !error && folders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Folder className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500 font-medium">No sub-folders found</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[240px]">
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
                      ? 'bg-blue-50/40 border-blue-400 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-xs'
                  }`}
                  id={`folder-item-${folder.id}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className={`w-5 h-5 shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />
                    <span className="text-xs font-semibold text-gray-800 truncate">{folder.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenFolder(folder);
                    }}
                    className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition shrink-0"
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
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
        <p className="font-medium">
          Selected save path:{' '}
          <span className="text-blue-600 font-semibold truncate max-w-[200px] inline-block align-bottom">
            {selectedFolderId === 'root' ? 'My Drive (Root)' : 'Selected Sub-Folder'}
          </span>
        </p>
        <p className="text-gray-400 hidden sm:block">Double-click folder row to browse inside</p>
      </div>
    </div>
  );
}
