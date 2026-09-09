'use client';

import React, { useEffect, useState, useRef } from 'react';
import { PageConfig } from '@/lib/pricing';
import {
  Sparkles,
  RotateCw,
  Loader2,
  FileText,
  Maximize2,
  X,
  Eye,
  EyeOff,
  Compass,
  Plus,
  Minus,
  Copy,
} from 'lucide-react';

interface PageVisualizerProps {
  totalPages: number;
  downloadUrl?: string;
  fileKey?: string;
  rawFiles?: File[];
  pageConfigs: PageConfig[];
  onChange: (configs: PageConfig[]) => void;
  orientation?: 'portrait' | 'landscape';
  onOrientationChange?: (orient: 'portrait' | 'landscape') => void;
}

export function PageVisualizer({
  totalPages,
  downloadUrl,
  fileKey,
  rawFiles,
  pageConfigs,
  onChange,
  orientation = 'portrait',
  onOrientationChange,
}: PageVisualizerProps) {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const lastSourceSigRef = useRef<string>('');

  // Load document and image pages — progressive: each thumbnail appears as soon as it renders
  useEffect(() => {
    let isMounted = true;
    const createdUrls: string[] = [];
    const sourceSig = `${fileKey || ''}_${downloadUrl || ''}_${totalPages}_${rawFiles?.map((f) => `${f.name}_${f.size}`).join(',') || ''}`;
    const isNewSource = sourceSig !== lastSourceSigRef.current;

    if (isNewSource) {
      setThumbnails({});
      lastSourceSigRef.current = sourceSig;
    }

    async function loadPages() {
      try {
        setLoadingThumbnails(true);

        const newThumbs: Record<number, string> = {};
        const updatedConfigs = [...pageConfigs];
        let configsChanged = false;

        // Dynamically import PDF.js with same-origin worker (never blocked by CORS)
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

        // Case A: Raw files provided in memory
        if (rawFiles && rawFiles.length > 0) {
          let currentPageIdx = 1;

          for (const file of rawFiles) {
            if (!isMounted) break;
            const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');

            if (isPdf) {
              try {
                const arrayBuffer = await file.arrayBuffer();
                // Pass slice copy to prevent detachment issues
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
                const pdf = await loadingTask.promise;

                for (let p = 1; p <= pdf.numPages; p++) {
                  if (currentPageIdx > totalPages) break;
                  const pageNumber = currentPageIdx; // Capture immutable loop index for async closure
                  const page = await pdf.getPage(p);
                  const unscaled = page.getViewport({ scale: 1.0 });
                  const isNaturalLandscape = unscaled.width > unscaled.height;

                  const targetIdx = updatedConfigs.findIndex((cfg) => cfg.pageNumber === pageNumber);
                  if (targetIdx !== -1 && !updatedConfigs[targetIdx].orientation) {
                    updatedConfigs[targetIdx] = {
                      ...updatedConfigs[targetIdx],
                      orientation: isNaturalLandscape ? 'landscape' : 'portrait',
                      rotation: isNaturalLandscape ? 90 : 0,
                    };
                    configsChanged = true;
                  }

                  // High quality thumbnail render (0.65 scale = crisp on mobile screens)
                  const viewport = page.getViewport({ scale: 0.65 });
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;

                  if (context) {
                    await page.render({ canvasContext: context, viewport }).promise;
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    newThumbs[pageNumber] = dataUrl;
                    // Progressive: show each thumbnail immediately as it renders
                    if (isMounted) {
                      setThumbnails((prev) => ({ ...prev, [pageNumber]: dataUrl }));
                    }
                  }
                  currentPageIdx++;
                }
              } catch (err) {
                console.warn(`PDF parse error for ${file.name}:`, err);
                currentPageIdx++;
              }
            } else {
              // Direct Image file (PNG, JPG, WebP) — show immediately
              if (currentPageIdx <= totalPages) {
                const pageNumber = currentPageIdx; // Capture immutable loop index
                const objectUrl = URL.createObjectURL(file);
                createdUrls.push(objectUrl);
                newThumbs[pageNumber] = objectUrl;

                // Show image thumbnail immediately (no render needed)
                if (isMounted) {
                  setThumbnails((prev) => ({ ...prev, [pageNumber]: objectUrl }));
                }

                // Detect natural image dimensions asynchronously
                const img = new Image();
                img.onload = () => {
                  if (!isMounted) return; // guard stale closure
                  const isImgLandscape = img.naturalWidth > img.naturalHeight;
                  const targetIdx = updatedConfigs.findIndex((cfg) => cfg.pageNumber === pageNumber);
                  if (targetIdx !== -1 && !updatedConfigs[targetIdx].orientation) {
                    updatedConfigs[targetIdx] = {
                      ...updatedConfigs[targetIdx],
                      orientation: isImgLandscape ? 'landscape' : 'portrait',
                      rotation: isImgLandscape ? 90 : 0,
                    };
                    configsChanged = true;
                  }
                };
                img.src = objectUrl;

                currentPageIdx++;
              }
            }
          }

          // Wait a tick for any pending img.onload orientation callbacks
          await new Promise((r) => setTimeout(r, 60));
          if (isMounted && configsChanged) {
            onChange(updatedConfigs);
          }
          return;
        }

        // Case B: Fallback to /api/view-file if rawFiles not present
        const targetUrl = fileKey ? `/api/view-file?key=${encodeURIComponent(fileKey)}` : downloadUrl;
        if (targetUrl) {
          const loadingTask = pdfjsLib.getDocument(targetUrl);
          const pdf = await loadingTask.promise;
          const pageCount = Math.min(pdf.numPages, totalPages);

          for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            if (!isMounted) break;
            const thisPage = pageNum;
            try {
              const page = await pdf.getPage(thisPage);
              const viewport = page.getViewport({ scale: 0.65 });
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              if (context) {
                await page.render({ canvasContext: context, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                newThumbs[thisPage] = dataUrl;
                // Progressive: render each page as it's ready
                if (isMounted) {
                  setThumbnails((prev) => ({ ...prev, [thisPage]: dataUrl }));
                }
              }
            } catch (err) {
              console.warn(`Fallback render error for page ${thisPage}:`, err);
            }
          }
        }
      } catch (err) {
        console.warn('Page thumbnail error:', err);
      } finally {
        if (isMounted) {
          setLoadingThumbnails(false);
        }
      }
    }

    loadPages();

    return () => {
      isMounted = false;
      createdUrls.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
    };
  }, [rawFiles, downloadUrl, fileKey, totalPages]);

  // Bulk actions
  const setAllColor = (colorMode: 'bw' | 'color') => {
    const updated = pageConfigs.map((p) => ({ ...p, colorMode }));
    onChange(updated);
  };

  const toggleAllInclusion = (included: boolean) => {
    const updated = pageConfigs.map((p) => ({ ...p, included }));
    onChange(updated);
  };

  const setPageColor = (pageNumber: number, colorMode: 'bw' | 'color') => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        return { ...p, colorMode };
      }
      return p;
    });
    onChange(updated);
  };

  const togglePageInclusion = (pageNumber: number) => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        return { ...p, included: !p.included };
      }
      return p;
    });
    onChange(updated);
  };

  // Change orientation for an individual page (without artificial 90° rotation)
  const setPageOrientation = (pageNumber: number, orient: 'portrait' | 'landscape') => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        return {
          ...p,
          orientation: orient,
        };
      }
      return p;
    });
    onChange(updated);
  };

  // Change orientation for all pages at once (without artificial 90° rotation)
  const setAllOrientation = (orient: 'portrait' | 'landscape') => {
    if (onOrientationChange) {
      onOrientationChange(orient);
    }
    const updated = pageConfigs.map((p) => ({
      ...p,
      orientation: orient,
    }));
    onChange(updated);
  };

  // Per-page copies modifier
  const setPageCopies = (pageNumber: number, delta: number) => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        const currentCopies = Math.max(1, Math.floor(p.copies || 1));
        const nextCopies = Math.max(1, Math.min(99, currentCopies + delta));
        return { ...p, copies: nextCopies };
      }
      return p;
    });
    onChange(updated);
  };

  const setAllCopies = (copies: number) => {
    const validCopies = Math.max(1, Math.min(99, Math.floor(copies) || 1));
    const updated = pageConfigs.map((p) => ({
      ...p,
      copies: validCopies,
    }));
    onChange(updated);
  };

  // Rotate individual page 90 degrees clockwise (for user manual rotation only)
  const rotatePage = (pageNumber: number) => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        const currentRot = p.rotation || 0;
        const nextRot = (currentRot + 90) % 360;
        return {
          ...p,
          rotation: nextRot,
        };
      }
      return p;
    });
    onChange(updated);
  };

  const includedPagesCount = pageConfigs.filter((p) => p.included).length;
  const colorPagesCount = pageConfigs.filter((p) => p.included && p.colorMode === 'color').length;
  const bwPagesCount = pageConfigs.filter((p) => p.included && p.colorMode === 'bw').length;
  const totalCopiesCount = pageConfigs
    .filter((p) => p.included)
    .reduce((sum, p) => sum + Math.max(1, Math.floor(p.copies || 1)), 0);

  return (
    <div className="rounded-2xl p-3 sm:p-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-3.5 shadow-2xs">
      {/* Top Toolbar: Orientation, Copies & Bulk Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-200/80 dark:border-[#282a2c]">
        {/* Orientation Switcher */}
        <div className="inline-flex rounded-full bg-zinc-100 dark:bg-[#131314] p-1 border border-zinc-200/80 dark:border-[#282a2c] text-xs">
          <button
            type="button"
            onClick={() => setAllOrientation('portrait')}
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              orientation === 'portrait'
                ? 'bg-white dark:bg-[#282a2c] text-zinc-950 dark:text-white shadow-2xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white font-medium'
            }`}
            title="Set all pages to Portrait"
          >
            Portrait
          </button>
          <button
            type="button"
            onClick={() => setAllOrientation('landscape')}
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              orientation === 'landscape'
                ? 'bg-white dark:bg-[#282a2c] text-zinc-950 dark:text-white shadow-2xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white font-medium'
            }`}
            title="Set all pages to Landscape"
          >
            Landscape
          </button>
        </div>

        {/* Total Impressions Stats Tag */}
        <div className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{includedPagesCount}</span> pgs •{' '}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{totalCopiesCount}</span> total sheets
        </div>

        {/* Quick Action Bulk Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mr-0.5">Apply all:</span>

          <button
            type="button"
            onClick={() => setAllColor('bw')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              colorPagesCount === 0 && bwPagesCount > 0
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 font-semibold shadow-2xs'
                : 'bg-zinc-50 dark:bg-[#131314] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${colorPagesCount === 0 && bwPagesCount > 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-400'}`} />
            <span>All B&W (₹4)</span>
          </button>

          <button
            type="button"
            onClick={() => setAllColor('color')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              colorPagesCount === includedPagesCount && includedPagesCount > 0
                ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white border-transparent font-semibold shadow-2xs'
                : 'bg-zinc-50 dark:bg-[#131314] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${colorPagesCount === includedPagesCount && includedPagesCount > 0 ? 'bg-white' : 'bg-zinc-400'}`} />
            <span>All Color (₹7)</span>
          </button>

          {includedPagesCount < totalPages ? (
            <button
              type="button"
              onClick={() => toggleAllInclusion(true)}
              className="px-2.5 py-1 rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-[#282a2c] transition-colors"
            >
              Select All
            </button>
          ) : (
            <button
              type="button"
              onClick={() => toggleAllInclusion(false)}
              className="px-2.5 py-1 rounded-full text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-[#282a2c] transition-colors"
            >
              Deselect All
            </button>
          )}
        </div>
      </div>

      {/* Page Thumbnails Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
        {pageConfigs.map((config) => {
          const thumb = thumbnails[config.pageNumber];
          const isLandscape = config.orientation === 'landscape';
          const pageCopies = Math.max(1, Math.floor(config.copies || 1));

          return (
            <div
              key={config.pageNumber}
              className={`rounded-xl border transition-all duration-150 flex flex-col justify-between overflow-hidden relative group shadow-2xs ${
                config.included
                  ? config.colorMode === 'color'
                    ? 'border-blue-400/80 dark:border-blue-500/60 bg-white dark:bg-[#1e1f20] ring-1 ring-blue-500/20'
                    : 'border-zinc-300 dark:border-[#3c4043] bg-white dark:bg-[#1e1f20]'
                  : 'border-zinc-200 dark:border-[#282a2c] bg-zinc-100/70 dark:bg-[#131314] opacity-40 grayscale'
              } ${isLandscape ? 'sm:col-span-2' : ''}`}
            >
              {/* Header inside thumbnail card */}
              <div className="px-2 py-1.5 flex items-center justify-between border-b border-zinc-100 dark:border-[#282a2c] bg-zinc-50/80 dark:bg-[#131314]/50">
                <div className="flex items-center space-x-1.5">
                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                    #{config.pageNumber}
                  </span>

                  {/* Tactile Copies Stepper */}
                  <div
                    className="flex items-center space-x-0.5 bg-zinc-100 dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700/80 rounded-full px-1 py-0.5"
                    title="Number of copies for this page"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPageCopies(config.pageNumber, -1);
                      }}
                      disabled={pageCopies <= 1}
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <Minus className="w-2.5 h-2.5" />
                    </button>
                    <span className="font-mono text-[10px] font-bold text-zinc-900 dark:text-zinc-100 min-w-[14px] text-center">
                      {pageCopies}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPageCopies(config.pageNumber, 1);
                      }}
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  {/* Compact Orientation Pill */}
                  <button
                    type="button"
                    onClick={() => setPageOrientation(config.pageNumber, isLandscape ? 'portrait' : 'landscape')}
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Toggle orientation (Portrait / Landscape)"
                  >
                    {isLandscape ? 'Land' : 'Port'}
                  </button>

                  <button
                    type="button"
                    onClick={() => togglePageInclusion(config.pageNumber)}
                    className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title={config.included ? 'Exclude this page' : 'Include this page'}
                  >
                    {config.included ? (
                      <Eye className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Physical Paper Sheet Canvas */}
              <div
                onClick={() => thumb && setZoomPage(config.pageNumber)}
                className="p-3 flex items-center justify-center bg-zinc-100 dark:bg-[#131314] min-h-[195px] cursor-zoom-in relative overflow-hidden transition-all duration-300"
                title="Click to zoom and inspect page details"
              >
                {/* Physical White Paper Sheet */}
                <div
                  className={`relative flex items-center justify-center bg-white shadow-xl shadow-black/40 dark:shadow-black/80 rounded-xs border border-zinc-300 dark:border-zinc-700 transition-all duration-300 overflow-hidden ${
                    isLandscape
                      ? 'w-[185px] sm:w-[220px] aspect-[297/210]'
                      : 'w-[125px] sm:w-[135px] aspect-[210/297]'
                  }`}
                >
                  {/* Subtle Margin Guideline */}
                  <div className="absolute inset-1.5 border border-dashed border-zinc-300 pointer-events-none rounded-[1px]" />

                  {/* Interactive Laser Scanline effect on hover */}
                  <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/80 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 group-hover:animate-scanline z-10 shadow-[0_0_8px_rgba(66,133,244,0.7)]" />

                  {/* Watermark indicating paper format & dimensions */}
                  <span className="absolute bottom-1 right-1.5 text-[8px] font-mono font-bold text-zinc-400 select-none uppercase tracking-tighter">
                    {isLandscape ? 'A4 297×210' : 'A4 210×297'}
                  </span>

                  {/* B&W or Color Badge on Paper */}
                  <span className={`absolute top-1 left-1.5 text-[8px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                    config.colorMode === 'bw'
                      ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border border-zinc-300/80 dark:border-zinc-600'
                      : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-2xs'
                  }`}>
                    {config.colorMode === 'bw' ? 'B&W' : 'Color'}
                  </span>

                  {/* Multi-Copy Badge if copies > 1 */}
                  {pageCopies > 1 && (
                    <span className="absolute top-1 right-1.5 text-[8px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500 text-white shadow-2xs">
                      {pageCopies}× copies
                    </span>
                  )}

                  {thumb ? (
                    <div className="w-full h-full p-2 flex items-center justify-center overflow-hidden">
                      <div
                        className="w-full h-full flex items-center justify-center transition-all duration-300"
                        style={{
                          transform: config.rotation ? `rotate(${config.rotation}deg)` : undefined,
                          transformOrigin: 'center center',
                        }}
                      >
                        <img
                          src={thumb}
                          alt={`Page ${config.pageNumber}`}
                          style={{
                            filter: config.colorMode === 'bw' ? 'grayscale(100%) contrast(110%) brightness(98%)' : 'none',
                          }}
                          className="object-contain max-w-full max-h-full select-none transition-all duration-200"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 space-y-1">
                      {loadingThumbnails ? (
                        <>
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                          <span className="text-[9px] text-zinc-500 font-mono font-medium">Rendering #{config.pageNumber}</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-6 h-6 stroke-1 text-zinc-400" />
                          <span className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono font-medium">Page #{config.pageNumber}</span>
                          <span className="text-[9px] text-zinc-400 font-mono">Standard A4</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Excluded Overlay */}
                {!config.included && (
                  <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-3 text-center">
                    <span className="text-[10px] font-medium text-zinc-300 bg-zinc-900 border border-zinc-700 px-2.5 py-1 rounded-full mb-2 shadow-sm">
                      Excluded from Print
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePageInclusion(config.pageNumber);
                      }}
                      className="px-3 py-1.5 rounded-full bg-white text-zinc-950 dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold shadow-xs hover:bg-zinc-200 transition-all active:scale-95"
                    >
                      + Include Page
                    </button>
                  </div>
                )}

                {/* Zoom indicator on hover */}
                {thumb && config.included && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <div className="p-2 rounded-full bg-zinc-900/90 border border-white/20 shadow-lg">
                      <Maximize2 className="w-4 h-4 text-zinc-200" />
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Color Selector: Prominent Highlighting for Default B&W and Gemini Color */}
              <div className="p-1.5 bg-zinc-50 dark:bg-[#131314] border-t border-zinc-100 dark:border-[#282a2c]">
                {config.included ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* B&W Button - Default Prominently Highlighted */}
                    <button
                      type="button"
                      onClick={() => setPageColor(config.pageNumber, 'bw')}
                      className={`py-1.5 px-1.5 rounded-lg text-[10px] transition-all flex items-center justify-center gap-1.5 ${
                        config.colorMode === 'bw'
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold shadow-xs ring-1 ring-black/10'
                          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-[#1e1f20] font-medium'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${config.colorMode === 'bw' ? 'bg-white dark:bg-zinc-950' : 'bg-zinc-400'}`} />
                      <span>B&amp;W ₹4</span>
                    </button>

                    {/* Color Button - Vibrant Google Gemini Gradient When Active */}
                    <button
                      type="button"
                      onClick={() => setPageColor(config.pageNumber, 'color')}
                      className={`py-1.5 px-1.5 rounded-lg text-[10px] transition-all flex items-center justify-center gap-1.5 ${
                        config.colorMode === 'color'
                          ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white font-bold shadow-xs'
                          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-[#1e1f20] font-medium'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${config.colorMode === 'color' ? 'bg-white' : 'bg-zinc-400'}`} />
                      <span>Color ₹7</span>
                    </button>
                  </div>
                ) : (
                  <div className="py-1 text-center text-[10px] text-zinc-500 font-normal">
                    Skipped • Will not print
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fullscreen Zoom Modal */}
      {zoomPage !== null && thumbnails[zoomPage] && (
        <div
          onClick={() => setZoomPage(null)}
          className="fixed inset-0 z-50 bg-black/80 dark:bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-2xl w-full max-h-[90vh] rounded-2xl p-5 border border-zinc-200 dark:border-[#282a2c] flex flex-col space-y-3 relative overflow-hidden bg-white dark:bg-[#1e1f20] shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-200 dark:border-[#282a2c]">
              <div className="flex items-center space-x-2">
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 text-base">
                  Page #{zoomPage} Preview
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  ({pageConfigs.find((p) => p.pageNumber === zoomPage)?.colorMode === 'color' ? 'Color' : 'B&W'})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Modal Copies Stepper */}
                {(() => {
                  const currConf = pageConfigs.find((p) => p.pageNumber === zoomPage);
                  const pCopies = Math.max(1, Math.floor(currConf?.copies || 1));
                  return (
                    <div className="flex items-center space-x-1 bg-zinc-100 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] rounded-full px-2 py-1 text-xs">
                      <span className="text-[10px] text-zinc-500 mr-1">Copies:</span>
                      <button
                        type="button"
                        onClick={() => setPageCopies(zoomPage, -1)}
                        disabled={pCopies <= 1}
                        className="w-4 h-4 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 min-w-[16px] text-center">
                        {pCopies}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPageCopies(zoomPage, 1)}
                        className="w-4 h-4 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })()}

                {/* Modal Orientation Toggle (No unwanted rotation) */}
                {(() => {
                  const currConf = pageConfigs.find((p) => p.pageNumber === zoomPage);
                  const isLand = currConf?.orientation === 'landscape';
                  return (
                    <div className="inline-flex rounded-full bg-zinc-100 dark:bg-[#131314] p-0.5 border border-zinc-200 dark:border-[#282a2c] text-xs">
                      <button
                        type="button"
                        onClick={() => setPageOrientation(zoomPage, 'portrait')}
                        className={`px-2.5 py-1 rounded-full font-medium transition-all ${
                          !isLand ? 'bg-white dark:bg-[#282a2c] text-zinc-950 dark:text-white shadow-2xs font-semibold' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                        }`}
                      >
                        Portrait
                      </button>
                      <button
                        type="button"
                        onClick={() => setPageOrientation(zoomPage, 'landscape')}
                        className={`px-2.5 py-1 rounded-full font-medium transition-all ${
                          isLand ? 'bg-white dark:bg-[#282a2c] text-zinc-950 dark:text-white shadow-2xs font-semibold' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                        }`}
                      >
                        Landscape
                      </button>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => rotatePage(zoomPage)}
                  className="px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-[#282a2c] dark:hover:bg-zinc-700 dark:text-zinc-200 text-xs font-medium flex items-center gap-1 transition-colors"
                  title="Rotate 90 degrees"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotate</span>
                </button>
                <button
                  onClick={() => setZoomPage(null)}
                  className="p-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-[#282a2c] dark:hover:bg-zinc-700 dark:text-zinc-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-zinc-100 dark:bg-[#131314] rounded-xl">
              {(() => {
                const currConf = pageConfigs.find((p) => p.pageNumber === zoomPage);
                const isLand = currConf?.orientation === 'landscape';
                return (
                  <div
                    className={`relative flex items-center justify-center bg-white shadow-2xl shadow-black/60 rounded-xs border border-zinc-300 dark:border-zinc-700 transition-all duration-300 overflow-hidden ${
                      isLand ? 'w-[88%] aspect-[297/210] max-h-[65vh]' : 'w-[58%] aspect-[210/297] max-h-[65vh]'
                    }`}
                  >
                    {/* Margin guide */}
                    <div className="absolute inset-2 border border-dashed border-zinc-300 pointer-events-none" />
                    <span className="absolute bottom-2 right-2 text-[9px] font-mono font-bold text-zinc-400 uppercase">
                      {isLand ? 'A4 Landscape (297×210 mm)' : 'A4 Portrait (210×297 mm)'}
                    </span>

                    <span className={`absolute top-2 left-2 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-2xs ${
                      currConf?.colorMode === 'bw'
                        ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700'
                        : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                    }`}>
                      {currConf?.colorMode === 'bw' ? 'Black & White' : 'Full Color'}
                    </span>

                    <div className="w-full h-full p-4 flex items-center justify-center overflow-hidden">
                      <div
                        className="w-full h-full flex items-center justify-center transition-all duration-300"
                        style={{
                          transform: currConf?.rotation ? `rotate(${currConf.rotation}deg)` : undefined,
                          transformOrigin: 'center center',
                        }}
                      >
                        <img
                          src={thumbnails[zoomPage]}
                          alt={`Zoomed Page ${zoomPage}`}
                          style={{
                            filter: currConf?.colorMode === 'bw' ? 'grayscale(100%) contrast(110%) brightness(98%)' : 'none',
                          }}
                          className="max-h-full max-w-full object-contain select-none transition-all duration-200"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Select color mode for Page #{zoomPage}:
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPageColor(zoomPage, 'bw');
                    setZoomPage(null);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-2xs"
                >
                  Set B&amp;W (₹4)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPageColor(zoomPage, 'color');
                    setZoomPage(null);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-2xs"
                >
                  Set Color (₹7)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
