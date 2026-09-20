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
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Camera,
  ShieldCheck,
  MessageCircle,
  Zap,
} from 'lucide-react';
import { convertDocxToPdfClient } from '@/lib/client-docx-converter';

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
  onProceed?: () => void;
}

// ─── Ultra-fast, non-blocking image optimizer for mobile cameras ─────────────
// Phone cameras capture 12-48MP photos (4-12MB). Laser printers cannot resolve
// beyond ~2048px on A4. Downscaling in browser saves 95% bandwidth & prevents timeouts.
const MAX_PRINT_DIM = 2048;
const COMPRESS_THRESHOLD = 1.2 * 1024 * 1024; // 1.2 MB

async function optimizeImage(file: File): Promise<File> {
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isImage || file.size <= COMPRESS_THRESHOLD) return file;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: File) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    // Strict safety timeout (1.5s) ensures the app never hangs
    const timer = setTimeout(() => finish(file), 1500);

    const renderToCanvas = (source: CanvasImageSource, width: number, height: number) => {
      try {
        let w = width;
        let h = height;

        if (w <= MAX_PRINT_DIM && h <= MAX_PRINT_DIM) {
          clearTimeout(timer);
          finish(file);
          return;
        }

        if (w > h) {
          h = Math.round((h * MAX_PRINT_DIM) / w);
          w = MAX_PRINT_DIM;
        } else {
          w = Math.round((w * MAX_PRINT_DIM) / h);
          h = MAX_PRINT_DIM;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timer);
          finish(file);
          return;
        }

        ctx.drawImage(source, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            clearTimeout(timer);
            if (!blob) {
              finish(file);
              return;
            }
            const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            const optimized = new File([blob], cleanName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            finish(optimized);
          },
          'image/jpeg',
          0.85
        );
      } catch {
        clearTimeout(timer);
        finish(file);
      }
    };

    // Use fast native createImageBitmap (hardware decoded, off main thread)
    if (typeof createImageBitmap !== 'undefined') {
      createImageBitmap(file)
        .then((bitmap) => {
          renderToCanvas(bitmap, bitmap.width, bitmap.height);
          bitmap.close();
        })
        .catch(() => fallbackImage());
    } else {
      fallbackImage();
    }

    function fallbackImage() {
      try {
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objUrl);
          renderToCanvas(img, img.naturalWidth, img.naturalHeight);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objUrl);
          clearTimeout(timer);
          finish(file);
        };
        img.src = objUrl;
      } catch {
        clearTimeout(timer);
        finish(file);
      }
    }
  });
}

// ─── Direct Cloudflare R2 Upload (Bypasses Vercel 4.5MB Payload Limit) ───────
function uploadSingleFileToR2(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
      } else {
        reject(new Error(`Storage error (${xhr.status})`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Connection interrupted while uploading.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
    xhr.timeout = 60000;
    xhr.ontimeout = () => reject(new Error('Upload timed out. Please check your internet connection.'));

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send(file);
  });
}

// ─── Legacy Fallback Upload to /api/upload ──────────────────────────────────
function legacyUploadToServer(
  formData: FormData,
  onProgress: (pct: number) => void
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.min(75, Math.round((e.loaded / e.total) * 75));
        onProgress(pct);
      }
    });

    xhr.addEventListener('load', () => {
      onProgress(85);
      const res = new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: { 'Content-Type': 'application/json' },
      });
      resolve(res);
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

export function FileUpload({ onBatchUploaded, uploadedBatch, onProceed }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'optimizing' | 'converting-docx' | 'uploading' | 'processing' | null>(null);
  const [docxProgress, setDocxProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Local list of staged raw Files
  const [rawFiles, setRawFiles] = useState<File[]>(uploadedBatch?.rawFiles || []);
  const [prevBatch, setPrevBatch] = useState(uploadedBatch);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isAddingMoreRef = useRef(false);

  // Synchronize local rawFiles when uploadedBatch is cleared or updated
  if (prevBatch !== uploadedBatch) {
    setPrevBatch(uploadedBatch);
    setRawFiles(uploadedBatch?.rawFiles || []);
  }

  const processAndUploadFiles = async (newFileList: File[]) => {
    setErrorMessage(null);

    const validExtensions = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.webp'];
    const invalidFile = newFileList.find(
      (f) =>
        !validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)) &&
        !f.type.startsWith('image/')
    );

    if (invalidFile) {
      setErrorMessage(`"${invalidFile.name}" has an unsupported format. Supported formats: PDF, Word (.docx, .doc), and Images (PNG, JPG, WEBP).`);
      return;
    }

    if (newFileList.length > 10) {
      setErrorMessage('Maximum 10 files allowed per print job.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Step 1: Document preparation, client-side DOCX conversion & image optimization
      setUploadPhase('optimizing');
      const preparedFiles = await Promise.all(
        newFileList.map(async (f) => {
          const lowerName = f.name.toLowerCase();
          if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
            setUploadPhase('converting-docx');
            // Priority 0: High-Speed conversion via Station PC Daemon (Port 7250) if running on kiosk
            try {
              const stationRes = await fetch('http://127.0.0.1:7250/convert-docx', {
                method: 'POST',
                body: f,
                signal: AbortSignal.timeout(3500),
              });
              if (stationRes.ok) {
                const pdfBlob = await stationRes.blob();
                if (pdfBlob && pdfBlob.size > 500) {
                  const outPdfName = f.name.replace(/\.(docx|doc)$/i, '.pdf');
                  const stationPdf = new File([pdfBlob], outPdfName, { type: 'application/pdf' });
                  console.log(`[FileUpload] Converted "${f.name}" to vector PDF via local station LibreOffice (${(stationPdf.size / 1024).toFixed(1)} KB)`);
                  return stationPdf;
                }
              }
            } catch {
              // Station daemon not on local loopback, proceed to server endpoint
            }

            // Priority 1: Server-side conversion via Next.js API route (active on localhost with LibreOffice)
            try {
              const formData = new FormData();
              formData.append('file', f);
              const convRes = await fetch('/api/convert-docx', {
                method: 'POST',
                body: formData,
              });

              if (convRes.ok) {
                const pdfBlob = await convRes.blob();
                if (pdfBlob && pdfBlob.size > 500) {
                  const outPdfName = f.name.replace(/\.(docx|doc)$/i, '.pdf');
                  const serverPdf = new File([pdfBlob], outPdfName, { type: 'application/pdf' });
                  console.log(`[FileUpload] Converted "${f.name}" to vector PDF via server LibreOffice (${(serverPdf.size / 1024).toFixed(1)} KB)`);
                  return serverPdf;
                }
              }
            } catch (serverErr) {
              console.warn('[FileUpload] Server DOCX conversion failed or unavailable, falling back to browser engine:', serverErr);
            }

            // Priority 2: High-Fidelity in-browser conversion via docx-preview + html2canvas (runs on Vercel/cloud)
            try {
              const clientPdf = await convertDocxToPdfClient(f, (curr, tot) => {
                setDocxProgress({ current: curr, total: tot });
              });
              if (clientPdf && clientPdf.size > 1000) {
                console.log(`[FileUpload] Converted "${f.name}" to client-side A4 PDF (${(clientPdf.size / 1024).toFixed(1)} KB)`);
                return clientPdf;
              }
            } catch (clientErr) {
              console.warn('[FileUpload] Browser DOCX conversion fallback:', clientErr);
            }

            // Priority 3: Fallback - pass raw file along
            return f;
          }
          return optimizeImage(f);
        })
      );

      // Step 2: Try Direct-to-Cloudflare R2 upload (bypasses Vercel 4.5MB limit entirely)
      let batchResult: UploadedBatchData | null = null;
      let usedR2Direct = false;

      try {
        setUploadPhase('uploading');
        setUploadProgress(5);

        // Request presigned upload URLs from server
        const presignRes = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: preparedFiles.map((f) => ({
              name: f.name,
              size: f.size,
              type: f.type || 'application/octet-stream',
            })),
          }),
        });

        if (!presignRes.ok) {
          throw new Error('Presign endpoint returned error');
        }

        const { uploads } = await presignRes.json();

        if (uploads && Array.isArray(uploads) && uploads.length === preparedFiles.length) {
          // Track aggregate progress across all parallel uploads
          const totalBytes = preparedFiles.reduce((acc, f) => acc + f.size, 0) || 1;
          const loadedMap = new Map<number, number>();

          const updateProgress = () => {
            let sum = 0;
            loadedMap.forEach((bytes) => { sum += bytes; });
            const pct = Math.min(75, Math.max(5, Math.round((sum / totalBytes) * 75)));
            setUploadProgress(pct);
          };

          // Upload all files concurrently directly to Cloudflare R2
          await Promise.all(
            uploads.map((item, idx) =>
              uploadSingleFileToR2(
                item.uploadUrl,
                preparedFiles[idx],
                item.type,
                (loaded) => {
                  loadedMap.set(idx, loaded);
                  updateProgress();
                }
              )
            )
          );

          // Finalize on server: counts pages and merges into unified A4 print document
          setUploadPhase('processing');
          setUploadProgress(82);

          const completeRes = await fetch('/api/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              files: uploads.map((item) => ({
                id: item.id,
                key: item.key,
                name: item.name,
                size: item.size,
                type: item.type,
              })),
            }),
          });

          if (!completeRes.ok) {
            const errData = await completeRes.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to finalize uploaded documents.');
          }

          const completeData = await completeRes.json();
          batchResult = {
            fileKey: completeData.fileKey,
            fileName: completeData.fileName,
            totalPages: completeData.totalPages,
            fileSize: completeData.fileSize,
            fileCount: completeData.fileCount,
            fileItems: completeData.fileItems || [],
            downloadUrl: completeData.downloadUrl,
            rawFiles: preparedFiles,
          };
          usedR2Direct = true;
        }
      } catch (directErr) {
        if (
          directErr instanceof Error &&
          (directErr.message.toLowerCase().includes('password-protected') ||
           directErr.message.toLowerCase().includes('unsupported') ||
           directErr.message.toLowerCase().includes('corrupted'))
        ) {
          throw directErr;
        }
        console.warn('Direct R2 upload bypassed or failed; falling back to direct server route:', directErr);
      }

      // Step 3: Fallback to standard server route if direct R2 was not used
      if (!usedR2Direct || !batchResult) {
        setUploadPhase('uploading');
        const formData = new FormData();
        preparedFiles.forEach((f) => formData.append('files', f));

        const res = await legacyUploadToServer(formData, (pct) => {
          setUploadProgress(pct);
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to upload documents.');
        }

        const legacyData = await res.json();
        batchResult = {
          fileKey: legacyData.fileKey,
          fileName: legacyData.fileName,
          totalPages: legacyData.totalPages,
          fileSize: legacyData.fileSize,
          fileCount: legacyData.fileCount,
          fileItems: legacyData.fileItems || [],
          downloadUrl: legacyData.downloadUrl,
          rawFiles: preparedFiles,
        };
      }

      setUploadProgress(100);
      onBatchUploaded(batchResult);
      setRawFiles(preparedFiles);
    } catch (err: unknown) {
      console.error('Upload flow error:', err);
      const msg = err instanceof Error ? err.message : 'Upload failed. Please check your internet and try again.';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadPhase(null);
    }
  };

  const handleFilesAdded = (incomingFiles: FileList | File[], isAddMore = false) => {
    void isAddMore;
    const arr = Array.from(incomingFiles);
    if (arr.length === 0) return;

    // Preserve existing uploaded files whenever a batch is already active
    const existing = (uploadedBatch && rawFiles.length > 0)
      ? rawFiles
      : (uploadedBatch?.rawFiles || []);
    const merged = [...existing];
    for (const f of arr) {
      if (!merged.some((existingFile) => existingFile.name === f.name && existingFile.size === f.size)) {
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
      handleFilesAdded(e.dataTransfer.files, false);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesAdded(e.target.files, isAddingMoreRef.current);
    }
    isAddingMoreRef.current = false;
    e.target.value = '';
  };

  // Status message for upload modal/bars
  const statusHeadline =
    uploadPhase === 'converting-docx'
      ? `Processing Document… ${docxProgress && docxProgress.total > 1 ? `(Page ${docxProgress.current} of ${docxProgress.total})` : ''}`
      : uploadPhase === 'optimizing'
      ? 'Optimizing for Print…'
      : uploadPhase === 'processing'
      ? 'Preparing Print Documents…'
      : uploadProgress > 0 && uploadProgress < 100
      ? `Uploading Files… ${uploadProgress}%`
      : 'Uploading Files…';

  const statusSubtext =
    uploadPhase === 'converting-docx'
      ? 'Formatting typography, margins and high-resolution layout'
      : uploadPhase === 'optimizing'
      ? 'Enhancing resolution and color balance for standard A4'
      : uploadPhase === 'processing'
      ? 'Organizing pages and preparing document preview'
      : 'Securely uploading your files for printing';

  // If one or more files are uploaded
  if (uploadedBatch && uploadedBatch.fileItems && uploadedBatch.fileItems.length > 0) {
    return (
      <div className="space-y-3">
        {/* Uploaded Files Queue Card matching Image 1 */}
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#08080a]/90 backdrop-blur-xl p-4 divide-y divide-zinc-100 dark:divide-white/[0.06] shadow-xs">
          {/* Queue Header */}
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {uploadedBatch.fileCount} Document{uploadedBatch.fileCount > 1 ? 's' : ''} Uploaded
              </span>
            </div>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20 font-mono">
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
                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-zinc-200/80 dark:bg-white/[0.06] border border-zinc-300/60 dark:border-white/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0">
                      {isImg ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[220px] sm:max-w-[380px] md:max-w-[520px] lg:max-w-[700px]" title={item.name}>
                        {item.name}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        <span className="text-zinc-700 dark:text-zinc-300 font-semibold">{item.pages} page{item.pages > 1 ? 's' : ''}</span> • {(item.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add more files footer action */}
          <div className="pt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label
                className="relative inline-flex items-center space-x-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] py-1.5 px-3 rounded-lg bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 transition-all cursor-pointer overflow-hidden touch-manipulation active:scale-95"
              >
                <input
                  type="file"
                  multiple
                  accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/*,.pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    isAddingMoreRef.current = true;
                    handleInputChange(e);
                  }}
                  disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 touch-manipulation"
                  aria-label="Add More Files"
                />
                <Plus className="w-3.5 h-3.5" />
                <span>Add Files</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  isAddingMoreRef.current = true;
                  cameraInputRef.current?.click();
                }}
                disabled={isUploading}
                className="inline-flex items-center space-x-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 py-1.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 transition-all cursor-pointer touch-manipulation active:scale-95"
                title="Scan next page with phone camera"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan Page</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setRawFiles([]);
                onBatchUploaded(null);
              }}
              className="text-xs text-zinc-500 hover:text-rose-500 transition-colors cursor-pointer"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Hidden Camera Input for direct mobile camera shutter */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleInputChange}
          className="hidden"
          aria-label="Capture with Camera"
        />

        {/* Standby File Input for programmatic clicks */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/*,.pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
          onChange={handleInputChange}
          className="hidden"
        />

        {isUploading && (
          <div className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white/80 dark:bg-[#0a0a0d] backdrop-blur-xl p-3.5 space-y-2.5 shadow-xs">
            <div className="flex items-center space-x-2 text-xs text-zinc-800 dark:text-zinc-200">
              <Loader2 className="w-4 h-4 animate-spin shrink-0 text-zinc-900 dark:text-white" />
              <span className="font-medium">{statusHeadline}</span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-white/[0.08] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-zinc-900 dark:bg-gradient-to-r dark:from-zinc-300 dark:via-white dark:to-zinc-100 h-1.5 transition-all duration-200 rounded-full dark:shadow-[0_0_10px_rgba(255,255,255,0.7)]"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center justify-between p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800/40 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => processAndUploadFiles(rawFiles)}
              className="inline-flex items-center gap-1 font-semibold text-rose-800 dark:text-rose-200 hover:underline shrink-0 ml-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  // Initial Upload Box with Qronos Glassmorphism
  return (
    <div className="space-y-2.5">
      {/* Ultra-Compact WhatsApp Ingestion Bar */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.10] backdrop-blur-xl transition-all shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-8 h-8 rounded-xl overflow-hidden border border-emerald-500/30 shrink-0 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/whatsapp_official_dp.jpg"
              alt="PrintKurox Bot"
              className="w-full h-full object-cover"
            />
            <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border border-black" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
              <span>Print via WhatsApp</span>
              <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">· Fast</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 whitespace-nowrap">
              <span className="inline-flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200">
                <FileText className="w-3 h-3 text-red-500 shrink-0" />
                <span>PDF</span>
              </span>
              <span className="text-zinc-300 dark:text-zinc-600 select-none">•</span>
              <span className="inline-flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200">
                <FileText className="w-3 h-3 text-blue-500 shrink-0" />
                <span>Word</span>
              </span>
              <span className="text-zinc-300 dark:text-zinc-600 select-none">•</span>
              <span className="inline-flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200">
                <Camera className="w-3 h-3 text-sky-500 shrink-0" />
                <span>Photos</span>
              </span>
              <span className="text-zinc-300 dark:text-zinc-600 select-none">•</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <Zap className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500 shrink-0" />
                <span>Instant</span>
              </span>
            </div>
          </div>
        </div>

        <a
          href="https://wa.me/919362980761?text=Hi%20PrintKurox%2C%20I%20want%20to%20print%20a%20document"
          target="_blank"
          rel="noreferrer"
          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-all hover:scale-[1.02] active:scale-95 shrink-0"
        >
          <MessageCircle className="w-3.5 h-3.5 fill-white" />
          <span>Open Chat</span>
        </a>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-2xl p-7 sm:p-9 flex flex-col items-center justify-center text-center transition-all relative overflow-hidden backdrop-blur-xl group touch-manipulation ${
          isUploading
            ? 'border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.02] cursor-default'
            : isDragging
            ? 'border-2 border-dashed border-emerald-500 bg-emerald-500/10 dark:border-emerald-400 dark:bg-emerald-950/20 cursor-pointer shadow-lg'
            : 'border-2 border-dashed border-zinc-300 hover:border-zinc-400 dark:border-white/15 hover:dark:border-white/30 bg-zinc-50/50 hover:bg-zinc-100/70 dark:bg-white/[0.02] hover:dark:bg-white/[0.04] shadow-xs cursor-pointer'
        }`}
      >
        {/* Hidden Camera Input for direct phone camera shutter */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleInputChange}
          className="hidden"
          aria-label="Scan with camera"
        />

        {/* Full-bleed overlay input for zero-lag native mobile and desktop tap */}
        {!isUploading && (
          <input
            id="initial-file-upload-input"
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/*,.pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
            onChange={handleInputChange}
            aria-label="Select PDF, Word, or Photos"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 touch-manipulation"
          />
        )}

        {isUploading ? (
          <div className="flex flex-col items-center py-3 space-y-3.5 w-full max-w-[280px]">
            {/* Spinning Indicator with specular ring */}
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_16px_rgba(0,0,0,0.4)]">
              <Loader2 className="w-6 h-6 text-zinc-900 dark:text-white animate-spin" />
            </div>

            {/* Active file badge if available */}
            {rawFiles.length > 0 && (
              <div className="text-[11px] font-mono text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/[0.06] px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-white/10 truncate max-w-[260px]">
                {rawFiles[0].name} {rawFiles.length > 1 ? `(+${rawFiles.length - 1} more)` : ''}
              </div>
            )}

            <div className="text-center">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {statusHeadline}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {statusSubtext}
              </p>
            </div>

            {/* Structured Progress Bar */}
            <div className="w-full space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-500 dark:text-zinc-400">Upload progress</span>
                <span className="font-semibold text-zinc-900 dark:text-white">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-white/[0.08] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-zinc-900 dark:bg-gradient-to-r dark:from-zinc-300 dark:via-white dark:to-zinc-100 h-1.5 transition-all duration-200 rounded-full dark:shadow-[0_0_12px_rgba(255,255,255,0.8)]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Icon Container - Stealth Frosted Glass */}
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-800 dark:text-zinc-200 mb-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_12px_rgba(0,0,0,0.25)] group-hover:scale-105 group-hover:border-zinc-400 dark:group-hover:border-white/25 transition-all">
              <UploadCloud className="w-6 h-6 text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
            </div>

            {/* Single Professional Action Button */}
            <div className="relative z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 text-xs sm:text-sm font-semibold shadow-md shadow-black/15 dark:shadow-white/10 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                <span>Upload Files</span>
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-3 font-normal">
              or drag &amp; drop files anywhere here
            </p>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 font-medium flex-wrap">
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3 h-3 text-red-500" />
                <span>PDF</span>
              </span>
              <span className="text-zinc-300 dark:text-zinc-700 select-none">•</span>
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3 h-3 text-blue-500" />
                <span>Word (.docx)</span>
              </span>
              <span className="text-zinc-300 dark:text-zinc-700 select-none">•</span>
              <span className="inline-flex items-center gap-1">
                <Camera className="w-3 h-3 text-sky-500" />
                <span>Photos</span>
              </span>
              <span className="text-zinc-300 dark:text-zinc-700 select-none">•</span>
              <span className="text-zinc-400 dark:text-zinc-500 font-normal">A4 standard · Up to 10 files</span>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 text-[11px] text-zinc-500 dark:text-zinc-400 pt-0.5 font-medium">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Automatic A4 sizing</span>
        </span>
        <span className="text-zinc-300 dark:text-zinc-700 select-none">•</span>
        <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Encrypted &amp; private · Files deleted after printing</span>
        </span>
      </div>

      {errorMessage && (
        <div className="flex items-center justify-between p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800/40 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          {rawFiles.length > 0 && (
            <button
              type="button"
              onClick={() => processAndUploadFiles(rawFiles)}
              className="inline-flex items-center gap-1 font-semibold text-rose-800 dark:text-rose-200 hover:underline shrink-0 ml-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
