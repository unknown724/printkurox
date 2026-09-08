'use client';

import React, { useEffect, useState, useRef } from 'react';
import { PageConfig } from '@/lib/pricing';
import {
  Palette,
  Eye,
  EyeOff,
  Sparkles,
  CheckSquare,
  Square,
  RotateCw,
  Loader2,
  FileText,
  Check,
} from 'lucide-react';

interface PageVisualizerProps {
  totalPages: number;
  downloadUrl?: string;
  pageConfigs: PageConfig[];
  onChange: (configs: PageConfig[]) => void;
  orientation?: 'portrait' | 'landscape';
  onOrientationChange?: (orient: 'portrait' | 'landscape') => void;
}

export function PageVisualizer({
  totalPages,
  downloadUrl,
  pageConfigs,
  onChange,
  orientation = 'portrait',
  onOrientationChange,
}: PageVisualizerProps) {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'included'>('all');

  // Load PDF.js thumbnails on mount or when downloadUrl changes
  useEffect(() => {
    if (!downloadUrl) return;

    let isMounted = true;

    async function loadPdfThumbnails() {
      try {
        setLoadingThumbnails(true);

        // Dynamically import pdfjs-dist
        const pdfjsLib = await import('pdfjs-dist');
        // Point worker to cdnjs
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;

        const loadingTask = pdfjsLib.getDocument(downloadUrl);
        const pdf = await loadingTask.promise;
        const pageCount = Math.min(pdf.numPages, totalPages);
        const newThumbs: Record<number, string> = {};

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          if (!isMounted) break;
          try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 0.35 });
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
          } catch (pErr) {
            console.warn(`Could not render thumbnail for page ${pageNum}`, pErr);
          }
        }

        if (isMounted) {
          setThumbnails(newThumbs);
        }
      } catch (err) {
        console.warn('PDF thumbnail generation fallback:', err);
      } finally {
        if (isMounted) {
          setLoadingThumbnails(false);
        }
      }
    }

    loadPdfThumbnails();

    return () => {
      isMounted = false;
    };
  }, [downloadUrl, totalPages]);

  // Bulk actions
  const setAllColor = (colorMode: 'bw' | 'color') => {
    const updated = pageConfigs.map((p) => ({ ...p, colorMode }));
    onChange(updated);
  };

  const toggleAllInclusion = (included: boolean) => {
    const updated = pageConfigs.map((p) => ({ ...p, included }));
    onChange(updated);
  };

  const togglePageColor = (pageNumber: number) => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        return {
          ...p,
          colorMode: p.colorMode === 'bw' ? ('color' as const) : ('bw' as const),
        };
      }
      return p;
    });
    onChange(updated);
  };

  const togglePageInclusion = (pageNumber: number) => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        return {
          ...p,
          included: !p.included,
        };
      }
      return p;
    });
    onChange(updated);
  };

  const includedPagesCount = pageConfigs.filter((p) => p.included).length;
  const colorPagesCount = pageConfigs.filter((p) => p.included && p.colorMode === 'color').length;
  const bwPagesCount = pageConfigs.filter((p) => p.included && p.colorMode === 'bw').length;

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 border-indigo-500/20 bg-slate-900/60">
      {/* Header & Quick Bulk Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-white/5">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Interactive Page Inspector
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {includedPagesCount} of {totalPages} pages selected •{' '}
            <span className="text-slate-300 font-semibold">{bwPagesCount} B&W</span> (₹4){' '}
            {colorPagesCount > 0 && (
              <>
                + <span className="text-pink-400 font-semibold">{colorPagesCount} Color</span> (₹7)
              </>
            )}
          </p>
        </div>

        {/* Orientation Toggle */}
        {onOrientationChange && (
          <button
            type="button"
            onClick={() => onOrientationChange(orientation === 'portrait' ? 'landscape' : 'portrait')}
            className="self-start sm:self-auto px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-medium flex items-center space-x-1.5 transition-colors"
          >
            <RotateCw className="w-3 h-3 text-indigo-400" />
            <span className="capitalize">{orientation}</span>
          </button>
        )}
      </div>

      {/* Bulk Action Buttons */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[11px] text-slate-400 mr-1">Quick Apply:</span>
        <button
          type="button"
          onClick={() => setAllColor('bw')}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-white/5 transition-all"
        >
          All B&W (₹4)
        </button>
        <button
          type="button"
          onClick={() => setAllColor('color')}
          className="px-2.5 py-1 rounded-lg bg-pink-950/40 hover:bg-pink-900/50 text-pink-300 text-[11px] font-medium border border-pink-500/20 transition-all"
        >
          All Color (₹7)
        </button>
        <div className="h-3.5 w-px bg-white/10 mx-1 hidden sm:block" />
        <button
          type="button"
          onClick={() => toggleAllInclusion(includedPagesCount !== totalPages)}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-medium transition-all"
        >
          {includedPagesCount === totalPages ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Pages Grid Container */}
      <div className="max-h-[380px] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {pageConfigs.map((page) => {
            const pageNum = page.pageNumber;
            const thumbUrl = thumbnails[pageNum];
            const isIncluded = page.included;
            const isColor = page.colorMode === 'color';

            return (
              <div
                key={pageNum}
                className={`relative rounded-xl p-2.5 border transition-all flex flex-col justify-between ${
                  !isIncluded
                    ? 'opacity-40 bg-slate-950/40 border-dashed border-white/10'
                    : isColor
                    ? 'bg-gradient-to-b from-pink-950/20 to-slate-900 border-pink-500/40 shadow-sm shadow-pink-500/10'
                    : 'bg-slate-900/90 border-indigo-500/30'
                }`}
              >
                {/* Top Badge: Page Number & Exclusion Toggle */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-300">
                    #{pageNum}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePageInclusion(pageNum)}
                    className={`p-1 rounded-md transition-colors ${
                      isIncluded ? 'text-indigo-400 hover:text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title={isIncluded ? 'Exclude page from printing' : 'Include page'}
                  >
                    {isIncluded ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Page Thumbnail Canvas/Preview */}
                <div
                  onClick={() => isIncluded && togglePageColor(pageNum)}
                  className={`w-full aspect-[1/1.414] rounded-lg overflow-hidden border border-white/10 bg-slate-950/60 flex items-center justify-center relative cursor-pointer group select-none transition-transform ${
                    orientation === 'landscape' ? 'rotate-90 scale-90' : ''
                  }`}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={`Page ${pageNum}`}
                      className="w-full h-full object-cover"
                    />
                  ) : loadingThumbnails ? (
                    <div className="flex flex-col items-center justify-center p-2 text-center text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400 mb-1" />
                      <span className="text-[9px]">Rendering...</span>
                    </div>
                  ) : (
                    /* Default SVG page outline illustration */
                    <div className="w-full h-full p-2.5 flex flex-col justify-between bg-slate-900/90">
                      <div className="space-y-1.5">
                        <div className="w-1/2 h-1.5 rounded bg-slate-700/60" />
                        <div className="w-3/4 h-1 rounded bg-slate-800" />
                        <div className="w-full h-1 rounded bg-slate-800" />
                        <div className="w-5/6 h-1 rounded bg-slate-800" />
                      </div>
                      <div className="flex items-center justify-center">
                        <FileText className="w-5 h-5 text-slate-700" />
                      </div>
                      <div className="w-1/3 h-1 rounded bg-slate-800 self-end" />
                    </div>
                  )}

                  {/* Hover hint */}
                  {isIncluded && (
                    <div className="absolute inset-0 bg-indigo-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] text-white font-medium p-1 text-center">
                      Click to toggle Color/B&W
                    </div>
                  )}
                </div>

                {/* Bottom Toggle Pill */}
                <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={!isIncluded}
                    onClick={() => togglePageColor(pageNum)}
                    className={`w-full py-1 px-2 rounded-lg text-[10px] font-bold flex items-center justify-between transition-all ${
                      !isIncluded
                        ? 'bg-slate-800/40 text-slate-500 cursor-not-allowed'
                        : isColor
                        ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    <span>{isColor ? 'Color' : 'B&W'}</span>
                    <span className="opacity-90">{isColor ? '₹7' : '₹4'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
