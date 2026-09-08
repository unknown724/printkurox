'use client';

import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  File,
  Image as ImageIcon,
} from 'lucide-react';

export interface FileItem {
  id: string;
  name: string;
  size: number;
  pages: number;
  type: string;
}

export interface UploadedBatchData {
  fileKey: string;
  fileName: string;
  totalPages: number;
  fileSize: number;
  fileCount: number;
  fileItems: FileItem[];
  downloadUrl: string;
  rawFiles?: File[];
}

interface FileUploadProps {
  onBatchUploaded: (data: UploadedBatchData | null) => void;
  uploadedBatch: UploadedBatchData | null;
}

// ─── Direct XHR upload with accurate multi-phase progress ──────────────────
function xhrUpload(
  formData: FormData,
  onProgress: (pct: number, phase: 'uploading' | 'processing') => void,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        // Map upload bytes to 0–75% of progress
        const pct = Math.min(75, Math.round((e.loaded / e.total) * 75));
        onProgress(pct, 'uploading');
      }
    });

    // When all bytes are uploaded from device
    xhr.upload.addEventListener('load', () => {
      onProgress(80, 'processing');
    });

    xhr.addEventListener('load', () => {
      onProgress(100, 'processing');
      const response = new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: { 'Content-Type': 'application/json' },
      });
      resolve(response);
    });

    xhr.addEventListener('error', () => reject(new Error('Network connection error. Please check your internet.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
    xhr.timeout = 45000;
    xhr.ontimeout = () => reject(new Error('Upload timed out. Please try again.'));

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export function FileUpload({ onBatchUploaded, uploadedBatch }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'processing' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Local list of staged raw Files
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processAndUploadFiles = async (newFileList: File[]) => {
    setErrorMessage(null);

    const validExtensions = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.webp'];
    const invalidFile = newFileList.find(
      (f) => !validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
    );

    if (invalidFile) {
      setErrorMessage(`"${invalidFile.name}" has an unsupported format. Supported: PDF, DOCX, PNG, JPG`);
      return;
    }

    if (newFileList.length > 10) {
      setErrorMessage('Maximum 10 files allowed per print job.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadPhase('uploading');

    try {
      // Direct stream to server (zero client-side canvas delay / zero mobile RAM crash)
      const formData = new FormData();
      newFileList.forEach((f) => formData.append('files', f));

      const res = await xhrUpload(formData, (pct, phase) => {
        setUploadProgress(pct);
        setUploadPhase(phase);
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload documents.');
      }

      const result = await res.json();
      setUploadProgress(100);

      onBatchUploaded({
        fileKey: result.fileKey,
        fileName: result.fileName,
        totalPages: result.totalPages,
        fileSize: result.fileSize,
        fileCount: result.fileCount,
        fileItems: result.fileItems || [],
        downloadUrl: result.downloadUrl,
        rawFiles: newFileList, // keep original files for progressive instant thumbnails
      });

      setRawFiles(newFileList);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadPhase(null);
    }
  };

  const handleFilesAdded = (incomingFiles: FileList | File[]) => {
    const arr = Array.from(incomingFiles);
    if (arr.length === 0) return;

    // Merge with existing raw files, avoiding duplicate names
    const merged = [...rawFiles];
    for (const f of arr) {
      if (!merged.some((existing) => existing.name === f.name && existing.size === f.size)) {
        merged.push(f);
      }
    }
    processAndUploadFiles(merged);
  };

  const handleRemoveFile = (indexToRemove: number) => {
    const updated = rawFiles.filter((_, idx) => idx !== indexToRemove);
    if (updated.length === 0) {
      setRawFiles([]);
      onBatchUploaded(null);
    } else {
      processAndUploadFiles(updated);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesAdded(e.target.files);
    }
    // reset input value so re-selecting same file triggers change
    e.target.value = '';
  };

  // Phase label for the upload UI
  const phaseLabel = uploadPhase === 'compressing'
    ? compressingStatus
    : uploadPhase === 'processing'
    ? 'Processing on server...'
    : `Uploading… ${uploadProgress}%`;

  // If one or more files are uploaded
  if (uploadedBatch && uploadedBatch.fileItems && uploadedBatch.fileItems.length > 0) {
    return (
      <div className="space-y-3">
        {/* Uploaded Files Queue Card */}
        <div className="glass-card rounded-2xl p-4 border-indigo-500/20 divide-y divide-slate-200 dark:divide-white/5">
          {/* Queue Header */}
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                {uploadedBatch.fileCount} Document{uploadedBatch.fileCount > 1 ? 's' : ''} Uploaded
              </span>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-300/60 dark:border-emerald-500/20">
              Total: {uploadedBatch.totalPages} Page{uploadedBatch.totalPages > 1 ? 's' : ''}
            </span>
          </div>

          {/* Files List */}
          <div className="py-2 space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
            {uploadedBatch.fileItems.map((item, idx) => {
              const isImg = item.name.match(/\.(png|jpe?g|webp)$/i);
              return (
                <div
                  key={item.id || idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                      {isImg ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-[260px]">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="text-indigo-600 dark:text-indigo-300 font-semibold">{item.pages} page{item.pages > 1 ? 's' : ''}</span> • {(item.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add more files footer action */}
          <div className="pt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 py-1.5 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add More Files</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRawFiles([]);
                onBatchUploaded(null);
              }}
              className="text-xs text-slate-500 hover:text-rose-500 transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
          onChange={handleInputChange}
          className="hidden"
        />

        {isUploading && (
          <div className="glass-card rounded-xl p-3 space-y-2">
            <div className="flex items-center space-x-2 text-xs text-indigo-600 dark:text-indigo-300">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="font-medium">
                {uploadPhase === 'processing' ? 'Processing & preparing documents…' : `Uploading files… ${uploadProgress}%`}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-600 dark:bg-indigo-500 h-1.5 transition-all duration-200 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800/40 rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    );
  }

  // Initial Empty Upload Box
  return (
    <div className="space-y-2">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`glass-card glass-card-hover rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer border-2 border-dashed transition-all relative overflow-hidden ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-slate-300 hover:border-indigo-500/60 hover:bg-slate-100/50 dark:border-white/10 dark:hover:border-indigo-500/50 dark:hover:bg-slate-900/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
          onChange={handleInputChange}
          className="hidden"
        />

        {isUploading ? (
          <div className="flex flex-col items-center py-4 space-y-3 w-full max-w-[240px]">
            <Loader2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {uploadPhase === 'processing' ? 'Processing on Server…' : `Uploading Files… ${uploadProgress}%`}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {uploadPhase === 'processing'
                  ? 'Merging documents & generating print layouts'
                  : 'Sending files securely to kiosk'}
              </p>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-600 dark:bg-indigo-500 h-1.5 transition-all duration-200 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-[11px] font-mono font-semibold text-indigo-600 dark:text-indigo-400">{uploadProgress}%</p>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3 shadow-inner">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              Tap to Upload Document(s)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select one or <span className="text-indigo-600 dark:text-indigo-400 font-semibold">multiple files</span> at once
            </p>
            <div className="flex items-center gap-1.5 mt-3 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-full border border-slate-200 dark:border-white/5">
              <span>PDF</span>
              <span>•</span>
              <span>DOCX</span>
              <span>•</span>
              <span>PNG / JPG</span>
              <span>•</span>
              <span>Up to 10 files</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-0.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
        <span>256-Bit TLS Secured • Ephemeral Storage (Auto-purged in 15 mins)</span>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800/40 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
