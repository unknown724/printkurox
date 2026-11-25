'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  FileText,
  Maximize2,
  X,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { PageConfig } from '@/lib/pricing';

interface PdfPageViewport {
  width: number;
  height: number;
}

interface PdfPageLike {
  getViewport: (opts: { scale: number }) => PdfPageViewport;
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfPageViewport }) => { promise: Promise<void> };
  cleanup: () => void;
}

interface PdfDocumentLike {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
  destroy: () => Promise<void>;
}

interface SimplePagePreviewProps {
  totalPages: number;
  fileKey?: string;
  downloadUrl?: string;
  rawFiles?: File[];
  pageConfigs: PageConfig[];
  onPageConfigsChange?: (updated: PageConfig[]) => void;
  colorMode: 'bw' | 'color' | 'custom';
}

async function renderPdfPageToUrl(page: PdfPageLike, scale = 1.25): Promise<string | null> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.88));
  canvas.width = 0;
  canvas.height = 0;
  page.cleanup();
  return blob ? URL.createObjectURL(blob) : null;
}

function canUseLocalFiles(rawFiles?: File[]): boolean {
  return Boolean(
    rawFiles &&
      rawFiles.length > 0 &&
      rawFiles.every(
        (f) =>
          f.name.toLowerCase().endsWith('.pdf') ||
          f.type.includes('pdf') ||
          f.type.startsWith('image/') ||
          /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)
      )
  );
}

export function SimplePagePreview({
  totalPages,
  fileKey,
  downloadUrl,
  rawFiles,
  pageConfigs,
  onPageConfigsChange,
  colorMode,
}: SimplePagePreviewProps) {
  const effectiveConfigs: PageConfig[] =
    pageConfigs.length > 0
      ? pageConfigs
      : Array.from({ length: totalPages }, (_, i) => ({
          pageNumber: i + 1,
          colorMode: colorMode === 'color' ? 'color' : 'bw',
          included: true,
        }));

  const selectedPages = effectiveConfigs.filter((p) => p.included).map((p) => p.pageNumber);
  const deletedCount = Math.max(0, effectiveConfigs.length - selectedPages.length);

  const [cursor, setCursor] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);

  const safeCursor = Math.min(cursor, Math.max(0, selectedPages.length - 1));
  const activePageNum = selectedPages[safeCursor] || 1;
  const activePageCfg = effectiveConfigs.find((p) => p.pageNumber === activePageNum);
  const isPageBw = (cfg?: PageConfig) =>
    colorMode === 'bw' || (colorMode === 'custom' && cfg?.colorMode === 'bw');

  const cacheRef = useRef<Map<number, string>>(new Map());
  const pdfDocRef = useRef<PdfDocumentLike | null>(null);
  const sourceSigRef = useRef('');

  const sourceSig = `${fileKey || ''}|${downloadUrl || ''}|${totalPages}|${
    rawFiles?.map((f) => `${f.name}:${f.size}`).join(',') || ''
  }`;

  const storeThumbUrl = (pageNumber: number, url: string) => {
    cacheRef.current.set(pageNumber, url);
    setThumbs((prev) => (prev[pageNumber] === url ? prev : { ...prev, [pageNumber]: url }));
  };

  // Cleanup cached object URLs on source change or unmount
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      cache.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      cache.clear();
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => {});
        pdfDocRef.current = null;
      }
      queueMicrotask(() => setThumbs({}));
    };
  }, [sourceSig]);

  // Close maximized gallery on Escape key
  useEffect(() => {
    if (!isMaximized) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMaximized(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMaximized]);

  // Helper to resolve server PDF document once
  const ensureServerPdf = async (): Promise<PdfDocumentLike | null> => {
    if (pdfDocRef.current) return pdfDocRef.current;
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    const targetUrl = fileKey ? `/api/view-file?key=${encodeURIComponent(fileKey)}` : downloadUrl;
    if (!targetUrl) return null;
    const res = await fetch(targetUrl);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    const doc = (await pdfjsLib.getDocument({ data: buf.slice(0) }).promise) as unknown as PdfDocumentLike;
    pdfDocRef.current = doc;
    return doc;
  };

  // Render active inline page
  useEffect(() => {
    let cancelled = false;

    if (sourceSigRef.current !== sourceSig) {
      cacheRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      cacheRef.current.clear();
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => {});
        pdfDocRef.current = null;
      }
      sourceSigRef.current = sourceSig;
    }

    async function renderActive() {
      const cached = cacheRef.current.get(activePageNum);
      if (cached) {
        if (!cancelled) setLoadingPage(false);
        return;
      }
      if (!cancelled) setLoadingPage(true);

      try {
        if (canUseLocalFiles(rawFiles) && rawFiles) {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

          let pageOffset = 1;
          for (const file of rawFiles) {
            if (cancelled) return;
            const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');
            if (isPdf) {
              const buf = await file.arrayBuffer();
              const pdf = (await pdfjsLib.getDocument({ data: buf.slice(0) }).promise) as unknown as PdfDocumentLike;
              const endOffset = pageOffset + pdf.numPages - 1;
              if (activePageNum >= pageOffset && activePageNum <= endOffset) {
                const page = await pdf.getPage(activePageNum - pageOffset + 1);
                const url = await renderPdfPageToUrl(page, 1.25);
                await pdf.destroy();
                if (url && !cancelled) storeThumbUrl(activePageNum, url);
                if (!cancelled) setLoadingPage(false);
                return;
              }
              pageOffset += pdf.numPages;
              await pdf.destroy();
            } else {
              if (activePageNum === pageOffset) {
                const url = URL.createObjectURL(file);
                if (!cancelled) {
                  storeThumbUrl(activePageNum, url);
                  setLoadingPage(false);
                }
                return;
              }
              pageOffset += 1;
            }
          }
        }

        const doc = await ensureServerPdf();
        if (doc && !cancelled) {
          const boundedPage = Math.min(Math.max(1, activePageNum), doc.numPages);
          const page = await doc.getPage(boundedPage);
          const url = await renderPdfPageToUrl(page, 1.25);
          if (url && !cancelled) storeThumbUrl(activePageNum, url);
        }
      } catch (err) {
        console.warn('SimplePagePreview render error:', err);
      }

      if (!cancelled) setLoadingPage(false);
    }

    queueMicrotask(() => {
      void renderActive();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageNum, sourceSig]);

  // Progressive render of ALL pages when Maximized gallery is opened
  useEffect(() => {
    if (!isMaximized) return;
    let cancelled = false;

    async function renderAllPages() {
      const missingCount = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
        (p) => !cacheRef.current.has(p)
      ).length;
      if (missingCount === 0) return;

      if (!cancelled) setLoadingAll(true);
      try {
        if (canUseLocalFiles(rawFiles) && rawFiles) {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

          let currentPage = 1;
          for (const file of rawFiles) {
            if (cancelled || currentPage > totalPages) break;
            const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');
            if (isPdf) {
              const buf = await file.arrayBuffer();
              const pdf = (await pdfjsLib.getDocument({ data: buf.slice(0) }).promise) as unknown as PdfDocumentLike;
              for (let p = 1; p <= pdf.numPages && currentPage <= totalPages; p++) {
                if (cancelled) break;
                const pageNum = currentPage;
                if (!cacheRef.current.has(pageNum)) {
                  const page = await pdf.getPage(p);
                  const url = await renderPdfPageToUrl(page, 1.0);
                  if (url && !cancelled) storeThumbUrl(pageNum, url);
                }
                currentPage++;
              }
              await pdf.destroy();
            } else {
              const pageNum = currentPage;
              if (!cacheRef.current.has(pageNum)) {
                const url = URL.createObjectURL(file);
                if (!cancelled) storeThumbUrl(pageNum, url);
              }
              currentPage++;
            }
          }
        } else {
          const doc = await ensureServerPdf();
          if (doc) {
            for (let p = 1; p <= Math.min(totalPages, doc.numPages); p++) {
              if (cancelled) break;
              if (!cacheRef.current.has(p)) {
                const page = await doc.getPage(p);
                const url = await renderPdfPageToUrl(page, 1.0);
                if (url && !cancelled) storeThumbUrl(p, url);
              }
            }
          }
        }
      } catch (err) {
        console.warn('SimplePagePreview gallery render error:', err);
      }

      if (!cancelled) setLoadingAll(false);
    }

    queueMicrotask(() => {
      void renderAllPages();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaximized, totalPages, sourceSig]);

  const togglePageIncluded = (pageNumber: number) => {
    if (!onPageConfigsChange) return;
    const target = effectiveConfigs.find((c) => c.pageNumber === pageNumber);
    if (!target) return;

    // Guard: keep at least 1 included page
    if (target.included && selectedPages.length <= 1) return;

    const updated = effectiveConfigs.map((cfg) =>
      cfg.pageNumber === pageNumber ? { ...cfg, included: !cfg.included } : cfg
    );
    onPageConfigsChange(updated);
  };

  if (totalPages === 0) return null;

  const activePreviewUrl = thumbs[activePageNum] || null;
  const activeBw = isPageBw(activePageCfg);

  return (
    <>
      <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50/90 dark:bg-[#111116] p-3 space-y-2.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 min-w-0">
            <Eye className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Print Preview</span>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
              · Page {activePageNum}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                activeBw
                  ? 'bg-zinc-200/80 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-white/15'
                  : 'bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30'
              }`}
            >
              {activeBw ? 'B&W' : 'Color'}
            </span>

            <button
              type="button"
              onClick={() => setIsMaximized(true)}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-zinc-200 dark:border-white/15 bg-white dark:bg-white/[0.06] hover:bg-zinc-100 dark:hover:bg-white/[0.12] text-[11px] font-semibold text-zinc-800 dark:text-zinc-100 cursor-pointer transition-colors"
              title="Maximize to browse all pages and delete custom pages"
            >
              <Maximize2 className="w-3 h-3" />
              <span>All Pages</span>
            </button>
          </div>
        </div>

        {/* Inline Preview Sheet Canvas */}
        <div
          onClick={() => setIsMaximized(true)}
          className="relative w-full h-56 sm:h-64 rounded-xl border border-zinc-200/90 dark:border-white/10 bg-zinc-200/60 dark:bg-black/50 flex items-center justify-center overflow-hidden p-2 cursor-pointer group"
          title="Click to maximize and manage pages"
        >
          {loadingPage && !activePreviewUrl ? (
            <div className="flex flex-col items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
              <span className="text-[11px] font-medium">Rendering page {activePageNum}…</span>
            </div>
          ) : activePreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activePreviewUrl}
              alt={`Page ${activePageNum} preview`}
              className={`max-h-full max-w-full object-contain rounded-md bg-white shadow-md transition-all duration-200 group-hover:scale-[1.01] ${
                activeBw ? 'grayscale contrast-110' : ''
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
              {deletedCount > 0 ? ` (${deletedCount} deleted)` : ''}
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

      {/* Maximized Full-Screen Gallery Modal: Browse All Pages & Delete/Restore */}
      {isMaximized && (
        <div
          onClick={() => setIsMaximized(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col p-2.5 sm:p-5 animate-fade-in-up"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl mx-auto flex-1 min-h-0 flex flex-col rounded-2xl border border-white/15 bg-white dark:bg-[#0d0d12] shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-amber-500 shrink-0" />
                  <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white truncate">
                    All Uploaded Pages ({totalPages})
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {selectedPages.length} to print
                  {deletedCount > 0 ? ` · ${deletedCount} deleted` : ''}
                  {loadingAll ? ' · Loading previews…' : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsMaximized(false)}
                className="h-8 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Done</span>
              </button>
            </div>

            {/* Scrollable All-Pages Grid */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {effectiveConfigs.map((cfg) => {
                  const thumbUrl = thumbs[cfg.pageNumber];
                  const isBw = isPageBw(cfg);
                  const isOnlyRemaining = cfg.included && selectedPages.length <= 1;

                  return (
                    <div
                      key={cfg.pageNumber}
                      className={`rounded-xl border p-2.5 flex flex-col gap-2 transition-all ${
                        cfg.included
                          ? 'border-zinc-200 dark:border-white/15 bg-white dark:bg-[#14141b]'
                          : 'border-rose-500/35 bg-rose-500/[0.04] opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-bold text-zinc-800 dark:text-zinc-100">
                          Page {cfg.pageNumber}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            !cfg.included
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold'
                              : isBw
                              ? 'bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/15'
                              : 'bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30'
                          }`}
                        >
                          {!cfg.included ? 'Deleted' : isBw ? 'B&W' : 'Color'}
                        </span>
                      </div>

                      <div className="relative h-64 rounded-lg border border-zinc-200/80 dark:border-white/10 bg-zinc-100 dark:bg-black/50 flex items-center justify-center overflow-hidden p-1.5">
                        {thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbUrl}
                            alt={`Page ${cfg.pageNumber}`}
                            className={`max-h-full max-w-full object-contain rounded bg-white shadow-sm transition-all ${
                              isBw ? 'grayscale contrast-110' : ''
                            } ${!cfg.included ? 'opacity-40' : ''}`}
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-zinc-400">
                            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                            <span className="text-[11px]">Page {cfg.pageNumber}</span>
                          </div>
                        )}
                      </div>

                      {onPageConfigsChange && (
                        <button
                          type="button"
                          disabled={isOnlyRemaining}
                          onClick={() => togglePageIncluded(cfg.pageNumber)}
                          title={
                            isOnlyRemaining
                              ? 'At least 1 page must remain selected'
                              : cfg.included
                              ? `Delete page ${cfg.pageNumber}`
                              : `Restore page ${cfg.pageNumber}`
                          }
                          className={`h-8 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                            cfg.included
                              ? 'border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer'
                              : 'border border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 cursor-pointer'
                          }`}
                        >
                          {cfg.included ? (
                            <>
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{isOnlyRemaining ? 'Keep Last Page' : 'Delete Page'}</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore Page</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
