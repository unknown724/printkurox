'use client';

import React, { useEffect, useState, useRef } from 'react';
import { PageConfig } from '@/lib/pricing';
import {
  Palette,
  Eye,
  EyeOff,
  Sparkles,
  RotateCw,
  Loader2,
  FileText,
  Check,
  Maximize2,
  X,
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

  // Load actual document pages
  useEffect(() => {
    let isMounted = true;

    async function loadDocumentPages() {
      try {
        setLoadingThumbnails(true);

        // Case 1: Raw files are available in memory (instant, 0 CORS)
        if (rawFiles && rawFiles.length > 0) {
          const firstFile = rawFiles[0];
          const isPdf = firstFile.name.toLowerCase().endsWith('.pdf') || firstFile.type.includes('pdf');

          if (isPdf) {
            const arrayBuffer = await firstFile.arrayBuffer();
            if (!isMounted) return;

            const pdfjsLib = await import('pdfjs-dist');
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;

            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const pageCount = Math.min(pdf.numPages, totalPages);
            const newThumbs: Record<number, string> = {};
            const updatedConfigs = [...pageConfigs];
            let configsChanged = false;

            for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
              if (!isMounted) break;
              try {
                const page = await pdf.getPage(pageNum);
                const unscaledViewport = page.getViewport({ scale: 1.0 });

                // Auto-detect orientation: Landscape if width > height
                const isLandscape = unscaledViewport.width > unscaledViewport.height;
                const naturalOrientation = isLandscape ? 'landscape' : 'portrait';

                // Update config orientation if not already set
                const targetIdx = updatedConfigs.findIndex((p) => p.pageNumber === pageNum);
                if (targetIdx !== -1 && !updatedConfigs[targetIdx].orientation) {
                  updatedConfigs[targetIdx] = {
                    ...updatedConfigs[targetIdx],
                    orientation: naturalOrientation,
                  };
                  configsChanged = true;
                }

                // Render thumbnail with high clarity
                const viewport = page.getViewport({ scale: 0.5 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (context) {
                  await page.render({
                    canvasContext: context,
                    viewport: viewport,
                  }).promise;
                  newThumbs[pageNum] = canvas.toDataURL('image/jpeg', 0.85);
                }
              } catch (pErr) {
                console.warn(`Could not render thumbnail for page ${pageNum}`, pErr);
              }
            }

            if (isMounted) {
              setThumbnails(newThumbs);
              if (configsChanged) {
                onChange(updatedConfigs);
              }
            }
            return;
          } else {
            // Direct Image Uploads (PNG, JPG, WebP)
            const newThumbs: Record<number, string> = {};
            rawFiles.forEach((file, idx) => {
              const pageNum = idx + 1;
              if (pageNum <= totalPages) {
                newThumbs[pageNum] = URL.createObjectURL(file);
              }
            });
            if (isMounted) {
              setThumbnails(newThumbs);
            }
            return;
          }
        }

        // Case 2: Fallback to proxy streaming if rawFiles not passed
        const targetUrl = fileKey ? `/api/view-file?key=${encodeURIComponent(fileKey)}` : downloadUrl;
        if (targetUrl) {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;

          const loadingTask = pdfjsLib.getDocument(targetUrl);
          const pdf = await loadingTask.promise;
          const pageCount = Math.min(pdf.numPages, totalPages);
          const newThumbs: Record<number, string> = {};

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
                await page.render({
                  canvasContext: context,
                  viewport: viewport,
                }).promise;
                newThumbs[pageNum] = canvas.toDataURL('image/jpeg', 0.8);
              }
            } catch (err) {
              console.warn(`Page ${pageNum} proxy render error:`, err);
            }
          }

          if (isMounted) {
            setThumbnails(newThumbs);
          }
        }
      } catch (err) {
        console.warn('PDF thumbnail generation warning:', err);
      } finally {
        if (isMounted) {
          setLoadingThumbnails(false);
        }
      }
    }

    loadDocumentPages();

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

  const togglePageOrientation = (pageNumber: number) => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        const current = p.orientation || 'portrait';
        return {
          ...p,
          orientation: current === 'portrait' ? ('landscape' as const) : ('portrait' as const),
        };
      }
      return p;
    });
    onChange(updated);
  };

  const rotateAllPages = () => {
    const nextOrient = orientation === 'portrait' ? 'landscape' : 'portrait';
    if (onOrientationChange) {
      onOrientationChange(nextOrient);
    }
    const updated = pageConfigs.map((p) => ({ ...p, orientation: nextOrient }));
    onChange(updated);
  };

  const includedPagesCount = pageConfigs.filter((p) => p.included).length;
  const colorPagesCount = pageConfigs.filter((p) => p.included && p.colorMode === 'color').length;
  const bwPagesCount = pageConfigs.filter((p) => p.included && p.colorMode === 'bw').length;

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5 border-indigo-500/25 space-y-4">
      {/* Visualizer Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/5">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Interactive Page Inspector
            </h3>
            {loadingThumbnails && (
              <span className="flex items-center gap-1 text-[10px] text-indigo-400 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> Rendering live pages...
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
          title="Toggle Portrait / Landscape orientation for all pages"
        >
          <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
          <span className="capitalize">{orientation}</span>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[460px] overflow-y-auto pr-1">
        {pageConfigs.map((config) => {
          const thumb = thumbnails[config.pageNumber];
          const isLandscape = config.orientation === 'landscape';

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
                  <button
                    type="button"
                    onClick={() => togglePageOrientation(config.pageNumber)}
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors"
                    title={`Orientation: ${isLandscape ? 'Landscape' : 'Portrait'} (Click to rotate)`}
                  >
                    <Compass
                      className={`w-3 h-3 text-indigo-400 transition-transform ${
                        isLandscape ? 'rotate-90 text-pink-400' : ''
                      }`}
                    />
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

              {/* Real Page Canvas or Image */}
              <div
                onClick={() => thumb && setZoomPage(config.pageNumber)}
                className={`p-2 flex items-center justify-center bg-slate-950/40 cursor-zoom-in relative ${
                  isLandscape ? 'aspect-[4/3]' : 'aspect-[3/4]'
                }`}
                title="Click to zoom and inspect page details"
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={`Page ${config.pageNumber}`}
                    className="max-h-full max-w-full object-contain rounded shadow-md border border-white/10 transition-transform group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 space-y-1">
                    <FileText className="w-8 h-8 stroke-1 text-slate-500" />
                    <span className="text-[10px] text-slate-500 font-mono">Page {config.pageNumber}</span>
                  </div>
                )}

                {/* Subtle zoom indicator on hover */}
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
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
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
              <button
                onClick={() => setZoomPage(null)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-slate-950/80 rounded-2xl">
              <img
                src={thumbnails[zoomPage]}
                alt={`Zoomed Page ${zoomPage}`}
                className="max-h-[70vh] object-contain rounded-lg shadow-2xl"
              ></img>
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
