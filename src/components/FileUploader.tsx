/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FileText, X, AlertCircle } from 'lucide-react';
import { UploadedFile } from '../types';

interface FileUploaderProps {
  onFilesParsed: (files: UploadedFile[]) => void;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
}

export default function FileUploader({ onFilesParsed, uploadedFiles, onRemoveFile, onClearAll }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    const files = Array.from(e.dataTransfer.files) as File[];
    processFiles(files);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      processFiles(files);
      // Reset input value to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const processFiles = (files: File[]) => {
    const mdFiles = files.filter(f => f.name.endsWith('.md') || f.name.endsWith('.txt'));
    
    if (mdFiles.length === 0) {
      setError('Please select valid Markdown (.md) or Text (.txt) files.');
      return;
    }

    if (mdFiles.length < files.length) {
      setError('Only .md and .txt files are supported. Some files were skipped.');
    }

    const promises = mdFiles.map(file => {
      return new Promise<UploadedFile>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            name: file.name,
            content: e.target?.result as string || '',
            size: file.size,
            status: 'pending',
          });
        };
        reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
        reader.readAsText(file);
      });
    });

    Promise.all(promises)
      .then(newParsedFiles => {
        onFilesParsed(newParsedFiles);
      })
      .catch(err => {
        console.error(err);
        setError('An error occurred while reading your files. Please try again.');
      });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl flex flex-col gap-5 shadow-sm transition-colors duration-200" id="file-uploader-panel">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 scale-[0.99]'
            : 'border-slate-300 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/10'
        }`}
        id="drag-drop-zone"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".md,.txt"
          multiple
          className="hidden"
          id="file-input-element"
        />
        
        <div className={`p-4 rounded-full mb-4 transition-colors ${isDragging ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base">Upload Markdown Files</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Drag & drop your .md files here, or click to browse</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-semibold" id="upload-error-indicator">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <p>{error}</p>
        </div>
      )}

      {/* Uploaded Files Queue */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-col gap-2.5 mt-1" id="uploaded-files-queue">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-bold text-gray-500 dark:text-gray-400">
              Files to convert ({uploadedFiles.length})
            </span>
            <button
              onClick={onClearAll}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold transition cursor-pointer select-none"
              id="btn-clear-all-queue"
            >
              Clear All
            </button>
          </div>

          <div className="max-h-[220px] overflow-y-auto flex flex-col gap-2 pr-0.5">
            {uploadedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 hover:bg-slate-150/40 dark:hover:bg-slate-900 transition"
                id={`queue-item-${idx}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-slate-250 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">{formatSize(file.size)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Status pills */}
                  {file.status === 'converting' && (
                    <span className="text-[10px] bg-yellow-50 dark:bg-yellow-950/35 text-yellow-600 dark:text-yellow-400 border border-yellow-100 dark:border-yellow-905/30 px-2 py-0.5 rounded-full font-bold animate-pulse">
                      Converting...
                    </span>
                  )}
                  {file.status === 'success' && (
                    <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/35 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 px-2 py-0.5 rounded-full font-bold">
                      Saved to Drive
                    </span>
                  )}
                  {file.status === 'failed' && (
                    <span className="text-[10px] bg-red-50 dark:bg-red-950/35 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 px-2 py-0.5 rounded-full font-bold" title={file.error}>
                      Failed
                    </span>
                  )}

                  <button
                    onClick={() => onRemoveFile(idx)}
                    className="p-1 hover:bg-gray-200/60 dark:hover:bg-slate-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-slate-350 rounded-lg transition"
                    title="Remove file"
                    id={`btn-remove-file-${idx}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
