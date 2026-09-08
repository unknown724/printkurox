'use client';

import React, { useEffect, useState } from 'react';
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

  // Load document and image pages — progressive: each thumbnail appears as soon as it renders
  useEffect(() => {
    let isMounted = true;
    // Reset thumbnails when source changes
    setThumbnails({});

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
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;

                for (let p = 1; p <= pdf.numPages; p++) {
                  if (currentPageIdx > totalPages) break;
                  const page = await pdf.getPage(p);
                  const unscaled = page.getViewport({ scale: 1.0 });
                  const isNaturalLandscape = unscaled.width > unscaled.height;

                  const targetIdx = updatedConfigs.findIndex((cfg) => cfg.pageNumber === currentPageIdx);
                  if (targetIdx !== -1 && !updatedConfigs[targetIdx].orientation) {
                    updatedConfigs[targetIdx] = {
                      ...updatedConfigs[targetIdx],
                      orientation: isNaturalLandscape ? 'landscape' : 'portrait',
                      rotation: isNaturalLandscape ? 90 : 0,
                    };
                    configsChanged = true;
                  }

                  const viewport = page.getViewport({ scale: 0.4 });
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;

                  if (context) {
                    await page.render({ canvasContext: context, viewport }).promise;
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
                    newThumbs[currentPageIdx] = dataUrl;
                    // Progressive: show each thumbnail immediately as it renders
                    if (isMounted) {
                      setThumbnails((prev) => ({ ...prev, [currentPageIdx]: dataUrl }));
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
                const objectUrl = URL.createObjectURL(file);
                newThumbs[currentPageIdx] = objectUrl;
                const capturedIdx = currentPageIdx; // capture for async callback

                // Show image thumbnail immediately (no render needed)
                if (isMounted) {
                  setThumbnails((prev) => ({ ...prev, [capturedIdx]: objectUrl }));
                }

                // Detect natural image dimensions asynchronously
                const img = new Image();
                img.onload = () => {
                  if (!isMounted) return; // guard stale closure
                  const isImgLandscape = img.naturalWidth > img.naturalHeight;
                  const targetIdx = updatedConfigs.findIndex((cfg) => cfg.pageNumber === capturedIdx);
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
          await new Promise((r) => setTimeout(r, 50));
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
            try {
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 0.4 });
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              if (context) {
                await page.render({ canvasContext: context, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
                newThumbs[pageNum] = dataUrl;
                // Progressive: render each page as it's ready
                if (isMounted) {
                  setThumbnails((prev) => ({ ...prev, [pageNum]: dataUrl }));
                }
              }
            } catch (err) {
              console.warn(`Fallback render error for page ${pageNum}:`, err);
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

  // Change orientation for an individual page
  const setPageOrientation = (pageNumber: number, orient: 'portrait' | 'landscape') => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        const rot = orient === 'landscape' ? 90 : 0;
        return {
          ...p,
          orientation: orient,
          rotation: rot,
        };
      }
      return p;
    });
    onChange(updated);
  };

  // Change orientation for all pages at once
  const setAllOrientation = (orient: 'portrait' | 'landscape') => {
    if (onOrientationChange) {
      onOrientationChange(orient);
    }
    const rot = orient === 'landscape' ? 90 : 0;
    const updated = pageConfigs.map((p) => ({
      ...p,
      orientation: orient,
      rotation: rot,
    }));
    onChange(updated);
  };

  // Rotate individual page 90 degrees clockwise
  const rotatePage = (pageNumber: number) => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        const currentRot = p.rotation || (p.orientation === 'landscape' ? 90 : 0);
        const nextRot = (currentRot + 90) % 360;
        const nextOrient = nextRot === 90 || nextRot === 270 ? ('landscape' as const) : ('portrait' as const);
        return {
          ...p,
          rotation: nextRot,
          orientation: nextOrient,
        };
      }
      return p;
    });
    onChange(updated);
  };

  // Rotate all pages at once
  const rotateAllPages = () => {
    const nextOrient = orientation === 'portrait' ? 'landscape' : 'portrait';
    setAllOrientation(nextOrient);
  };

  const includedPagesCount = pageConfigs.filter((p) => p.included).length;
  const colorPagesCount = pageConfigs.filter((p) => p.included && p.colorMode === 'color').length;
  const bwPagesCount = pageConfigs.filter((p) => p.included && p.colorMode === 'bw').length;

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5 border-indigo-500/25 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/5">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Interactive Page Inspector
            </h3>
            {loadingThumbnails && (
              <span className="flex items-center gap-1 text-[10px] text-indigo-400 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> Rendering pages...
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {includedPagesCount} of {totalPages} pages selected •{' '}
            <span className="text-slate-300 font-semibold">{bwPagesCount} B&W</span> (₹4) +{' '}
            <span className="text-pink-400 font-semibold">{colorPagesCount} Color</span> (₹7)
          </p>
        </div>

        {/* Professional Orientation Switcher */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-900/90 p-1 border border-white/10 text-xs shadow-inner">
            <button
              type="button"
              onClick={() => setAllOrientation('portrait')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                orientation === 'portrait'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Set all pages to standard A4 Portrait"
            >
              <span>📄</span>
              <span>Portrait</span>
            </button>

            <button
              type="button"
              onClick={() => setAllOrientation('landscape')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                orientation === 'landscape'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Set all pages to horizontal A4 Landscape"
            >
              <span>📜</span>
              <span>Landscape</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Action Bulk Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <span className="text-[11px] font-medium text-slate-400 mr-1">Quick Apply:</span>

        <button
          type="button"
          onClick={() => setAllColor('bw')}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 transition-all active:scale-95 flex items-center gap-1.5"
        >
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          <span>All B&W (₹4)</span>
        </button>

        <button
          type="button"
          onClick={() => setAllColor('color')}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-pink-950/40 hover:bg-pink-900/40 border border-pink-500/40 text-pink-300 transition-all active:scale-95 flex items-center gap-1.5"
        >
          <span className="w-2 h-2 rounded-full bg-pink-400" />
          <span>All Color (₹7)</span>
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5 hidden sm:block" />

        {includedPagesCount < totalPages ? (
          <button
            type="button"
            onClick={() => toggleAllInclusion(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition-all"
          >
            Select All
          </button>
        ) : (
          <button
            type="button"
            onClick={() => toggleAllInclusion(false)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            Deselect All
          </button>
        )}
      </div>

      {/* Page Thumbnails Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto pr-1">
        {pageConfigs.map((config) => {
          const thumb = thumbnails[config.pageNumber];
          const rot = config.rotation ?? (config.orientation === 'landscape' ? 90 : 0);
          const isLandscape = rot === 90 || rot === 270;

          return (
            <div
              key={config.pageNumber}
              className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden relative group ${
                config.included
                  ? config.colorMode === 'color'
                    ? 'border-pink-500/60 bg-gradient-to-b from-pink-950/20 to-slate-900 shadow-md shadow-pink-500/10'
                    : 'border-indigo-500/50 bg-gradient-to-b from-indigo-950/20 to-slate-900 shadow-md shadow-indigo-500/10'
                  : 'border-slate-800 bg-slate-950/60 opacity-40 grayscale'
              } ${isLandscape ? 'sm:col-span-2' : ''}`}
            >
              {/* Header inside thumbnail card */}
              <div className="p-2.5 flex items-center justify-between border-b border-white/5 bg-black/30">
                <div className="flex items-center space-x-1.5">
                  <span className="font-mono font-black text-white text-xs mr-0.5">
                    #{config.pageNumber}
                  </span>

                  {/* Dedicated Port / Land pill */}
                  <div className="inline-flex rounded-lg bg-black/50 p-0.5 border border-white/10 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setPageOrientation(config.pageNumber, 'portrait')}
                      className={`px-1.5 py-0.5 rounded font-bold transition-all ${
                        !isLandscape
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Set page to Portrait"
                    >
                      Port
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageOrientation(config.pageNumber, 'landscape')}
                      className={`px-1.5 py-0.5 rounded font-bold transition-all ${
                        isLandscape
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Set page to Landscape"
                    >
                      Land
                    </button>
                  </div>

                  {/* 90 deg rotate button */}
                  <button
                    type="button"
                    onClick={() => rotatePage(config.pageNumber)}
                    className="p-1 rounded-md bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors"
                    title={`Rotate 90° clockwise (Current: ${rot}°)`}
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                </div>

                {/* Inclusion toggle */}
                <button
                  type="button"
                  onClick={() => togglePageInclusion(config.pageNumber)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                  title={config.included ? 'Exclude this page' : 'Include this page'}
                >
                  {config.included ? (
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </button>
              </div>

              {/* Professional Physical Paper Sheet Canvas */}
              <div
                onClick={() => thumb && setZoomPage(config.pageNumber)}
                className="p-3 flex items-center justify-center bg-[#090d17]/80 min-h-[195px] cursor-zoom-in relative overflow-hidden transition-all duration-300"
                title="Click to zoom and inspect page details"
              >
                {/* Physical White Paper Sheet */}
                <div
                  className={`relative flex items-center justify-center bg-white shadow-2xl shadow-black/90 rounded-xs border border-slate-300/80 transition-all duration-300 overflow-hidden ${
                    isLandscape
                      ? 'w-[185px] sm:w-[220px] aspect-[297/210]'
                      : 'w-[125px] sm:w-[135px] aspect-[210/297]'
                  }`}
                >
                  {/* Subtle 5mm Margin Guideline (Printing margin simulator) */}
                  <div className="absolute inset-1.5 border border-dashed border-slate-300/80 pointer-events-none rounded-[1px]" />

                  {/* Watermark indicating paper format & dimensions */}
                  <span className="absolute bottom-1 right-1.5 text-[8px] font-mono font-bold text-slate-400 select-none uppercase tracking-tighter">
                    {isLandscape ? 'A4 297×210' : 'A4 210×297'}
                  </span>

                  {/* B&W or Color Badge on Paper */}
                  <span className={`absolute top-1 left-1.5 text-[8px] font-mono font-black uppercase tracking-wider px-1 py-0.2 rounded ${
                    config.colorMode === 'bw' ? 'bg-slate-200 text-slate-700' : 'bg-pink-100 text-pink-700'
                  }`}>
                    {config.colorMode === 'bw' ? 'B&W' : 'Color'}
                  </span>

                  {thumb ? (
                    <div className="w-full h-full p-2 flex items-center justify-center overflow-hidden">
                      <div
                        className="flex items-center justify-center transition-all duration-300"
                        style={{
                          width: (rot === 90 || rot === 270) ? 'calc(100% * 210 / 297)' : '100%',
                          height: (rot === 90 || rot === 270) ? 'calc(100% * 297 / 210)' : '100%',
                          transform: rot ? `rotate(${rot}deg)` : undefined,
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
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 space-y-1">
                      <FileText className="w-7 h-7 stroke-1 text-slate-400 animate-pulse" />
                      <span className="text-[10px] text-slate-500 font-mono font-bold">Page {config.pageNumber}</span>
                    </div>
                  )}
                </div>

                {/* Prominent Excluded Overlay */}
                {!config.included && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-3 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 rounded-lg mb-2 shadow-sm">
                      🚫 Excluded from Print
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePageInclusion(config.pageNumber);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95"
                    >
                      + Include Page
                    </button>
                  </div>
                )}

                {/* Zoom indicator on hover */}
                {thumb && config.included && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <div className="p-2 rounded-full bg-slate-900/90 border border-white/20 shadow-lg">
                      <Maximize2 className="w-4 h-4 text-indigo-300" />
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Color Selector Pills */}
              <div className="p-1.5 bg-black/30 border-t border-white/5">
                {config.included ? (
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setPageColor(config.pageNumber, 'bw')}
                      className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${
                        config.colorMode === 'bw'
                          ? 'bg-slate-700 text-white shadow-sm border border-slate-500/40'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      <span>B&W ₹4</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPageColor(config.pageNumber, 'color')}
                      className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${
                        config.colorMode === 'color'
                          ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-sm shadow-pink-600/30'
                          : 'text-slate-400 hover:text-pink-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                      <span>Color ₹7</span>
                    </button>
                  </div>
                ) : (
                  <div className="py-1 text-center text-[10px] text-slate-500 font-medium">
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
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card max-w-2xl w-full max-h-[90vh] rounded-3xl p-5 border-white/10 flex flex-col space-y-3 relative overflow-hidden"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center space-x-2">
                <span className="font-mono font-black text-white text-base">
                  Page #{zoomPage} Preview
                </span>
                <span className="text-xs text-slate-400">
                  ({pageConfigs.find((p) => p.pageNumber === zoomPage)?.colorMode === 'color' ? 'Color' : 'B&W'})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Modal Orientation Toggle */}
                {(() => {
                  const currConf = pageConfigs.find((p) => p.pageNumber === zoomPage);
                  const isLand = currConf?.rotation === 90 || currConf?.rotation === 270 || currConf?.orientation === 'landscape';
                  return (
                    <div className="inline-flex rounded-xl bg-black/60 p-0.5 border border-white/10 text-xs">
                      <button
                        type="button"
                        onClick={() => setPageOrientation(zoomPage, 'portrait')}
                        className={`px-2 py-1 rounded-lg font-bold transition-all ${
                          !isLand ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        📄 Portrait
                      </button>
                      <button
                        type="button"
                        onClick={() => setPageOrientation(zoomPage, 'landscape')}
                        className={`px-2 py-1 rounded-lg font-bold transition-all ${
                          isLand ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        📜 Landscape
                      </button>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => rotatePage(zoomPage)}
                  className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotate 90°</span>
                </button>
                <button
                  onClick={() => setZoomPage(null)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#090d17] rounded-2xl">
              {(() => {
                const currConf = pageConfigs.find((p) => p.pageNumber === zoomPage);
                const rot = currConf?.rotation ?? (currConf?.orientation === 'landscape' ? 90 : 0);
                const isLand = rot === 90 || rot === 270;
                return (
                  <div
                    className={`relative flex items-center justify-center bg-white shadow-2xl shadow-black rounded-xs border border-slate-300 transition-all duration-300 overflow-hidden ${
                      isLand ? 'w-[88%] aspect-[297/210] max-h-[65vh]' : 'w-[58%] aspect-[210/297] max-h-[65vh]'
                    }`}
                  >
                    {/* Margin guide */}
                    <div className="absolute inset-2 border border-dashed border-slate-300 pointer-events-none" />
                    <span className="absolute bottom-2 right-2 text-[9px] font-mono font-bold text-slate-400 uppercase">
                      {isLand ? 'A4 Landscape (297×210 mm)' : 'A4 Portrait (210×297 mm)'}
                    </span>

                    <span className={`absolute top-2 left-2 text-[10px] font-mono font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm ${
                      currConf?.colorMode === 'bw' ? 'bg-slate-200 text-slate-700' : 'bg-pink-100 text-pink-700'
                    }`}>
                      {currConf?.colorMode === 'bw' ? 'Black & White' : 'Full Color'}
                    </span>

                    <div className="w-full h-full p-4 flex items-center justify-center overflow-hidden">
                      <div
                        className="flex items-center justify-center transition-all duration-300"
                        style={{
                          width: (rot === 90 || rot === 270) ? 'calc(100% * 210 / 297)' : '100%',
                          height: (rot === 90 || rot === 270) ? 'calc(100% * 297 / 210)' : '100%',
                          transform: rot ? `rotate(${rot}deg)` : undefined,
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
              <p className="text-xs text-slate-400">
                Inspect text and graphics to decide if Color (₹7) or B&W (₹4) is required.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPageColor(zoomPage, 'bw');
                    setZoomPage(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700"
                >
                  Set B&W (₹4)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPageColor(zoomPage, 'color');
                    setZoomPage(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-pink-600 text-white text-xs font-bold hover:bg-pink-500 shadow-lg shadow-pink-600/25"
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
