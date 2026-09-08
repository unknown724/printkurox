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

  // Load document and image pages
  useEffect(() => {
    let isMounted = true;

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

                  const viewport = page.getViewport({ scale: 0.5 });
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;

                  if (context) {
                    await page.render({ canvasContext: context, viewport }).promise;
                    newThumbs[currentPageIdx] = canvas.toDataURL('image/jpeg', 0.85);
                  }
                  currentPageIdx++;
                }
              } catch (err) {
                console.warn(`PDF parse error for ${file.name}:`, err);
                currentPageIdx++;
              }
            } else {
              // Direct Image file (PNG, JPG, WebP)
              if (currentPageIdx <= totalPages) {
                const objectUrl = URL.createObjectURL(file);
                newThumbs[currentPageIdx] = objectUrl;

                // Detect natural image dimensions
                const img = new Image();
                img.onload = () => {
                  const isImgLandscape = img.naturalWidth > img.naturalHeight;
                  const targetIdx = updatedConfigs.findIndex((cfg) => cfg.pageNumber === currentPageIdx);
                  if (targetIdx !== -1 && !updatedConfigs[targetIdx].orientation) {
                    updatedConfigs[targetIdx] = {
                      ...updatedConfigs[targetIdx],
                      orientation: isImgLandscape ? 'landscape' : 'portrait',
                      rotation: isImgLandscape ? 90 : 0,
                    };
                    onChange([...updatedConfigs]);
                  }
                };
                img.src = objectUrl;

                currentPageIdx++;
              }
            }
          }

          if (isMounted) {
            setThumbnails(newThumbs);
            if (configsChanged) {
              onChange(updatedConfigs);
            }
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
              const viewport = page.getViewport({ scale: 0.45 });
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              if (context) {
                await page.render({ canvasContext: context, viewport }).promise;
                newThumbs[pageNum] = canvas.toDataURL('image/jpeg', 0.85);
              }
            } catch (err) {
              console.warn(`Fallback render error for page ${pageNum}:`, err);
            }
          }

          if (isMounted) {
            setThumbnails(newThumbs);
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
    const nextRot = nextOrient === 'landscape' ? 90 : 0;
    if (onOrientationChange) {
      onOrientationChange(nextOrient);
    }
    const updated = pageConfigs.map((p) => ({
      ...p,
      rotation: nextRot,
      orientation: nextOrient,
    }));
    onChange(updated);
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

        {/* Global Rotate Button */}
        <button
          type="button"
          onClick={rotateAllPages}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 transition-all hover:text-white active:scale-95"
          title="Toggle rotation for all pages"
        >
          <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
          <span className="capitalize">Rotate All ({orientation})</span>
        </button>
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
              }`}
            >
              {/* Header inside thumbnail card */}
              <div className="p-2.5 flex items-center justify-between border-b border-white/5 bg-black/20">
                <div className="flex items-center space-x-1.5">
                  <span className="font-mono font-black text-white text-xs">
                    #{config.pageNumber}
                  </span>
                  {/* Rotate button */}
                  <button
                    type="button"
                    onClick={() => rotatePage(config.pageNumber)}
                    className="px-1.5 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-1 transition-all"
                    title={`Click to rotate (Current: ${rot}° ${isLandscape ? 'Landscape' : 'Portrait'})`}
                  >
                    <RotateCw className="w-2.5 h-2.5 text-indigo-400" />
                    <span>{rot}°</span>
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

              {/* Real Page Canvas or Image (Rotated based on orientation) */}
              <div
                onClick={() => thumb && setZoomPage(config.pageNumber)}
                className={`p-2.5 flex items-center justify-center bg-slate-950/50 cursor-zoom-in relative overflow-hidden transition-all duration-300 ${
                  isLandscape ? 'aspect-[4/3]' : 'aspect-[3/4]'
                }`}
                title="Click to zoom and inspect page details"
              >
                {thumb ? (
                  <div className="w-full h-full flex items-center justify-center overflow-hidden">
                    <img
                      src={thumb}
                      alt={`Page ${config.pageNumber}`}
                      style={{
                        transform: `rotate(${rot}deg)`,
                        maxHeight: isLandscape ? '140%' : '100%',
                        maxWidth: isLandscape ? '140%' : '100%',
                      }}
                      className="object-contain rounded shadow border border-white/10 transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 space-y-1">
                    <FileText className="w-8 h-8 stroke-1 text-slate-500 animate-pulse" />
                    <span className="text-[10px] text-slate-500 font-mono">Page {config.pageNumber}</span>
                  </div>
                )}

                {/* Zoom indicator on hover */}
                {thumb && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <div className="p-1.5 rounded-full bg-slate-900/80 border border-white/20">
                      <Maximize2 className="w-3.5 h-3.5 text-indigo-300" />
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Color Selector Pills */}
              <div className="p-1.5 bg-black/30 border-t border-white/5 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setPageColor(config.pageNumber, 'bw')}
                  className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    config.colorMode === 'bw'
                      ? 'bg-slate-700 text-white shadow-sm border border-slate-500/40'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  B&W ₹4
                </button>

                <button
                  type="button"
                  onClick={() => setPageColor(config.pageNumber, 'color')}
                  className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    config.colorMode === 'color'
                      ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-sm shadow-pink-600/30'
                      : 'text-slate-400 hover:text-pink-300 hover:bg-white/5'
                  }`}
                >
                  Color ₹7
                </button>
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

            <div className="flex-1 overflow-auto flex items-center justify-center p-3 bg-slate-950/80 rounded-2xl">
              <img
                src={thumbnails[zoomPage]}
                alt={`Zoomed Page ${zoomPage}`}
                style={{
                  transform: `rotate(${pageConfigs.find((p) => p.pageNumber === zoomPage)?.rotation || 0}deg)`,
                }}
                className="max-h-[70vh] object-contain rounded-lg shadow-2xl transition-transform duration-300"
              />
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
