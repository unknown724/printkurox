'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Loader2, FileText } from 'lucide-react';
import { PageConfig } from '@/lib/pricing';

interface SimplePagePreviewProps {
  totalPages: number;
  fileKey?: string;
  downloadUrl?: string;
  rawFiles?: File[];
  pageConfigs: PageConfig[];
  colorMode: 'bw' | 'color' | 'custom';
}

export function SimplePagePreview({
  totalPages,
  fileKey,
  downloadUrl,
  rawFiles,
  pageConfigs,
  colorMode,
}: SimplePagePreviewProps) {
  const selectedPages = pageConfigs.length > 0
    ? pageConfigs.filter((p) => p.included).map((p) => p.pageNumber)
    : Array.from({ length: totalPages }, (_, i) => i + 1);

  const [cursor, setCursor] = useState(0);
  const safeCursor = Math.min(cursor, Math.max(0, selectedPages.length - 1));
  const activePageNum = selectedPages[safeCursor] || 1;
  const activePageCfg = pageConfigs.find((p) => p.pageNumber === activePageNum);
  const isBwPage =
    colorMode === 'bw' || (colorMode === 'custom' && activePageCfg?.colorMode === 'bw');

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const cacheRef = useRef<Map<number, string>>(new Map());
  const pdfDocRef = useRef<{ numPages: number; getPage: (n: number) => Promise<any>; destroy: () => Promise<void> } | null>(null);
  const imagePagesRef = useRef<Map<number, string>>(new Map());
  const sourceSigRef = useRef('');

  const sourceSig = `${fileKey || ''}|${downloadUrl || ''}|${totalPages}|${rawFiles?.map((f) => `${f.name}:${f.size}`).join(',') || ''}`;

  // Clean up cached blob URLs when document changes or unmounts
  useEffect(() => {
    return () => {
      cacheRef.current.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      cacheRef.current.clear();
      imagePagesRef.current.clear();
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => {});
        pdfDocRef.current = null;
      }
    };
  }, [sourceSig]);

  // Render only the currently visible page (cached in memory per source)
  useEffect(() => {
    let cancelled = false;

    if (sourceSigRef.current !== sourceSig) {
      cacheRef.current.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      cacheRef.current.clear();
      imagePagesRef.current.clear();
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => {});
        pdfDocRef.current = null;
      }
      sourceSigRef.current = sourceSig;
    }

    async function renderActivePage() {
      const cached = cacheRef.current.get(activePageNum);
      if (cached) {
        if (!cancelled) {
          setPreviewSrc(cached);
          setIsLoading(false);
        }
        return;
      }

      if (!cancelled) setIsLoading(true);

      try {
        // Fast path 1: Local raw image/PDF files uploaded in browser
        const canPreviewLocal =
          rawFiles &&
          rawFiles.length > 0 &&
          rawFiles.every(
            (f) =>
              f.name.toLowerCase().endsWith('.pdf') ||
              f.type.includes('pdf') ||
              f.type.startsWith('image/') ||
              /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)
          );

        if (canPreviewLocal && rawFiles) {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

          let pageOffset = 1;
          for (const file of rawFiles) {
            if (cancelled) return;
            const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');
            if (isPdf) {
              const buf = await file.arrayBuffer();
              const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
              const endOffset = pageOffset + pdf.numPages - 1;
              if (activePageNum >= pageOffset && activePageNum <= endOffset) {
                const page = await pdf.getPage(activePageNum - pageOffset + 1);
                const viewport = page.getViewport({ scale: 1.25 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  await page.render({ canvasContext: ctx, viewport }).promise;
                  const blob = await new Promise<Blob | null>((res) =>
                    canvas.toBlob(res, 'image/jpeg', 0.88)
                  );
                  canvas.width = 0;
                  canvas.height = 0;
                  page.cleanup();
                  await pdf.destroy();
                  if (blob && !cancelled) {
                    const url = URL.createObjectURL(blob);
                    cacheRef.current.set(activePageNum, url);
                    setPreviewSrc(url);
                    setIsLoading(false);
                  }
                  return;
                }
              }
              pageOffset += pdf.numPages;
              await pdf.destroy();
            } else {
              if (activePageNum === pageOffset) {
                const url = URL.createObjectURL(file);
                cacheRef.current.set(activePageNum, url);
                if (!cancelled) {
                  setPreviewSrc(url);
                  setIsLoading(false);
                }
                return;
              }
              pageOffset += 1;
            }
          }
        }

        // Fast path 2: Server-converted PDF (/api/view-file or downloadUrl) cached in pdfDocRef
        if (!pdfDocRef.current) {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
          const targetUrl = fileKey ? `/api/view-file?key=${encodeURIComponent(fileKey)}` : downloadUrl;
          if (targetUrl) {
            const res = await fetch(targetUrl);
            if (res.ok) {
              const buf = await res.arrayBuffer();
              if (buf.byteLength > 0 && !cancelled) {
                pdfDocRef.current = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
              }
            }
          }
        }

        if (pdfDocRef.current && !cancelled) {
          const boundedPage = Math.min(Math.max(1, activePageNum), pdfDocRef.current.numPages);
          const page = await pdfDocRef.current.getPage(boundedPage);
          const viewport = page.getViewport({ scale: 1.25 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            const blob = await new Promise<Blob | null>((res) =>
              canvas.toBlob(res, 'image/jpeg', 0.88)
            );
            canvas.width = 0;
            canvas.height = 0;
            page.cleanup();
            if (blob && !cancelled) {
              const url = URL.createObjectURL(blob);
              cacheRef.current.set(activePageNum, url);
              setPreviewSrc(url);
              setIsLoading(false);
            }
            return;
          }
        }
      } catch (err) {
        console.warn('SimplePagePreview render error:', err);
      }

      if (!cancelled) {
        setPreviewSrc(null);
        setIsLoading(false);
      }
    }

    queueMicrotask(() => {
      void renderActivePage();
    });

    return () => {
      cancelled = true;
    };
  }, [activePageNum, sourceSig, fileKey, downloadUrl, rawFiles]);

  if (selectedPages.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50/90 dark:bg-[#111116] p-3 space-y-2.5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          <Eye className="w-3.5 h-3.5 text-amber-500" />
          <span>Print Preview</span>
          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
            · Page {activePageNum}
          </span>
        </div>

        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
            isBwPage
              ? 'bg-zinc-200/80 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-white/15'
              : 'bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30'
          }`}
        >
          {isBwPage ? 'B&W Preview' : 'Color Preview'}
        </span>
      </div>

      {/* Preview Sheet Canvas */}
      <div className="relative w-full h-56 sm:h-64 rounded-xl border border-zinc-200/90 dark:border-white/10 bg-zinc-200/60 dark:bg-black/50 flex items-center justify-center overflow-hidden p-2">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            <span className="text-[11px] font-medium">Rendering page {activePageNum}…</span>
          </div>
        ) : previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc}
            alt={`Page ${activePageNum} preview`}
            className={`max-h-full max-w-full object-contain rounded-md bg-white shadow-md transition-all duration-200 ${
              isBwPage ? 'grayscale contrast-110' : ''
            }`}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-zinc-500 dark:text-zinc-400 text-xs">
            <FileText className="w-6 h-6 opacity-60" />
            <span>Preview ready on print</span>
          </div>
        )}
      </div>

      {/* Pager when more than 1 page is selected */}
      {selectedPages.length > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={safeCursor <= 0}
            onClick={() => setCursor((c) => Math.max(0, c - 1))}
            className="h-7 px-2.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.05] hover:bg-zinc-100 dark:hover:bg-white/[0.1] disabled:opacity-35 text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
            {safeCursor + 1} / {selectedPages.length} selected
          </span>

          <button
            type="button"
            disabled={safeCursor >= selectedPages.length - 1}
            onClick={() => setCursor((c) => Math.min(selectedPages.length - 1, c + 1))}
            className="h-7 px-2.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.05] hover:bg-zinc-100 dark:hover:bg-white/[0.1] disabled:opacity-35 text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
