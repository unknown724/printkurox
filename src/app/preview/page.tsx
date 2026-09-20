'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  FileText, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  MessageCircle,
  Palette,
  Eye,
  RotateCcw,
  Layers
} from 'lucide-react';

interface PagePreview {
  pageNumber: number;
  url: string;
  width: number;
  height: number;
}

function DocumentPreviewContent() {
  const searchParams = useSearchParams();
  const fileKey = searchParams.get('key') || '';
  const initialFileName = searchParams.get('name') || 'Document.pdf';
  const initialPages = parseInt(searchParams.get('pages') || '1', 10);
  const initialMode = (searchParams.get('mode') || 'bw').toLowerCase() === 'color' ? 'color' : 'bw';

  const [colorMode, setColorMode] = useState<'bw' | 'color'>(initialMode);
  const [pages, setPages] = useState<PagePreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [zoomLevel, setZoomLevel] = useState<'compact' | 'normal' | 'large'>('normal');

  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadDocument() {
      if (!fileKey) {
        setError('No document key provided. Please return to WhatsApp.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const streamUrl = `/api/view-file?key=${encodeURIComponent(fileKey)}`;
        const res = await fetch(streamUrl);
        if (!res.ok) {
          throw new Error('Document could not be retrieved or has expired.');
        }

        const contentType = res.headers.get('content-type') || '';
        const isPdf = fileKey.toLowerCase().endsWith('.pdf') || contentType.includes('pdf');
        const isImage = /\.(jpe?g|png|webp|gif|bmp)$/i.test(fileKey) || contentType.startsWith('image/');

        if (isImage) {
          // Direct image preview
          const blob = await res.blob();
          const imgUrl = URL.createObjectURL(blob);
          blobUrlsRef.current.push(imgUrl);

          const img = new Image();
          img.src = imgUrl;
          await new Promise((resolve) => {
            img.onload = resolve;
          });

          if (isMounted) {
            setPages([{
              pageNumber: 1,
              url: imgUrl,
              width: img.naturalWidth || 800,
              height: img.naturalHeight || 1100,
            }]);
            setLoading(false);
          }
          return;
        }

        if (isPdf) {
          // Render vector PDF pages with pdfjs-dist
          const arrayBuffer = await res.arrayBuffer();
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
          const pdf = await loadingTask.promise;
          const numPages = pdf.numPages;

          const renderedPages: PagePreview[] = [];

          for (let p = 1; p <= numPages; p++) {
            if (!isMounted) break;

            const page = await pdf.getPage(p);
            // High clarity thumbnail viewport (scale: 1.0 for crisp text)
            const viewport = page.getViewport({ scale: 1.0 });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            if (context) {
              await page.render({ canvasContext: context, viewport }).promise;
              const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/jpeg', 0.85)
              );

              if (blob && isMounted) {
                const pageUrl = URL.createObjectURL(blob);
                blobUrlsRef.current.push(pageUrl);
                renderedPages.push({
                  pageNumber: p,
                  url: pageUrl,
                  width: viewport.width,
                  height: viewport.height,
                });
                // Incremental rendering so user sees early pages immediately
                setPages([...renderedPages]);
              }
              canvas.width = 0;
              canvas.height = 0;
            }
            page.cleanup();
          }

          if (isMounted) {
            setLoading(false);
          }
          await pdf.destroy();
          return;
        }

        throw new Error('Unsupported document format.');
      } catch (err: unknown) {
        console.error('Preview loading error:', err);
        if (isMounted) {
          setError((err as Error)?.message || 'Failed to render document preview.');
          setLoading(false);
        }
      }
    }

    loadDocument();

    return () => {
      isMounted = false;
      // Cleanup all object URLs
      for (const url of blobUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      blobUrlsRef.current = [];
    };
  }, [fileKey]);

  // Grid column classes based on zoomLevel
  const gridClasses = 
    zoomLevel === 'compact'
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
      : zoomLevel === 'large'
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3'; // Normal: 2-column on mobile like DoPrint

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col antialiased selection:bg-indigo-500/30">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#121215]/95 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
              <Eye className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-zinc-100 truncate flex items-center gap-1.5">
                {initialFileName}
              </h1>
              <p className="text-xs text-zinc-400 flex items-center gap-2">
                <span>{pages.length > 0 ? `${pages.length} Pages` : `${initialPages} Pages`}</span>
                <span>&bull;</span>
                <span className="text-indigo-400 font-medium capitalize">
                  {colorMode === 'bw' ? 'Black & White' : 'Full Color'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Color Mode Switcher */}
            <button
              onClick={() => setColorMode(colorMode === 'bw' ? 'color' : 'bw')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                colorMode === 'bw'
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                  : 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/30'
              }`}
              title="Toggle Print Color Mode simulation"
            >
              <Palette className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Simulation:</span>
              <span className="font-semibold">{colorMode === 'bw' ? 'B&W (₹4)' : 'Color (₹7)'}</span>
            </button>

            {/* Grid Density Switcher */}
            <div className="hidden md:flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setZoomLevel('compact')}
                className={`p-1.5 rounded text-xs ${zoomLevel === 'compact' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
                title="Compact view"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel('normal')}
                className={`p-1.5 rounded text-xs ${zoomLevel === 'normal' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
                title="2-Column view"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* WhatsApp Return Button */}
            <a
              href="https://wa.me/919362980761"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Back to WhatsApp</span>
              <span className="sm:hidden">WhatsApp</span>
            </a>
          </div>
        </div>
      </header>

      {/* Notice Banner */}
      <div className="bg-indigo-950/40 border-b border-indigo-900/30 px-4 py-2 text-center text-xs text-indigo-300 flex items-center justify-center gap-2">
        <span>💡 Tap any page to zoom full-screen. Simulated in <b>{colorMode === 'bw' ? 'Black & White' : 'Color'}</b> as it will print.</span>
      </div>

      {/* Main Pages Grid */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
        {loading && pages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
            <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-300">Rendering high-resolution preview...</p>
              <p className="text-xs text-zinc-500 mt-1">Free client-side rendering &bull; Zero extra data cost</p>
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto my-12 bg-red-950/30 border border-red-800/40 rounded-2xl p-6 text-center shadow-xl">
            <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-3 text-red-400">
              <X className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-red-200">Unable to Load Preview</h2>
            <p className="text-xs text-red-400 mt-1.5 leading-relaxed">{error}</p>
            <a
              href="https://wa.me/919362980761"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              Return to WhatsApp
            </a>
          </div>
        )}

        {/* 2-Column Responsive Grid matching DoPrint */}
        <div className={`grid ${gridClasses} gap-4 sm:gap-6`}>
          {pages.map((pg, idx) => (
            <div
              key={pg.pageNumber}
              onClick={() => {
                setSelectedPageIndex(idx);
                setLightboxZoom(1);
              }}
              className="group relative bg-[#18181b] rounded-2xl border border-zinc-800/80 hover:border-indigo-500/50 p-2.5 sm:p-3 shadow-md hover:shadow-xl transition-all cursor-pointer flex flex-col"
            >
              {/* Page Number Badge */}
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-zinc-400 group-hover:text-indigo-400 transition-colors">
                  Page {pg.pageNumber}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50 flex items-center gap-1 group-hover:bg-indigo-950/50 group-hover:text-indigo-300 transition-all">
                  <Maximize2 className="w-2.5 h-2.5" />
                  Tap to Zoom
                </span>
              </div>

              {/* Rendered Document Sheet */}
              <div className="relative w-full aspect-[1/1.414] bg-white rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
                <img
                  src={pg.url}
                  alt={`Page ${pg.pageNumber}`}
                  className="w-full h-full object-contain transition-all duration-200"
                  style={{
                    filter: colorMode === 'bw' ? 'grayscale(100%) contrast(1.06)' : 'none',
                  }}
                  loading="lazy"
                />

                {/* Subtle Hover Overlay */}
                <div className="absolute inset-0 bg-indigo-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-zinc-950/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-lg border border-zinc-700/60">
                    <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                    Enlarge Page
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Sticky Bottom Bar with Confirmation to Return */}
      <footer className="sticky bottom-0 z-20 bg-[#121215]/95 backdrop-blur-md border-t border-zinc-800/80 px-4 py-3 shadow-2xl">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Document ready to print &bull; <b>{pages.length} pages</b> formatted in{' '}
              <b className="text-indigo-400">{colorMode === 'bw' ? 'B&W' : 'Color'}</b>
            </span>
          </div>

          <a
            href="https://wa.me/919362980761?text=Proceed"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-98"
          >
            <span>Proceed to Payment (₹{Math.max(1, pages.length * (colorMode === 'color' ? 7 : 4))})</span>
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      </footer>

      {/* High-Resolution Lightbox Modal */}
      {selectedPageIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col animate-in fade-in duration-150">
          {/* Lightbox Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/80 border-b border-zinc-800/80 text-white">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">
                Page {selectedPageIndex + 1} of {pages.length}
              </span>
              <span className="text-xs text-zinc-400">
                {pages[selectedPageIndex].width} &times; {pages[selectedPageIndex].height}px
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setLightboxZoom((prev) => Math.max(0.5, prev - 0.25))}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLightboxZoom(1)}
                className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 flex items-center gap-1"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3 h-3" />
                {Math.round(lightboxZoom * 100)}%
              </button>
              <button
                onClick={() => setLightboxZoom((prev) => Math.min(3, prev + 0.25))}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button
                onClick={() => setSelectedPageIndex(null)}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-900/60 text-zinc-200 hover:text-white transition-colors ml-2"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Body with Prev / Next Navigation */}
          <div className="flex-1 relative flex items-center justify-center p-4 overflow-auto">
            {/* Previous Page Button */}
            {selectedPageIndex > 0 && (
              <button
                onClick={() => {
                  setSelectedPageIndex((prev) => (prev !== null ? prev - 1 : 0));
                  setLightboxZoom(1);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white border border-zinc-700/60 shadow-xl transition-all z-10"
                title="Previous Page"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Document Image with Zoom and B&W Filter */}
            <div className="transition-transform duration-100 flex items-center justify-center max-w-full max-h-full">
              <img
                src={pages[selectedPageIndex].url}
                alt={`Page ${selectedPageIndex + 1}`}
                className="max-w-[90vw] max-h-[82vh] object-contain rounded-lg shadow-2xl bg-white"
                style={{
                  transform: `scale(${lightboxZoom})`,
                  filter: colorMode === 'bw' ? 'grayscale(100%) contrast(1.06)' : 'none',
                  transformOrigin: 'center center',
                }}
              />
            </div>

            {/* Next Page Button */}
            {selectedPageIndex < pages.length - 1 && (
              <button
                onClick={() => {
                  setSelectedPageIndex((prev) => (prev !== null ? prev + 1 : 0));
                  setLightboxZoom(1);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white border border-zinc-700/60 shadow-xl transition-all z-10"
                title="Next Page"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DocumentPreviewContent />
    </Suspense>
  );
}
