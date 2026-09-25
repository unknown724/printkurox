'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { PageConfig, TIER_RATES } from '@/lib/pricing';
import {
  RotateCw,
  RotateCcw,
  Trash2,
  Loader2,
  FileText,
  X,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

import { EnhanceMode } from '@/lib/image-enhancer';
import { LayoutMode, FitMode, TextOverlayConfig, getTextOverlayItems } from '@/components/studio/PhotoLayoutSelector';
import { getRelativeOddEvenPages, parsePageRange } from '@/lib/pdf-utils';

export interface SheetGridConfig {
  cols: number;
  rows: number;
  isLandscapeSheet: boolean;
  dimensionText: string;
}

export function getSheetGridConfig(
  pagesPerSheet: number,
  orientation: 'auto' | 'portrait' | 'landscape',
  _autoRotate: boolean = true,
  customCols: number = 2,
  customRows: number = 2,
  isDocLandscape: boolean = false,
  isCustomLayout: boolean = false,
  layoutMode?: LayoutMode
): SheetGridConfig {
  const PORTRAIT_DIM = '8.27 x 11.69 Inches';
  const LANDSCAPE_DIM = '11.69 x 8.27 Inches';

  // Booklet mode is strictly a 2-page landscape folded sheet (cols: 2, rows: 1)
  if (layoutMode === 'booklet') {
    return {
      cols: 2,
      rows: 1,
      isLandscapeSheet: true,
      dimensionText: LANDSCAPE_DIM + (orientation === 'auto' ? ' (Auto)' : ''),
    };
  }

  // Automatically determine the optimal sheet orientation when 'auto' is selected
  let resolvedOrientation: 'portrait' | 'landscape';
  if (orientation === 'auto') {
    if (isCustomLayout) {
      if (customCols > customRows) {
        resolvedOrientation = 'landscape';
      } else if (customRows > customCols) {
        resolvedOrientation = 'portrait';
      } else {
        resolvedOrientation = isDocLandscape ? 'landscape' : 'portrait';
      }
    } else if (pagesPerSheet === 1) {
      // 1-up: sheet orientation automatically matches the document
      resolvedOrientation = isDocLandscape ? 'landscape' : 'portrait';
    } else if (pagesPerSheet === 2 || pagesPerSheet === 6 || pagesPerSheet === 8) {
      // 2-up, 6-up, 8-up: 2 docs fit best side-by-side on a landscape sheet
      resolvedOrientation = 'landscape';
    } else {
      // 4-up, 9-up, 16-up (square grids: 2x2, 3x3, 4x4): standard upright portrait sheet
      resolvedOrientation = 'portrait';
    }
  } else {
    resolvedOrientation = orientation;
  }

  const isLandscapeSheet = resolvedOrientation === 'landscape';
  const dimSuffix = orientation === 'auto' ? ' (Auto)' : '';

  if (isCustomLayout) {
    const cols = Math.max(1, customCols || 2);
    const rows = Math.max(1, customRows || 2);
    return {
      cols,
      rows,
      isLandscapeSheet,
      dimensionText: (isLandscapeSheet ? LANDSCAPE_DIM : PORTRAIT_DIM) + dimSuffix,
    };
  }

  if (pagesPerSheet === 1) {
    return {
      cols: 1,
      rows: 1,
      isLandscapeSheet,
      dimensionText: (isLandscapeSheet ? LANDSCAPE_DIM : PORTRAIT_DIM) + dimSuffix,
    };
  }

  if (pagesPerSheet === 2) {
    return {
      cols: isLandscapeSheet ? 2 : 1,
      rows: isLandscapeSheet ? 1 : 2,
      isLandscapeSheet,
      dimensionText: (isLandscapeSheet ? LANDSCAPE_DIM : PORTRAIT_DIM) + dimSuffix,
    };
  }

  if (pagesPerSheet === 4) {
    return {
      cols: 2,
      rows: 2,
      isLandscapeSheet,
      dimensionText: (isLandscapeSheet ? LANDSCAPE_DIM : PORTRAIT_DIM) + dimSuffix,
    };
  }

  if (pagesPerSheet === 6) {
    return {
      cols: isLandscapeSheet ? 3 : 2,
      rows: isLandscapeSheet ? 2 : 3,
      isLandscapeSheet,
      dimensionText: (isLandscapeSheet ? LANDSCAPE_DIM : PORTRAIT_DIM) + dimSuffix,
    };
  }

  if (pagesPerSheet === 8) {
    return {
      cols: isLandscapeSheet ? 4 : 2,
      rows: isLandscapeSheet ? 2 : 4,
      isLandscapeSheet,
      dimensionText: (isLandscapeSheet ? LANDSCAPE_DIM : PORTRAIT_DIM) + dimSuffix,
    };
  }

  if (pagesPerSheet === 9) {
    return {
      cols: 3,
      rows: 3,
      isLandscapeSheet,
      dimensionText: (isLandscapeSheet ? LANDSCAPE_DIM : PORTRAIT_DIM) + dimSuffix,
    };
  }

  if (pagesPerSheet === 16) {
    return {
      cols: 4,
      rows: 4,
      isLandscapeSheet,
      dimensionText: (isLandscapeSheet ? LANDSCAPE_DIM : PORTRAIT_DIM) + dimSuffix,
    };
  }

  return {
    cols: isLandscapeSheet ? Math.max(customCols, customRows) : Math.min(customCols, customRows),
    rows: isLandscapeSheet ? Math.min(customCols, customRows) : Math.max(customCols, customRows),
    isLandscapeSheet,
    dimensionText: (isLandscapeSheet ? LANDSCAPE_DIM : PORTRAIT_DIM) + dimSuffix,
  };
}

interface PageVisualizerProps {
  totalPages: number;
  downloadUrl?: string;
  fileKey?: string;
  rawFiles?: File[];
  pageConfigs: PageConfig[];
  onChange: (configs: PageConfig[]) => void;
  orientation?: 'auto' | 'portrait' | 'landscape';
  onOrientationChange?: (orient: 'auto' | 'portrait' | 'landscape') => void;
  enhanceMode?: EnhanceMode;
  fitMode?: FitMode;
  scaling?: 'fit' | 'actual' | 'fill' | 'custom';
  customScale?: number;
  layoutMode?: LayoutMode;
  drawBorder?: boolean;
  autoRotate?: boolean;
  pageOrder?: 'horizontal' | 'vertical';
  customCols?: number;
  customRows?: number;
  activeSheetIndex?: number;
  onSheetChange?: (index: number) => void;
  textOverlay?: TextOverlayConfig;
  onTextOverlayChange?: (updated: TextOverlayConfig) => void;
}

export function PageVisualizer({
  totalPages,
  downloadUrl,
  fileKey,
  rawFiles,
  pageConfigs,
  onChange,
  orientation = 'auto',
  onOrientationChange,
  enhanceMode = 'none',
  fitMode = 'fit',
  scaling = 'fit',
  customScale = 100,
  layoutMode = '1-up',
  drawBorder = false,
  autoRotate = true,
  pageOrder = 'horizontal',
  customCols = 2,
  customRows = 2,
  activeSheetIndex,
  onSheetChange,
  textOverlay,
  onTextOverlayChange,
}: PageVisualizerProps) {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [naturalOrientations, setNaturalOrientations] = useState<Record<number, 'portrait' | 'landscape'>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const [enlargedPage, setEnlargedPage] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'pager' | 'grid'>('pager');
  const [internalSheetIdx, setInternalSheetIdx] = useState(0);
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);
  const lastSourceSigRef = useRef<string>('');

  // Scroll to active page when continuous preview modal opens
  useEffect(() => {
    if (zoomPage !== null) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`preview-page-${zoomPage}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [zoomPage]);

  const recordNaturalOrientation = (pageNumber: number, orient: 'portrait' | 'landscape') => {
    setNaturalOrientations((prev) => {
      if (prev[pageNumber] === orient) return prev;
      return { ...prev, [pageNumber]: orient };
    });
  };
  const activeUrlsRef = useRef<string[]>([]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  // Canva-Style Drag handler for Text Overlay on Paper Canvas
  const handleTextDragStart = (e: React.MouseEvent | React.TouchEvent, targetItemId?: string) => {
    if (!textOverlay?.enabled) return;
    e.preventDefault();
    e.stopPropagation();

    const items = getTextOverlayItems(textOverlay);
    const activeId = targetItemId || textOverlay.activeItemId || items[0]?.id || 'item-1';
    setDraggingItemId(activeId);

    const onMove = (moveEvt: MouseEvent | TouchEvent) => {
      if (!sheetRef.current) return;
      const rect = sheetRef.current.getBoundingClientRect();
      const clientX = 'touches' in moveEvt ? moveEvt.touches[0].clientX : (moveEvt as MouseEvent).clientX;
      const clientY = 'touches' in moveEvt ? moveEvt.touches[0].clientY : (moveEvt as MouseEvent).clientY;

      const pctX = Math.max(3, Math.min(97, Math.round(((clientX - rect.left) / rect.width) * 100)));
      const pctY = Math.max(3, Math.min(97, Math.round(((clientY - rect.top) / rect.height) * 100)));

      const currentItems = getTextOverlayItems(textOverlay);
      const updatedItems = (currentItems.length > 0 ? currentItems : [
        {
          id: activeId,
          text: textOverlay.text || '',
          position: 'custom' as const,
          customX: pctX,
          customY: pctY,
          fontFamily: textOverlay.fontFamily || 'sans',
          fontSize: textOverlay.fontSize || 'md',
          customFontSize: textOverlay.customFontSize || 28,
          color: textOverlay.color || '#111827',
          opacity: textOverlay.opacity ?? 1.0,
          applyTo: textOverlay.applyTo || 'all_pages',
        }
      ]).map((it) => it.id === activeId ? { ...it, position: 'custom' as const, customX: pctX, customY: pctY } : it);

      const currentActive = updatedItems.find(it => it.id === activeId) || updatedItems[0];

      onTextOverlayChange?.({
        ...textOverlay,
        position: 'custom',
        customX: currentActive?.customX ?? pctX,
        customY: currentActive?.customY ?? pctY,
        activeItemId: activeId,
        items: updatedItems,
      });
    };

    const onEnd = () => {
      setDraggingItemId(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  };

  // Load document and image pages — progressive: each thumbnail appears as soon as it renders
  useEffect(() => {
    let isMounted = true;
    const sourceSig = `${fileKey || ''}_${downloadUrl || ''}_${totalPages}_${rawFiles?.map((f) => `${f.name}_${f.size}`).join(',') || ''}`;
    const isNewSource = sourceSig !== lastSourceSigRef.current;

    if (isNewSource) {
      activeUrlsRef.current.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
      activeUrlsRef.current = [];
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

        // Check if all raw files can be previewed client-side in-memory (genuine PDFs and Images)
        const canPreviewLocally =
          rawFiles &&
          rawFiles.length > 0 &&
          rawFiles.every((file) => {
            const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');
            const isImg = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
            return isPdf || isImg;
          });

        // Case A: Raw files provided in memory (PDFs and Images only)
        if (canPreviewLocally && rawFiles && rawFiles.length > 0) {
          let currentPageIdx = 1;

          for (const file of rawFiles) {
            if (!isMounted) break;
            const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');
            const isImg = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);

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
                  const natOrient: 'portrait' | 'landscape' = isNaturalLandscape ? 'landscape' : 'portrait';
                  recordNaturalOrientation(pageNumber, natOrient);

                  const targetIdx = updatedConfigs.findIndex((cfg) => cfg.pageNumber === pageNumber);
                  if (targetIdx !== -1) {
                    if (updatedConfigs[targetIdx].naturalOrientation !== natOrient || !updatedConfigs[targetIdx].orientation) {
                      updatedConfigs[targetIdx] = {
                        ...updatedConfigs[targetIdx],
                        naturalOrientation: natOrient,
                        orientation: updatedConfigs[targetIdx].orientation || natOrient,
                        rotation: updatedConfigs[targetIdx].rotation ?? 0,
                      };
                      configsChanged = true;
                    }
                  }

                  // Fast, high-quality thumbnail render (0.6 scale = crisp on mobile, lightweight memory)
                  const viewport = page.getViewport({ scale: 0.6 });
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;

                  if (context) {
                    await page.render({ canvasContext: context, viewport }).promise;
                    // Use async toBlob (runs off main thread, zero massive Base64 string allocations)
                    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
                    if (blob && isMounted) {
                      const objectUrl = URL.createObjectURL(blob);
                      activeUrlsRef.current.push(objectUrl);
                      newThumbs[pageNumber] = objectUrl;
                      setThumbnails((prev) => ({ ...prev, [pageNumber]: objectUrl }));
                    }
                    // Free canvas memory buffer immediately
                    canvas.width = 0;
                    canvas.height = 0;
                  }
                  page.cleanup();
                  currentPageIdx++;
                }
                await pdf.destroy();
              } catch (err) {
                console.warn(`PDF parse error for ${file.name}:`, err);
                currentPageIdx++;
              }
            } else if (isImg) {
              // Direct Image file (PNG, JPG, WebP) — show immediately
              if (currentPageIdx <= totalPages) {
                const pageNumber = currentPageIdx; // Capture immutable loop index
                const objectUrl = URL.createObjectURL(file);
                activeUrlsRef.current.push(objectUrl);
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
                  const natOrient: 'portrait' | 'landscape' = isImgLandscape ? 'landscape' : 'portrait';
                  recordNaturalOrientation(pageNumber, natOrient);
                  const targetIdx = updatedConfigs.findIndex((cfg) => cfg.pageNumber === pageNumber);
                  if (targetIdx !== -1) {
                    if (updatedConfigs[targetIdx].naturalOrientation !== natOrient || !updatedConfigs[targetIdx].orientation) {
                      updatedConfigs[targetIdx] = {
                        ...updatedConfigs[targetIdx],
                        naturalOrientation: natOrient,
                        orientation: updatedConfigs[targetIdx].orientation || natOrient,
                        rotation: updatedConfigs[targetIdx].rotation ?? 0,
                      };
                      configsChanged = true;
                    }
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

        // Case B: Fallback to server-converted PDF (/api/view-file or downloadUrl)
        // Flawlessly renders DOCX files, merged batches, and server-rendered documents
        const targetUrl = fileKey ? `/api/view-file?key=${encodeURIComponent(fileKey)}` : downloadUrl;
        if (targetUrl) {
          let arrayBuffer: ArrayBuffer | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const res = await fetch(targetUrl);
              if (res.ok) {
                arrayBuffer = await res.arrayBuffer();
                if (arrayBuffer && arrayBuffer.byteLength > 0) break;
              }
            } catch (err) {
              console.warn(`TargetUrl attempt ${attempt + 1} failed:`, err);
            }
            if (attempt < 2) await new Promise((r) => setTimeout(r, 350));
          }

          if (!arrayBuffer && downloadUrl && downloadUrl !== targetUrl) {
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const res = await fetch(downloadUrl);
                if (res.ok) {
                  arrayBuffer = await res.arrayBuffer();
                  if (arrayBuffer && arrayBuffer.byteLength > 0) break;
                }
              } catch (err) {
                console.warn(`DownloadUrl attempt ${attempt + 1} failed:`, err);
              }
              if (attempt < 1) await new Promise((r) => setTimeout(r, 350));
            }
          }

          if (arrayBuffer) {
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
            const pdf = await loadingTask.promise;
            const pageCount = Math.min(pdf.numPages, totalPages || pdf.numPages);

          for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            if (!isMounted) break;
            const thisPage = pageNum;
            try {
              const page = await pdf.getPage(thisPage);
              const unscaled = page.getViewport({ scale: 1.0 });
              const isNaturalLandscape = unscaled.width > unscaled.height;
              const natOrient: 'portrait' | 'landscape' = isNaturalLandscape ? 'landscape' : 'portrait';
              recordNaturalOrientation(thisPage, natOrient);

              const targetIdx = updatedConfigs.findIndex((cfg) => cfg.pageNumber === thisPage);
              if (targetIdx !== -1) {
                if (updatedConfigs[targetIdx].naturalOrientation !== natOrient || !updatedConfigs[targetIdx].orientation) {
                  updatedConfigs[targetIdx] = {
                    ...updatedConfigs[targetIdx],
                    naturalOrientation: natOrient,
                    orientation: updatedConfigs[targetIdx].orientation || natOrient,
                    rotation: updatedConfigs[targetIdx].rotation ?? 0,
                  };
                  configsChanged = true;
                }
              }

              const viewport = page.getViewport({ scale: 0.6 });
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              if (context) {
                await page.render({ canvasContext: context, viewport }).promise;
                const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
                if (blob && isMounted) {
                  const objectUrl = URL.createObjectURL(blob);
                  activeUrlsRef.current.push(objectUrl);
                  newThumbs[thisPage] = objectUrl;
                  setThumbnails((prev) => ({ ...prev, [thisPage]: objectUrl }));
                }
                canvas.width = 0;
                canvas.height = 0;
              }
              page.cleanup();
            } catch (err) {
              console.warn(`Fallback render error for page ${thisPage}:`, err);
            }
          }
          await pdf.destroy();
          if (isMounted && configsChanged) {
            onChange(updatedConfigs);
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
      activeUrlsRef.current.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
      activeUrlsRef.current = [];
    };
  }, [rawFiles, downloadUrl, fileKey, totalPages]);

  // Bulk actions
  const setAllColor = (colorMode: 'bw' | 'color') => {
    const updated = pageConfigs.map((p) => ({ ...p, colorMode }));
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

  // Toggle page inclusion (Delete / Restore page from printing)
  const togglePageIncluded = (pageNumber: number) => {
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        return { ...p, included: !p.included };
      }
      return p;
    });
    onChange(updated);
  };

  // Restore all excluded/deleted pages
  const restoreAllPages = () => {
    const updated = pageConfigs.map((p) => ({ ...p, included: true }));
    onChange(updated);
  };

  // Select Odd pages relative to current active sequence (e.g. 4-11 -> 4, 6, 8, 10)
  const selectOddPages = () => {
    const active = pageConfigs.filter((p) => p.included).map((p) => p.pageNumber);
    const base = active.length > 0 ? active : Array.from({ length: totalPages }, (_, i) => i + 1);
    const oddPages = getRelativeOddEvenPages(base, 'odd');
    onChange(pageConfigs.map((p) => ({ ...p, included: oddPages.includes(p.pageNumber) })));
  };

  // Select Even pages relative to current active sequence (e.g. 4-11 -> 5, 7, 9, 11)
  const selectEvenPages = () => {
    const active = pageConfigs.filter((p) => p.included).map((p) => p.pageNumber);
    const base = active.length > 0 ? active : Array.from({ length: totalPages }, (_, i) => i + 1);
    const evenPages = getRelativeOddEvenPages(base, 'even');
    onChange(pageConfigs.map((p) => ({ ...p, included: evenPages.includes(p.pageNumber) })));
  };

  // Prompt to delete / exclude range of pages (e.g. 1-3, 12-14)
  const deletePageRangePrompt = () => {
    const val = prompt('Enter page numbers or range to delete/exclude (e.g. 1-3, 12-14):');
    if (!val) return;
    const toExclude = parsePageRange(val, totalPages);
    if (toExclude.length > 0) {
      onChange(pageConfigs.map((p) => (toExclude.includes(p.pageNumber) ? { ...p, included: false } : p)));
    }
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

  // Per-page scale modifier
  const setPageCustomScale = (pageNumber: number, newScale: number) => {
    const clamped = Math.max(10, Math.min(500, newScale));
    const updated = pageConfigs.map((p) => {
      if (p.pageNumber === pageNumber) {
        return { ...p, customScale: clamped };
      }
      return p;
    });
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

  const isCustomLayout = layoutMode === 'custom';
  const pagesPerSheet = isCustomLayout
    ? Math.max(1, (customCols || 2) * (customRows || 2))
    : layoutMode === 'id-card' || layoutMode === '2-up' || layoutMode === 'booklet'
    ? 2
    : layoutMode === '4-up'
    ? 4
    : layoutMode === '6-up'
    ? 6
    : layoutMode === '8-up'
    ? 8
    : layoutMode === '9-up'
    ? 9
    : layoutMode === '16-up'
    ? 16
    : 1;

  const isMerged = pagesPerSheet > 1;
  const sheetChunks: PageConfig[][] = useMemo(() => {
    const chunks: PageConfig[][] = [];
    for (let i = 0; i < pageConfigs.length; i += pagesPerSheet) {
      chunks.push(pageConfigs.slice(i, i + pagesPerSheet));
    }
    return chunks;
  }, [pageConfigs, pagesPerSheet]);

  const totalSheets = Math.max(1, sheetChunks.length);
  const effectiveSheetCount = Math.ceil(includedPagesCount / pagesPerSheet);

  const currentSheetIndex = Math.min(
    totalSheets - 1,
    Math.max(0, activeSheetIndex !== undefined ? activeSheetIndex : internalSheetIdx)
  );

  const setCurrentSheetIndex = (idx: number) => {
    const clamped = Math.min(totalSheets - 1, Math.max(0, idx));
    setInternalSheetIdx(clamped);
    if (onSheetChange) onSheetChange(clamped);
  };

  const activeSheetItems = useMemo(
    () => sheetChunks[currentSheetIndex] || [],
    [sheetChunks, currentSheetIndex]
  );

  // Auto-sync selectedPageNum to the active sheet's primary page when sheet changes
  useEffect(() => {
    if (activeSheetItems.length > 0) {
      const isSelectedOnCurrentSheet = activeSheetItems.some(
        (item) => item && item.pageNumber === selectedPageNum
      );
      if (!isSelectedOnCurrentSheet && activeSheetItems[0]) {
        setSelectedPageNum(activeSheetItems[0].pageNumber);
      }
    }
  }, [currentSheetIndex, activeSheetItems, selectedPageNum]);
  const getPageEffectiveOrientation = (cfg?: PageConfig | null): 'portrait' | 'landscape' => {
    if (!cfg) return 'portrait';
    const detected = naturalOrientations[cfg.pageNumber];
    const base: 'portrait' | 'landscape' =
      cfg.orientation ||
      cfg.naturalOrientation ||
      detected ||
      'portrait';

    const rot = cfg.rotation || 0;
    if (rot % 180 === 90) {
      return base === 'landscape' ? 'portrait' : 'landscape';
    }
    return base;
  };

  const getLiveFilter = (colorMode: 'bw' | 'color', enhance: EnhanceMode = 'none') => {
    if (enhance === 'magic_bw') {
      return 'grayscale(100%) contrast(155%) brightness(110%)';
    }
    if (enhance === 'grayscale') {
      return 'grayscale(100%) contrast(130%) brightness(105%)';
    }
    if (enhance === 'color_boost') {
      return colorMode === 'bw'
        ? 'grayscale(100%) contrast(135%) brightness(105%)'
        : 'contrast(125%) brightness(108%) saturate(135%)';
    }
    if (colorMode === 'bw') {
      return 'grayscale(100%) contrast(125%) brightness(96%)';
    }
    return 'none';
  };

  const activePageCfg =
    (selectedPageNum !== undefined && activeSheetItems.some((p) => p.pageNumber === selectedPageNum)
      ? pageConfigs.find((p) => p.pageNumber === selectedPageNum)
      : null) ||
    activeSheetItems[0] ||
    pageConfigs[0];

  const currentEffectiveOrient = getPageEffectiveOrientation(activePageCfg);

  const landscapeCount = activeSheetItems.filter((p) => getPageEffectiveOrientation(p) === 'landscape').length;
  const isDocLandscape = landscapeCount > activeSheetItems.length / 2;

  const gridConfig = getSheetGridConfig(
    pagesPerSheet,
    orientation,
    autoRotate,
    customCols,
    customRows,
    isDocLandscape,
    isCustomLayout,
    layoutMode
  );

  const isSheetLandscape = layoutMode === 'booklet'
    ? true
    : orientation === 'landscape'
    ? true
    : orientation === 'portrait'
    ? false
    : pagesPerSheet === 1 && !isCustomLayout
    ? currentEffectiveOrient === 'landscape'
    : gridConfig.isLandscapeSheet;

  const currentDimensionText =
    (isSheetLandscape ? '11.69 x 8.27 Inches' : '8.27 x 11.69 Inches') +
    (orientation === 'auto' ? ' (Auto)' : '');

  const activeCells: (PageConfig | null)[] = [];
  for (let r = 0; r < gridConfig.rows; r++) {
    for (let c = 0; c < gridConfig.cols; c++) {
      let itemIdx: number;
      if (pageOrder === 'vertical') {
        // Vertical: column-first (col * rows + row)
        itemIdx = c * gridConfig.rows + r;
      } else {
        // Horizontal: row-first (row * cols + col)
        itemIdx = r * gridConfig.cols + c;
      }
      activeCells.push(itemIdx < activeSheetItems.length ? activeSheetItems[itemIdx] : null);
    }
  }

  return (
    <div className="rounded-2xl p-2.5 sm:p-3 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-2 sm:space-y-2.5 shadow-2xs">
      {/* Top Toolbar: Bulk Actions & Document Stats */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-200/80 dark:border-[#282a2c]">
        {/* Total Impressions Stats Tag & Quick Restore All */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{includedPagesCount}</span>
            {pageConfigs.length > 0 && includedPagesCount !== pageConfigs.length ? ` of ${pageConfigs.length}` : ''} pgs •{' '}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {isMerged ? effectiveSheetCount : totalCopiesCount}
            </span>{' '}
            total sheet{(isMerged ? effectiveSheetCount : totalCopiesCount) !== 1 ? 's' : ''}
          </div>

          {pageConfigs.length > 0 && includedPagesCount < pageConfigs.length && (
            <button
              type="button"
              onClick={restoreAllPages}
              className="px-2 py-0.5 rounded-full text-[11px] font-semibold border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              title="Click to restore all deleted pages"
            >
              <RotateCcw className="w-2.5 h-2.5 text-rose-500" />
              <span>{pageConfigs.length - includedPagesCount} deleted · Restore All</span>
            </button>
          )}
        </div>

        {/* View Mode Toggle & Quick Bulk Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {/* Full Page High-Res Preview Eye Button */}
          <button
            type="button"
            onClick={() => {
              setZoomPage(selectedPageNum || 1);
            }}
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-blue-200 dark:border-blue-900/50 bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Inspect current page in Full Screen High Resolution"
          >
            <Eye className="w-3 h-3 text-blue-500" />
            <span>Full View</span>
          </button>

          {/* View Mode Switcher */}
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'pager' ? 'grid' : 'pager')}
            className="px-2 py-0.5 rounded-full text-[11px] font-medium border border-zinc-200 dark:border-[#282a2c] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1 cursor-pointer"
            title={viewMode === 'pager' ? 'Switch to All Sheets Grid' : 'Switch to Single Sheet Pager'}
          >
            {viewMode === 'pager' ? (
              <>
                <LayoutGrid className="w-3 h-3 text-blue-500" />
                <span className="hidden sm:inline">All Sheets</span>
              </>
            ) : (
              <>
                <FileText className="w-3 h-3 text-blue-500" />
                <span className="hidden sm:inline">Single Sheet</span>
              </>
            )}
          </button>

          {/* All B&W with Live Pulsing / Flickering Green Dot */}
          {(() => {
            const isAllBwActive = colorPagesCount === 0 && (bwPagesCount > 0 || includedPagesCount > 0);
            return (
              <button
                type="button"
                onClick={() => setAllColor('bw')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                  isAllBwActive
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs ring-1 ring-emerald-500/40'
                    : 'bg-zinc-100/80 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-400'
                }`}
                title="Set all pages to Black & White"
              >
                {isAllBwActive ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)] animate-pulse"></span>
                  </span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 opacity-60" />
                )}
                <span>All B&amp;W</span>
              </button>
            );
          })()}

          {/* All Color with Live Pulsing / Flickering Green Dot */}
          {(() => {
            const isAllColorActive = colorPagesCount > 0 && colorPagesCount === includedPagesCount;
            return (
              <button
                type="button"
                onClick={() => setAllColor('color')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                  isAllColorActive
                    ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white border-transparent shadow-xs ring-2 ring-emerald-400/50'
                    : 'bg-zinc-100/80 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-400'
                }`}
                title="Set all pages to Full Color"
              >
                {isAllColorActive ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)] animate-pulse"></span>
                  </span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 opacity-70" />
                )}
                <span>All Color</span>
              </button>
            );
          })()}

          {pageConfigs.some((p) => p.customScale !== undefined && p.customScale !== 100) && (
            <button
              type="button"
              onClick={() => {
                const updated = pageConfigs.map((p) => {
                  const next = { ...p };
                  delete next.customScale;
                  return next;
                });
                onChange(updated);
              }}
              className="px-2 py-0.5 rounded-full text-[11px] font-medium border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors cursor-pointer"
              title="Reset all custom page scales to 100%"
            >
              ↺ Reset Scale
            </button>
          )}
        </div>
      </div>

      {/* ========================================================
          MODE 1: SINGLE SHEET PAGER (Adobe Acrobat Interactive Studio)
          ======================================================== */}
      {viewMode === 'pager' ? (
        <div className="space-y-1.5">
          {/* Dimension Header (Matching Adobe Acrobat) */}
          <div className="flex items-center justify-center gap-2 text-[11px] font-mono font-medium text-zinc-500 dark:text-zinc-400 select-none">
            {pagesPerSheet === 1 && !isCustomLayout && isSheetLandscape !== (currentEffectiveOrient === 'landscape') && (
              <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/90 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold text-[10px]">
                Scale: {scaling === 'actual' ? '100%' : '69%'}
              </span>
            )}
            <span>
              {layoutMode === 'booklet'
                ? `11.69 x 8.27 Inches • A4 · Booklet Spread (2-Up Folded)`
                : layoutMode === 'poster'
                ? `${gridConfig.dimensionText} • A4 · Poster (Tiled Grid)`
                : pagesPerSheet === 1 && !isCustomLayout
                ? `${currentDimensionText} • A4 · 1-Up`
                : isCustomLayout
                ? `${gridConfig.dimensionText} • A4 · Custom (${gridConfig.cols}x${gridConfig.rows})`
                : `${gridConfig.dimensionText} • A4 · ${pagesPerSheet}-Up`}
            </span>
          </div>

          {/* Physical Sheet Canvas Container */}
          <div className="p-2.5 sm:p-4 flex items-center justify-center bg-zinc-100/80 dark:bg-[#121316] rounded-xl relative border border-zinc-200/80 dark:border-[#282a2c] overflow-hidden h-[280px] sm:h-[330px] md:h-[380px] lg:h-[470px] xl:h-[510px] w-full">
            {/* The Physical Paper Sheet */}
            <div
              ref={sheetRef}
              className={`relative bg-white text-zinc-900 shadow-xl shadow-black/20 dark:shadow-black/60 rounded-[3px] border border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-between p-1.5 sm:p-2 transition-all duration-300 select-none ${
                isSheetLandscape
                  ? 'h-[190px] sm:h-[230px] md:h-[270px] lg:h-[330px] xl:h-[365px] aspect-[297/210] max-w-full w-auto'
                  : 'h-[245px] sm:h-[290px] md:h-[340px] lg:h-[425px] xl:h-[465px] aspect-[210/297] max-w-full w-auto'
              }`}
            >
                  {/* Canva-Style Live Interactive Multi-Text Overlay Layer */}
                  {(() => {
                    const overlayItems = getTextOverlayItems(textOverlay);
                    if (!textOverlay?.enabled) return null;
                    if (overlayItems.length === 0) return null;

                    const isFirstSheet = currentSheetIndex === 0;
                    const isLastSheet = currentSheetIndex === sheetChunks.length - 1;

                    return (
                      <>
                        {overlayItems.map((item) => {
                          if (!item.text?.trim()) return null;

                          const shouldRender =
                            item.applyTo === 'all_pages' ||
                            (item.applyTo === 'first_page' && isFirstSheet) ||
                            (item.applyTo === 'last_page' && isLastSheet);

                          if (!shouldRender) return null;

                          const isDraggingThis = draggingItemId === item.id;

                          const getOverlayFontSize = (baseDefault: number) => {
                            let pt: number;
                            if (item.fontSize === 'custom' || item.customFontSize) {
                              pt = item.customFontSize || 28;
                            } else if (item.fontSize === 'xl') {
                              pt = item.position === 'watermark' ? 52 : Math.round(baseDefault * 1.8);
                            } else if (item.fontSize === 'lg') {
                              pt = item.position === 'watermark' ? 42 : Math.round(baseDefault * 1.4);
                            } else if (item.fontSize === 'md') {
                              pt = item.position === 'watermark' ? 32 : Math.round(baseDefault * 1.0);
                            } else {
                              pt = item.position === 'watermark' ? 24 : Math.round(baseDefault * 0.75);
                            }
                            // Proportional scaling for preview sheet (1pt ~ 0.65px).
                            // Allows 4pt, 6pt, 8pt to visibly shrink down cleanly without clamping at 8px.
                            const px = Math.max(2.5, Math.min(160, +(pt * 0.65).toFixed(1)));
                            return `${px}px`;
                          };

                          const fontClass =
                            item.fontFamily === 'serif'
                              ? 'font-serif'
                              : item.fontFamily === 'mono'
                              ? 'font-mono'
                              : item.fontFamily === 'display'
                              ? 'font-sans font-black tracking-tight uppercase'
                              : item.fontFamily === 'handwriting'
                              ? 'font-serif italic font-semibold tracking-wide'
                              : item.fontFamily === 'geometric'
                              ? 'font-mono font-bold tracking-widest uppercase'
                              : 'font-sans font-semibold';

                          if (item.position === 'watermark') {
                            return (
                              <div
                                key={item.id}
                                onMouseDown={(e) => handleTextDragStart(e, item.id)}
                                onTouchStart={(e) => handleTextDragStart(e, item.id)}
                                onClick={() => onTextOverlayChange?.({ ...textOverlay, activeItemId: item.id })}
                                className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none group"
                                title="Click & drag to reposition watermark"
                              >
                                <span
                                  className={`uppercase font-black tracking-widest text-center transform -rotate-45 transition-transform group-hover:scale-105 whitespace-pre-line ${fontClass}`}
                                  style={{
                                    color: item.color || '#dc2626',
                                    opacity: item.opacity ?? 0.18,
                                    fontSize: getOverlayFontSize(24),
                                  }}
                                >
                                  {item.text}
                                </span>
                              </div>
                            );
                          }

                          if (item.position === 'cover_title') {
                            return (
                              <div
                                key={item.id}
                                onMouseDown={(e) => handleTextDragStart(e, item.id)}
                                onTouchStart={(e) => handleTextDragStart(e, item.id)}
                                onClick={() => onTextOverlayChange?.({ ...textOverlay, activeItemId: item.id })}
                                className="absolute inset-x-2 top-2 sm:top-3 z-30 flex flex-col items-center text-center cursor-grab active:cursor-grabbing select-none group"
                                title="Drag to reposition anywhere"
                              >
                                <div
                                  className={`w-full max-w-[92%] px-1 py-0.5 rounded transition-all ${
                                    isDraggingThis
                                      ? 'ring-1 ring-dashed ring-blue-500'
                                      : 'group-hover:ring-1 group-hover:ring-dashed group-hover:ring-blue-400/60'
                                  }`}
                                >
                                  <p
                                    className={`font-black tracking-tight leading-tight uppercase text-zinc-900 whitespace-pre-line ${fontClass}`}
                                    style={{
                                      color: item.color || '#111827',
                                      fontSize: getOverlayFontSize(11),
                                    }}
                                  >
                                    {item.text}
                                  </p>
                                </div>
                              </div>
                            );
                          }

                          if (item.position === 'middle') {
                            return (
                              <div
                                key={item.id}
                                onMouseDown={(e) => handleTextDragStart(e, item.id)}
                                onTouchStart={(e) => handleTextDragStart(e, item.id)}
                                onClick={() => onTextOverlayChange?.({ ...textOverlay, activeItemId: item.id })}
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center text-center cursor-grab active:cursor-grabbing select-none group max-w-[90%]"
                                title="Drag to reposition text anywhere on paper"
                              >
                                <div
                                  className={`px-1 py-0.5 rounded transition-all ${
                                    isDraggingThis
                                      ? 'ring-1 ring-dashed ring-blue-500'
                                      : 'group-hover:ring-1 group-hover:ring-dashed group-hover:ring-blue-400/60'
                                  }`}
                                >
                                  <span
                                    className={`leading-tight tracking-wide block max-w-full text-zinc-900 whitespace-pre-line ${fontClass}`}
                                    style={{
                                      color: item.color || '#111827',
                                      fontSize: getOverlayFontSize(12),
                                    }}
                                  >
                                    {item.text}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          if (item.position === 'header') {
                            return (
                              <div
                                key={item.id}
                                onMouseDown={(e) => handleTextDragStart(e, item.id)}
                                onTouchStart={(e) => handleTextDragStart(e, item.id)}
                                onClick={() => onTextOverlayChange?.({ ...textOverlay, activeItemId: item.id })}
                                className="absolute top-1 inset-x-2 z-30 flex justify-center cursor-grab active:cursor-grabbing select-none group"
                                title="Drag to reposition text anywhere on paper"
                              >
                                <span
                                  className={`px-1 py-0.5 rounded text-center tracking-wide uppercase max-w-full transition-all group-hover:ring-1 group-hover:ring-dashed group-hover:ring-blue-400/60 text-zinc-900 whitespace-pre-line ${fontClass}`}
                                  style={{
                                    color: item.color || '#111827',
                                    fontSize: getOverlayFontSize(9),
                                  }}
                                >
                                  {item.text}
                                </span>
                              </div>
                            );
                          }

                          if (item.position === 'footer') {
                            return (
                              <div
                                key={item.id}
                                onMouseDown={(e) => handleTextDragStart(e, item.id)}
                                onTouchStart={(e) => handleTextDragStart(e, item.id)}
                                onClick={() => onTextOverlayChange?.({ ...textOverlay, activeItemId: item.id })}
                                className="absolute bottom-1 inset-x-2 z-30 flex justify-center cursor-grab active:cursor-grabbing select-none group"
                                title="Drag to reposition text anywhere on paper"
                              >
                                <span
                                  className={`px-1 py-0.5 rounded text-center tracking-wide max-w-full transition-all group-hover:ring-1 group-hover:ring-dashed group-hover:ring-blue-400/60 text-zinc-900 whitespace-pre-line ${fontClass}`}
                                  style={{
                                    color: item.color || '#111827',
                                    fontSize: getOverlayFontSize(8.5),
                                  }}
                                >
                                  {item.text}
                                </span>
                              </div>
                            );
                          }

                          if (item.position === 'custom') {
                            const posX = item.customX ?? 50;
                            const posY = item.customY ?? 50;
                            return (
                              <div
                                key={item.id}
                                onMouseDown={(e) => handleTextDragStart(e, item.id)}
                                onTouchStart={(e) => handleTextDragStart(e, item.id)}
                                onClick={() => onTextOverlayChange?.({ ...textOverlay, activeItemId: item.id })}
                                style={{ left: `${posX}%`, top: `${posY}%` }}
                                className="absolute -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center text-center cursor-grab active:cursor-grabbing select-none group max-w-[92%]"
                                title="Drag to reposition text anywhere on paper"
                              >
                                <div
                                  className={`relative px-1 py-0.5 rounded transition-all ${
                                    isDraggingThis
                                      ? 'ring-1 ring-dashed ring-blue-500'
                                      : 'group-hover:ring-1 group-hover:ring-dashed group-hover:ring-blue-400/60'
                                  }`}
                                >
                                  <span
                                    className={`leading-tight tracking-wide block max-w-full text-zinc-900 whitespace-pre-line ${fontClass}`}
                                    style={{
                                      color: item.color || '#111827',
                                      fontSize: getOverlayFontSize(12),
                                    }}
                                  >
                                    {item.text}
                                  </span>
                                  {isDraggingThis && (
                                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-mono font-bold whitespace-nowrap shadow-xs pointer-events-none">
                                      X:{posX}% Y:{posY}%
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          return null;
                        })}
                      </>
                    );
                  })()}
              {/* ID Card 2-in-1 Specialty Layout */}
              {layoutMode === 'id-card' ? (
                <div className="w-full h-full flex flex-col justify-between py-1 relative">
                  {/* Top Card: Front */}
                  {activeSheetItems[0] && (
                    <div
                      onClick={() => setSelectedPageNum(activeSheetItems[0].pageNumber)}
                      onDoubleClick={() => thumbnails[activeSheetItems[0].pageNumber] && setZoomPage(activeSheetItems[0].pageNumber)}
                      className={`w-full h-[47%] relative rounded-[2px] border bg-white cursor-pointer overflow-hidden flex items-center justify-center transition-all ${
                        activePageCfg?.pageNumber === activeSheetItems[0].pageNumber
                          ? 'border-blue-600 ring-2 ring-blue-600/30'
                          : drawBorder ? 'border-dashed border-amber-500/80' : 'border-zinc-200'
                      } ${!activeSheetItems[0].included ? 'opacity-40 grayscale' : ''}`}
                    >
                      <span
                        className={`absolute top-1 left-1 z-10 text-[8px] font-mono font-bold px-1 py-0.5 rounded ${
                          !activeSheetItems[0].included
                            ? 'bg-rose-600 text-white line-through'
                            : 'bg-zinc-900/85 text-white'
                        }`}
                      >
                        #{activeSheetItems[0].pageNumber} FRONT
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPageColor(activeSheetItems[0].pageNumber, activeSheetItems[0].colorMode === 'bw' ? 'color' : 'bw');
                        }}
                        className={`absolute top-1 right-1 z-10 text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                          activeSheetItems[0].colorMode === 'bw' ? 'bg-zinc-900 text-white' : 'bg-gradient-to-r from-blue-500 to-pink-500 text-white'
                        }`}
                      >
                        {activeSheetItems[0].colorMode === 'bw' ? 'B&W' : 'Color'}
                      </button>

                      {/* Quick Delete Button */}
                      {activeSheetItems[0].included && (
                        <div className="absolute bottom-1 left-1 z-20 flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePageIncluded(activeSheetItems[0].pageNumber);
                            }}
                            className="p-1 rounded-md bg-zinc-900/80 hover:bg-rose-600 text-zinc-300 hover:text-white shadow-2xs transition-all cursor-pointer"
                            title={`Delete Page #${activeSheetItems[0].pageNumber}`}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}

                      {thumbnails[activeSheetItems[0].pageNumber] && (
                        <img
                          src={thumbnails[activeSheetItems[0].pageNumber]}
                          alt="Front"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              recordNaturalOrientation(
                                activeSheetItems[0].pageNumber,
                                img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait'
                              );
                            }
                          }}
                          style={{
                            filter: getLiveFilter(activeSheetItems[0].colorMode, enhanceMode),
                            transform: `scale(${Math.max(10, Math.min(400, activeSheetItems[0].customScale ?? customScale ?? 100)) / 100})`,
                            transformOrigin: 'center center',
                          }}
                          className="max-w-full max-h-full object-contain p-1 transition-all duration-150"
                        />
                      )}

                      {/* Excluded / Deleted Mask */}
                      {!activeSheetItems[0].included && (
                        <div
                          className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1 z-30 p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPageNum(activeSheetItems[0].pageNumber);
                          }}
                        >
                          <span className="text-[8px] font-semibold text-rose-300 px-1.5 py-0.5 rounded bg-zinc-900/90 border border-rose-500/30 flex items-center gap-1">
                            <Trash2 className="w-2 h-2 text-rose-400" />
                            Deleted
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePageIncluded(activeSheetItems[0].pageNumber);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-zinc-100 text-zinc-900 text-[8px] font-bold shadow-xs cursor-pointer"
                          >
                            <RotateCcw className="w-2 h-2 text-emerald-600" />
                            <span>Restore</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cut Line */}
                  <div className="w-full border-t border-dashed border-zinc-300 relative my-0.5">
                    {drawBorder && (
                      <span className="absolute left-1/2 -translate-x-1/2 -top-2 text-[7px] font-mono text-amber-600 bg-white px-1">
                        ✂ Cut Line
                      </span>
                    )}
                  </div>

                  {/* Bottom Card: Back */}
                  {activeSheetItems[1] ? (
                    <div
                      onClick={() => setSelectedPageNum(activeSheetItems[1].pageNumber)}
                      onDoubleClick={() => thumbnails[activeSheetItems[1].pageNumber] && setZoomPage(activeSheetItems[1].pageNumber)}
                      className={`w-full h-[47%] relative rounded-[2px] border bg-white cursor-pointer overflow-hidden flex items-center justify-center transition-all ${
                        activePageCfg?.pageNumber === activeSheetItems[1].pageNumber
                          ? 'border-blue-600 ring-2 ring-blue-600/30'
                          : drawBorder ? 'border-dashed border-amber-500/80' : 'border-zinc-200'
                      } ${!activeSheetItems[1].included ? 'opacity-40 grayscale' : ''}`}
                    >
                      <span
                        className={`absolute top-1 left-1 z-10 text-[8px] font-mono font-bold px-1 py-0.5 rounded ${
                          !activeSheetItems[1].included
                            ? 'bg-rose-600 text-white line-through'
                            : 'bg-zinc-900/85 text-white'
                        }`}
                      >
                        #{activeSheetItems[1].pageNumber} BACK
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPageColor(activeSheetItems[1].pageNumber, activeSheetItems[1].colorMode === 'bw' ? 'color' : 'bw');
                        }}
                        className={`absolute top-1 right-1 z-10 text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                          activeSheetItems[1].colorMode === 'bw' ? 'bg-zinc-900 text-white' : 'bg-gradient-to-r from-blue-500 to-pink-500 text-white'
                        }`}
                      >
                        {activeSheetItems[1].colorMode === 'bw' ? 'B&W' : 'Color'}
                      </button>

                      {/* Quick Delete Button */}
                      {activeSheetItems[1].included && (
                        <div className="absolute bottom-1 left-1 z-20 flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePageIncluded(activeSheetItems[1].pageNumber);
                            }}
                            className="p-1 rounded-md bg-zinc-900/80 hover:bg-rose-600 text-zinc-300 hover:text-white shadow-2xs transition-all cursor-pointer"
                            title={`Delete Page #${activeSheetItems[1].pageNumber}`}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}

                      {thumbnails[activeSheetItems[1].pageNumber] && (
                        <img
                          src={thumbnails[activeSheetItems[1].pageNumber]}
                          alt="Back"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              recordNaturalOrientation(
                                activeSheetItems[1].pageNumber,
                                img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait'
                              );
                            }
                          }}
                          style={{
                            filter: getLiveFilter(activeSheetItems[1].colorMode, enhanceMode),
                            transform: `scale(${Math.max(10, Math.min(400, activeSheetItems[1].customScale ?? customScale ?? 100)) / 100})`,
                            transformOrigin: 'center center',
                          }}
                          className="max-w-full max-h-full object-contain p-1 transition-all duration-150"
                        />
                      )}

                      {/* Excluded / Deleted Mask */}
                      {!activeSheetItems[1].included && (
                        <div
                          className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1 z-30 p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPageNum(activeSheetItems[1].pageNumber);
                          }}
                        >
                          <span className="text-[8px] font-semibold text-rose-300 px-1.5 py-0.5 rounded bg-zinc-900/90 border border-rose-500/30 flex items-center gap-1">
                            <Trash2 className="w-2 h-2 text-rose-400" />
                            Deleted
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePageIncluded(activeSheetItems[1].pageNumber);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-zinc-100 text-zinc-900 text-[8px] font-bold shadow-xs cursor-pointer"
                          >
                            <RotateCcw className="w-2 h-2 text-emerald-600" />
                            <span>Restore</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-[47%] rounded-[2px] border border-dashed border-zinc-300 flex items-center justify-center text-zinc-400 text-[8px]">
                      Slot #2 Empty
                    </div>
                  )}
                </div>
              ) : layoutMode === 'booklet' ? (
                /* Booklet 2-Page Folded Spread */
                <div className="w-full h-full flex flex-row items-center justify-between p-1.5 relative bg-white select-none">
                  {/* Left Page */}
                  <div
                    onClick={() => activeSheetItems[0] && setSelectedPageNum(activeSheetItems[0].pageNumber)}
                    onDoubleClick={() => activeSheetItems[0] && thumbnails[activeSheetItems[0].pageNumber] && setZoomPage(activeSheetItems[0].pageNumber)}
                    className={`w-[48.5%] h-full relative rounded-[2px] border bg-white overflow-hidden flex items-center justify-center cursor-pointer group shadow-2xs transition-all ${
                      activePageCfg?.pageNumber === activeSheetItems[0]?.pageNumber
                        ? 'border-blue-600 ring-2 ring-blue-600/30'
                        : 'border-zinc-200 hover:border-zinc-300'
                    } ${activeSheetItems[0] && !activeSheetItems[0].included ? 'opacity-40 grayscale' : ''}`}
                  >
                    {activeSheetItems[0] ? (
                      <div className="w-full h-full relative flex items-center justify-center">
                        <span
                          className={`absolute top-1 left-1 z-10 text-[8px] font-mono font-bold px-1 py-0.5 rounded ${
                            !activeSheetItems[0].included ? 'bg-rose-600 text-white line-through' : 'bg-blue-600 text-white'
                          } shadow-2xs`}
                        >
                          #{activeSheetItems[0].pageNumber} (Left)
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPageColor(activeSheetItems[0].pageNumber, activeSheetItems[0].colorMode === 'bw' ? 'color' : 'bw');
                          }}
                          className={`absolute top-1 right-1 z-10 text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-2xs cursor-pointer ${
                            activeSheetItems[0].colorMode === 'bw' ? 'bg-zinc-900 text-white' : 'bg-gradient-to-r from-blue-500 to-pink-500 text-white'
                          }`}
                        >
                          {activeSheetItems[0].colorMode === 'bw' ? 'B&W' : 'Color'}
                        </button>

                        {/* Quick Delete Button */}
                        {activeSheetItems[0].included && (
                          <div className="absolute bottom-1 left-1 z-20 flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePageIncluded(activeSheetItems[0].pageNumber);
                              }}
                              className="p-1 rounded-md bg-zinc-900/80 hover:bg-rose-600 text-zinc-300 hover:text-white shadow-2xs transition-all cursor-pointer"
                              title={`Delete Page #${activeSheetItems[0].pageNumber}`}
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}

                        {thumbnails[activeSheetItems[0].pageNumber] ? (
                          <img
                            src={thumbnails[activeSheetItems[0].pageNumber]}
                            alt={`Page #${activeSheetItems[0].pageNumber}`}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            onLoad={(e) => {
                              const img = e.currentTarget;
                              if (img.naturalWidth && img.naturalHeight) {
                                recordNaturalOrientation(
                                  activeSheetItems[0].pageNumber,
                                  img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait'
                                );
                              }
                            }}
                            style={{
                              filter: getLiveFilter(activeSheetItems[0].colorMode, enhanceMode),
                              transform: `scale(${Math.max(10, Math.min(400, activeSheetItems[0].customScale ?? customScale ?? 100)) / 100})`,
                              transformOrigin: 'center center',
                            }}
                            className="max-w-full max-h-full object-contain p-1 transition-transform duration-150"
                          />
                        ) : (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        )}

                        {/* Excluded / Deleted Mask */}
                        {!activeSheetItems[0].included && (
                          <div
                            className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1 z-30 p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPageNum(activeSheetItems[0].pageNumber);
                            }}
                          >
                            <span className="text-[8px] font-semibold text-rose-300 px-1.5 py-0.5 rounded bg-zinc-900/90 border border-rose-500/30 flex items-center gap-1">
                              <Trash2 className="w-2 h-2 text-rose-400" />
                              Deleted
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePageIncluded(activeSheetItems[0].pageNumber);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-zinc-100 text-zinc-900 text-[8px] font-bold shadow-xs cursor-pointer"
                            >
                              <RotateCcw className="w-2 h-2 text-emerald-600" />
                              <span>Restore</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-300 text-[9px] font-mono">Empty</span>
                    )}
                  </div>

                  {/* Center Spine Fold Line & Staple Marks */}
                  <div className="h-full w-[3%] flex flex-col items-center justify-between relative py-2 select-none">
                    <div className="w-1.5 h-3 bg-zinc-700/80 rounded-[1px] shadow-xs" title="Staple Mark" />
                    <div className="h-full border-r border-dashed border-zinc-400/80" />
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[7px] font-mono text-zinc-500 dark:text-zinc-400 bg-white px-1 whitespace-nowrap font-bold">
                      ╎ FOLD LINE ╎
                    </span>
                    <div className="w-1.5 h-3 bg-zinc-700/80 rounded-[1px] shadow-xs" title="Staple Mark" />
                  </div>

                  {/* Right Page */}
                  <div
                    onClick={() => activeSheetItems[1] && setSelectedPageNum(activeSheetItems[1].pageNumber)}
                    onDoubleClick={() => activeSheetItems[1] && thumbnails[activeSheetItems[1].pageNumber] && setZoomPage(activeSheetItems[1].pageNumber)}
                    className={`w-[48.5%] h-full relative rounded-[2px] border bg-white overflow-hidden flex items-center justify-center cursor-pointer group shadow-2xs transition-all ${
                      activePageCfg?.pageNumber === activeSheetItems[1]?.pageNumber
                        ? 'border-blue-600 ring-2 ring-blue-600/30'
                        : 'border-zinc-200 hover:border-zinc-300'
                    } ${activeSheetItems[1] && !activeSheetItems[1].included ? 'opacity-40 grayscale' : ''}`}
                  >
                    {activeSheetItems[1] ? (
                      <div className="w-full h-full relative flex items-center justify-center">
                        <span
                          className={`absolute top-1 left-1 z-10 text-[8px] font-mono font-bold px-1 py-0.5 rounded ${
                            !activeSheetItems[1].included ? 'bg-rose-600 text-white line-through' : 'bg-blue-600 text-white'
                          } shadow-2xs`}
                        >
                          #{activeSheetItems[1].pageNumber} (Right)
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPageColor(activeSheetItems[1].pageNumber, activeSheetItems[1].colorMode === 'bw' ? 'color' : 'bw');
                          }}
                          className={`absolute top-1 right-1 z-10 text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-2xs cursor-pointer ${
                            activeSheetItems[1].colorMode === 'bw' ? 'bg-zinc-900 text-white' : 'bg-gradient-to-r from-blue-500 to-pink-500 text-white'
                          }`}
                        >
                          {activeSheetItems[1].colorMode === 'bw' ? 'B&W' : 'Color'}
                        </button>

                        {/* Quick Delete Button */}
                        {activeSheetItems[1].included && (
                          <div className="absolute bottom-1 left-1 z-20 flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePageIncluded(activeSheetItems[1].pageNumber);
                              }}
                              className="p-1 rounded-md bg-zinc-900/80 hover:bg-rose-600 text-zinc-300 hover:text-white shadow-2xs transition-all cursor-pointer"
                              title={`Delete Page #${activeSheetItems[1].pageNumber}`}
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}

                        {thumbnails[activeSheetItems[1].pageNumber] ? (
                          <img
                            src={thumbnails[activeSheetItems[1].pageNumber]}
                            alt={`Page #${activeSheetItems[1].pageNumber}`}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            onLoad={(e) => {
                              const img = e.currentTarget;
                              if (img.naturalWidth && img.naturalHeight) {
                                recordNaturalOrientation(
                                  activeSheetItems[1].pageNumber,
                                  img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait'
                                );
                              }
                            }}
                            style={{
                              filter: getLiveFilter(activeSheetItems[1].colorMode, enhanceMode),
                              transform: `scale(${Math.max(10, Math.min(400, activeSheetItems[1].customScale ?? customScale ?? 100)) / 100})`,
                              transformOrigin: 'center center',
                            }}
                            className="max-w-full max-h-full object-contain p-1 transition-transform duration-150"
                          />
                        ) : (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        )}

                        {/* Excluded / Deleted Mask */}
                        {!activeSheetItems[1].included && (
                          <div
                            className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1 z-30 p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPageNum(activeSheetItems[1].pageNumber);
                            }}
                          >
                            <span className="text-[8px] font-semibold text-rose-300 px-1.5 py-0.5 rounded bg-zinc-900/90 border border-rose-500/30 flex items-center gap-1">
                              <Trash2 className="w-2 h-2 text-rose-400" />
                              Deleted
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePageIncluded(activeSheetItems[1].pageNumber);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-zinc-100 text-zinc-900 text-[8px] font-bold shadow-xs cursor-pointer"
                            >
                              <RotateCcw className="w-2 h-2 text-emerald-600" />
                              <span>Restore</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-400 text-[9px] font-mono">Blank Inside</span>
                    )}
                  </div>
                </div>
              ) : layoutMode === 'poster' ? (
                /* Poster 2x2 Tiled Grid */
                <div className="w-full h-full relative bg-white overflow-hidden p-1 select-none">
                  {/* 2x2 Tiled Cut Guidelines */}
                  <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 border-2 border-amber-500/80 pointer-events-none z-10">
                    <div className="border-r border-b border-dashed border-amber-500/80 p-1 flex items-start justify-start">
                      <span className="text-[7.5px] font-mono font-bold text-amber-700 bg-white/95 px-1 rounded shadow-2xs border border-amber-300">Sheet 1/4 (Top-Left)</span>
                    </div>
                    <div className="border-b border-dashed border-amber-500/80 p-1 flex items-start justify-end">
                      <span className="text-[7.5px] font-mono font-bold text-amber-700 bg-white/95 px-1 rounded shadow-2xs border border-amber-300">Sheet 2/4 (Top-Right)</span>
                    </div>
                    <div className="border-r border-dashed border-amber-500/80 p-1 flex items-end justify-start">
                      <span className="text-[7.5px] font-mono font-bold text-amber-700 bg-white/95 px-1 rounded shadow-2xs border border-amber-300">Sheet 3/4 (Btm-Left)</span>
                    </div>
                    <div className="p-1 flex items-end justify-end">
                      <span className="text-[7.5px] font-mono font-bold text-amber-700 bg-white/95 px-1 rounded shadow-2xs border border-amber-300">Sheet 4/4 (Btm-Right)</span>
                    </div>
                  </div>
                  {activeSheetItems[0] && thumbnails[activeSheetItems[0].pageNumber] ? (
                    <div
                      onClick={() => setSelectedPageNum(activeSheetItems[0].pageNumber)}
                      onDoubleClick={() => thumbnails[activeSheetItems[0].pageNumber] && setZoomPage(activeSheetItems[0].pageNumber)}
                      className="w-full h-full flex items-center justify-center cursor-pointer overflow-hidden"
                      title="Click to select · Double-click to zoom poster"
                    >
                      <img
                        src={thumbnails[activeSheetItems[0].pageNumber]}
                        alt="Poster Preview"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          if (img.naturalWidth && img.naturalHeight) {
                            recordNaturalOrientation(
                              activeSheetItems[0].pageNumber,
                              img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait'
                            );
                          }
                        }}
                        style={{
                          filter: getLiveFilter(activeSheetItems[0].colorMode, enhanceMode),
                          transform: `scale(${Math.max(10, Math.min(400, activeSheetItems[0]?.customScale ?? customScale ?? 100)) / 100})`,
                          transformOrigin: 'center center',
                        }}
                        className="w-full h-full object-cover transition-transform duration-200"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                    </div>
                  )}
                </div>
              ) : (
                /* Dynamic Multiple / Size Grid Slots */
                <div
                  className="w-full h-full grid gap-1 sm:gap-1.5 p-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${gridConfig.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${gridConfig.rows}, minmax(0, 1fr))`,
                  }}
                >
                  {activeCells.map((cfg, cellIdx) => {
                    if (!cfg) {
                      return (
                        <div
                          key={`empty-cell-${cellIdx}`}
                          className={`w-full h-full rounded-[2px] ${
                            drawBorder ? 'border border-dashed border-zinc-300' : 'border border-dashed border-zinc-200/80'
                          } bg-white flex items-center justify-center`}
                        >
                          <span className="text-[8px] font-mono text-zinc-300 select-none">
                            Empty
                          </span>
                        </div>
                      );
                    }

                    const thumb = thumbnails[cfg.pageNumber];
                    const isExcluded = !cfg.included;

                    // Dynamic Cell & Document Orientation Detection:
                    const cellW = (isSheetLandscape ? 297 : 210) / Math.max(1, gridConfig.cols);
                    const cellH = (isSheetLandscape ? 210 : 297) / Math.max(1, gridConfig.rows);
                    const isSlotLandscape = cellW > cellH;

                    const naturalIsLandscape = (cfg.naturalOrientation || naturalOrientations[cfg.pageNumber]) === 'landscape';
                    const docIsLandscape = naturalOrientations[cfg.pageNumber] ? naturalIsLandscape : (cfg.orientation === 'landscape');

                    // Auto-rotate logic:
                    // Only auto-rotate in multi-up layouts (N-Up > 1, e.g. 2-up, 4-up) to pack pages efficiently.
                    // In 1-Up ("Size") mode, sheet orientation should never rotate the document sideways (matches Adobe Acrobat).
                    const isMultiUp = (gridConfig.cols * gridConfig.rows) > 1;
                    const effectiveAutoRotate = autoRotate ?? true;
                    const autoRot90 =
                      effectiveAutoRotate &&
                      isMultiUp &&
                      (!cfg.rotation || cfg.rotation === 0) &&
                      isSlotLandscape !== docIsLandscape
                        ? 90
                        : 0;

                    // Respect explicit page rotation set by user
                    const baseRot = cfg.rotation || 0;
                    const effectiveRotation = (baseRot + autoRot90) % 360;
                    const isRotated90 = effectiveRotation % 180 === 90;
                    const isSelected = selectedPageNum === cfg.pageNumber;

                    // Visual scaling factor: distinct visual difference between fit (margin), actual (100%), fill (full), and custom
                    const getScaleFactor = () => {
                      // 1. If this specific page has a custom scale set, ALWAYS prioritize it!
                      if (cfg.customScale !== undefined && cfg.customScale !== 100) {
                        return cfg.customScale / 100;
                      }
                      // 2. Document-level custom scale
                      if (scaling === 'custom' || fitMode === 'custom' || (customScale && customScale !== 100)) {
                        return (customScale || 100) / 100;
                      }
                      if (cfg.customScale === 100) return 1.00;
                      if (scaling === 'actual' || fitMode === 'actual') return 1.00; // 100% unscaled actual size
                      if (scaling === 'fill' || fitMode === 'fill') return 1.05; // Slightly enlarged to fill slot edges
                      return 0.92;
                    };
                    const scaleValue = getScaleFactor();

                    // When rotated 90 deg inside a slot, dynamically calculate the exact scale needed
                    // to fit the transposed aspect ratio cleanly into the cell without clipping or letterboxing
                    let rotFitScale = 1.0;
                    if (isRotated90) {
                      const slotRatio = cellW / cellH;
                      const imgRatio = docIsLandscape ? (297 / 210) : (210 / 297);
                      const unrotW = imgRatio < slotRatio ? cellH * imgRatio : cellW;
                      const unrotH = imgRatio < slotRatio ? cellH : cellW / imgRatio;
                      rotFitScale = Math.min(cellW / unrotH, cellH / unrotW);
                      if (!Number.isFinite(rotFitScale) || rotFitScale <= 0) {
                        rotFitScale = 1.0;
                      }
                    }
                    const finalScale = scaleValue * rotFitScale;

                    return (
                      <div
                        key={cfg.pageNumber}
                        onClick={() => setSelectedPageNum(cfg.pageNumber)}
                        onDoubleClick={() => thumb && setZoomPage(cfg.pageNumber)}
                        className={`relative w-full h-full rounded-[2px] overflow-hidden flex items-center justify-center cursor-pointer group transition-all select-none bg-white ${
                          isSelected
                            ? 'ring-2 ring-blue-600 ring-offset-1 ring-offset-white shadow-sm z-10'
                            : 'border border-zinc-300 dark:border-zinc-600 hover:border-blue-400 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                        } ${
                          drawBorder
                            ? 'border border-dashed border-zinc-400'
                            : ''
                        } ${isExcluded ? 'opacity-30 grayscale' : ''}`}
                      >
                        {/* Page Number & Copies Badge */}
                        <div className="absolute top-1 left-1 z-20 flex items-center gap-1">
                          <span
                            className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded shadow-2xs ${
                              isExcluded
                                ? 'bg-rose-600 text-white line-through'
                                : isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-zinc-900/85 text-white'
                            }`}
                          >
                            #{cfg.pageNumber}
                            {(cfg.copies || 1) > 1 && ` · ${cfg.copies}x`}
                          </span>
                        </div>

                        {/* Quick Color Toggle Button */}
                        <div className="absolute top-1 right-1 z-20 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPageColor(cfg.pageNumber, cfg.colorMode === 'bw' ? 'color' : 'bw');
                            }}
                            className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-2xs transition-all cursor-pointer ${
                              cfg.colorMode === 'bw'
                                ? 'bg-zinc-900 text-white font-bold'
                                : 'bg-gradient-to-r from-blue-500 to-pink-500 text-white font-bold'
                            }`}
                            title="Toggle B&W / Color"
                          >
                            {cfg.colorMode === 'bw' ? 'B&W' : 'Color'}
                          </button>
                        </div>

                        {/* Quick Delete Button (Bottom Left) */}
                        {!isExcluded && (
                          <div className="absolute bottom-1 left-1 z-20 flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePageIncluded(cfg.pageNumber);
                              }}
                              className="p-1 rounded-md bg-zinc-900/80 hover:bg-rose-600 text-zinc-300 hover:text-white shadow-2xs transition-all cursor-pointer"
                              title={`Delete Page #${cfg.pageNumber} (Exclude from print)`}
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}

                        {/* Quick Preview Eye Button (Bottom Center) */}
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomPage(cfg.pageNumber);
                            }}
                            className="px-1.5 py-0.5 rounded bg-zinc-900/80 hover:bg-blue-600 text-white shadow-2xs transition-all cursor-pointer flex items-center gap-0.5 text-[8.5px] font-semibold"
                            title={`Inspect Page #${cfg.pageNumber} in High Resolution`}
                          >
                            <Eye className="w-2.5 h-2.5 text-blue-400" />
                            <span>Preview</span>
                          </button>
                        </div>

                        {/* Quick Rotate 90° Button (Bottom Right) */}
                        <div className="absolute bottom-1 right-1 z-20 flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              rotatePage(cfg.pageNumber);
                            }}
                            className="p-1 rounded-md bg-zinc-900/80 hover:bg-zinc-900 text-white shadow-2xs transition-all cursor-pointer"
                            title="Rotate 90° Clockwise"
                          >
                            <RotateCw className="w-2.5 h-2.5" />
                          </button>
                        </div>

                        {thumb ? (
                          <div className="w-full h-full p-0.5 flex items-center justify-center overflow-hidden">
                            <div
                              className="flex items-center justify-center transition-all duration-200 w-full h-full"
                              style={{
                                transform: [
                                  effectiveRotation ? `rotate(${effectiveRotation}deg)` : '',
                                  `scale(${finalScale})`,
                                ]
                                  .filter(Boolean)
                                  .join(' ') || undefined,
                                transformOrigin: 'center center',
                              }}
                            >
                              <img
                                src={thumb}
                                alt={`Page #${cfg.pageNumber}`}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                                onLoad={(e) => {
                                  const img = e.currentTarget;
                                  if (img.naturalWidth && img.naturalHeight) {
                                    recordNaturalOrientation(
                                      cfg.pageNumber,
                                      img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait'
                                    );
                                  }
                                }}
                                style={{
                                  filter: getLiveFilter(cfg.colorMode, enhanceMode),
                                }}
                                className={`max-w-full max-h-full transition-all duration-150 rounded-[1px] shadow-[0_1px_4px_rgba(0,0,0,0.14)] border border-zinc-200/90 dark:border-zinc-700/80 ${
                                  fitMode === 'fill' ? 'object-contain scale-[1.02]' : 'object-contain scale-[0.98]'
                                }`}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-zinc-400 gap-0.5 p-1">
                            {loadingThumbnails ? (
                              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                            ) : (
                              <span className="text-[8px] font-mono">#{cfg.pageNumber}</span>
                            )}
                          </div>
                        )}

                        {/* Excluded / Deleted Mask with Restore Option */}
                        {isExcluded && (
                          <div
                            className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5 z-30 p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPageNum(cfg.pageNumber);
                            }}
                          >
                            <span className="text-[8px] font-semibold text-rose-300 px-1.5 py-0.5 rounded bg-zinc-900/90 border border-rose-500/30 flex items-center gap-1">
                              <Trash2 className="w-2 h-2 text-rose-400" />
                              Page Deleted
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePageIncluded(cfg.pageNumber);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white hover:bg-zinc-100 text-zinc-900 text-[8.5px] font-bold shadow-xs transition-transform active:scale-95 cursor-pointer"
                              title={`Restore Page #${cfg.pageNumber}`}
                            >
                              <RotateCcw className="w-2.5 h-2.5 text-emerald-600" />
                              <span>Restore</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Adobe-Style Navigation Bar: Comfortable Side-by-Side Mobile Controls */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between gap-2 px-0.5">
              {/* Touch-Friendly Previous Button */}
              <button
                type="button"
                onClick={() => setCurrentSheetIndex(currentSheetIndex - 1)}
                disabled={currentSheetIndex === 0}
                className="h-9 px-3 min-w-[40px] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-30 disabled:pointer-events-none hover:bg-zinc-100 dark:hover:bg-zinc-700 active:scale-95 transition-all shadow-2xs cursor-pointer"
                title="Previous Sheet"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                <span className="hidden sm:inline">Prev</span>
              </button>

              {/* Slider with Live Sheet Count */}
              <div className="flex-1 flex items-center gap-2 max-w-[260px]">
                <input
                  type="range"
                  min={0}
                  max={totalSheets - 1}
                  value={currentSheetIndex}
                  onChange={(e) => setCurrentSheetIndex(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
                  {currentSheetIndex + 1}/{totalSheets}
                </span>
              </div>

              {/* Touch-Friendly Next Button */}
              <button
                type="button"
                onClick={() => setCurrentSheetIndex(currentSheetIndex + 1)}
                disabled={currentSheetIndex >= totalSheets - 1}
                className="h-9 px-3 min-w-[40px] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-30 disabled:pointer-events-none hover:bg-zinc-100 dark:hover:bg-zinc-700 active:scale-95 transition-all shadow-2xs cursor-pointer"
                title="Next Sheet"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Pager Status */}
            <div className="flex items-center justify-between px-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="font-mono text-[10.5px]">
                Sheet {currentSheetIndex + 1} of {totalSheets}{' '}
                <span className="text-zinc-400">
                  ({activeSheetItems.filter((p) => p.included).length} printable)
                </span>
              </span>
              <span className="text-[10px] text-zinc-400">
                Tap page to customize
              </span>
            </div>

            {/* Dedicated Page Settings Inspector: Spacious, Ergonomic Touch Bar */}
            {activePageCfg && (
              <div className="mt-1 px-3 py-2.5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-[#15161a] flex flex-col gap-2 shadow-xs">
                {/* Row 1: Primary Print Choices (Color Mode Toggle with Green Flickering Indicator) */}
                <div className="grid grid-cols-2 gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => setPageColor(activePageCfg.pageNumber, 'bw')}
                    className={`h-9 px-3 rounded-lg border flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer ${
                      activePageCfg.colorMode === 'bw'
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950 shadow-xs ring-1 ring-emerald-500/40'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50'
                    }`}
                  >
                    {activePageCfg.colorMode === 'bw' ? (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)] animate-pulse"></span>
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 opacity-60" />
                    )}
                    <span>B&amp;W (₹{TIER_RATES.standard.bw.single})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageColor(activePageCfg.pageNumber, 'color')}
                    className={`h-9 px-3 rounded-lg border flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer ${
                      activePageCfg.colorMode === 'color'
                        ? 'border-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white shadow-xs ring-2 ring-emerald-400/50'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50'
                    }`}
                  >
                    {activePageCfg.colorMode === 'color' ? (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)] animate-pulse"></span>
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 opacity-70" />
                    )}
                    <span>Color (₹{TIER_RATES.standard.color.single})</span>
                  </button>
                </div>

                {/* Row 2: Scale Stepper (Left) & Copies Stepper (Right) */}
                <div className="flex items-center justify-between gap-2 w-full pt-1.5 border-t border-zinc-100 dark:border-zinc-800/80">
                  {/* Left: Scale Stepper for Current Page */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Scale:</span>
                    <div className="flex items-center h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 overflow-hidden shadow-2xs">
                      <button
                        type="button"
                        onClick={() => {
                          const cur = activePageCfg.customScale ?? customScale ?? 100;
                          setPageCustomScale(activePageCfg.pageNumber, Math.max(10, cur - 5));
                        }}
                        className="w-7 h-8 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-xs cursor-pointer select-none transition-colors"
                        title="Decrease scale by 5%"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span
                        onClick={() => {
                          const currentVal = activePageCfg.customScale ?? customScale ?? 100;
                          const val = prompt(
                            `Custom scale % for Page #${activePageCfg.pageNumber} (10 to 400):`,
                            String(currentVal)
                          );
                          if (val !== null) {
                            const parsed = parseInt(val, 10);
                            if (!isNaN(parsed)) setPageCustomScale(activePageCfg.pageNumber, Math.max(10, Math.min(400, parsed)));
                          }
                        }}
                        className="px-1.5 min-w-[36px] text-center font-mono font-bold text-xs text-zinc-900 dark:text-zinc-100 hover:text-blue-500 cursor-pointer select-none"
                        title="Click to type exact percentage"
                      >
                        {activePageCfg.customScale ?? customScale ?? 100}%
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = activePageCfg.customScale ?? customScale ?? 100;
                          setPageCustomScale(activePageCfg.pageNumber, Math.min(400, cur + 5));
                        }}
                        className="w-7 h-8 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-xs cursor-pointer select-none transition-colors"
                        title="Increase scale by 5%"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Right: Copies Stepper for Current Page */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Copies:</span>
                    <div className="flex items-center h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 overflow-hidden shadow-2xs">
                      <button
                        type="button"
                        disabled={(activePageCfg.copies || 1) <= 1}
                        onClick={() => setPageCopies(activePageCfg.pageNumber, -1)}
                        className="w-7 h-8 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-30 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-mono font-bold text-xs text-zinc-900 dark:text-zinc-100">
                        {activePageCfg.copies || 1}
                      </span>
                      <button
                        type="button"
                        disabled={(activePageCfg.copies || 1) >= 99}
                        onClick={() => setPageCopies(activePageCfg.pageNumber, 1)}
                        className="w-7 h-8 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-30 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Row 3: Page Context, Orientation, Rotate, Delete (Single Line - No Wrapping) */}
                <div className="flex items-center gap-1 sm:gap-1.5 w-full pt-1.5 border-t border-zinc-100 dark:border-zinc-800/80">
                  <span
                    className={`h-7.5 px-2 rounded-lg flex items-center font-mono font-bold text-[11px] shrink-0 shadow-2xs ${
                      activePageCfg.included ? 'bg-blue-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    Page #{activePageCfg.pageNumber}
                    {!activePageCfg.included && ' (Del)'}
                  </span>

                  {activeSheetItems.length > 1 && (
                    <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-lg shrink-0 border border-zinc-200 dark:border-zinc-700/60">
                      {activeSheetItems.map((item) => (
                        <button
                          key={item.pageNumber}
                          type="button"
                          onClick={() => setSelectedPageNum(item.pageNumber)}
                          className={`h-6.5 px-1.5 rounded text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                            item.pageNumber === activePageCfg.pageNumber
                              ? item.included
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-rose-600 text-white shadow-2xs'
                              : item.included
                              ? 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                              : 'text-rose-500 line-through opacity-70'
                          }`}
                        >
                          #{item.pageNumber}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Orientation segment group */}
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/60 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = pageConfigs.map((p) =>
                          p.pageNumber === activePageCfg.pageNumber
                            ? { ...p, orientation: 'portrait' as const, rotation: 0 }
                            : p
                        );
                        onChange(updated);
                        const stillHasLandscape = updated.some(
                          (p) => p.included && (p.orientation === 'landscape' || p.naturalOrientation === 'landscape' || p.rotation === 90 || p.rotation === 270)
                        );
                        if (!stillHasLandscape) {
                          onOrientationChange?.('portrait');
                        }
                      }}
                      className={`h-6.5 px-2 rounded-md flex items-center gap-0.5 text-[11px] font-medium transition-all cursor-pointer ${
                        currentEffectiveOrient === 'portrait'
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                      title="Set this page to Portrait orientation"
                    >
                      <span>▯</span>
                      <span>Port</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const updated = pageConfigs.map((p) =>
                          p.pageNumber === activePageCfg.pageNumber
                            ? { ...p, orientation: 'landscape' as const, rotation: 0 }
                            : p
                        );
                        onChange(updated);
                        onOrientationChange?.('landscape');
                      }}
                      className={`h-6.5 px-2 rounded-md flex items-center gap-0.5 text-[11px] font-medium transition-all cursor-pointer ${
                        currentEffectiveOrient === 'landscape'
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                      title="Set this page to Landscape orientation"
                    >
                      <span>▭</span>
                      <span>Land</span>
                    </button>
                  </div>

                  {/* Rotate 90° button */}
                  <button
                    type="button"
                    onClick={() => rotatePage(activePageCfg.pageNumber)}
                    className="h-7.5 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-zinc-100/80 dark:bg-zinc-800/70 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors shrink-0"
                    title={`Rotate page 90° clockwise (currently ${activePageCfg.rotation || 0}°)`}
                  >
                    <RotateCw className="w-3.5 h-3.5 text-blue-500" />
                    <span>Rotate</span>
                    {(activePageCfg.rotation || 0) > 0 && (
                      <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-bold">
                        {activePageCfg.rotation}°
                      </span>
                    )}
                  </button>

                  {/* Dedicated Delete / Restore Page Icon Button (Placed immediately next to Rotate, no wrap) */}
                  {activePageCfg.included ? (
                    <button
                      type="button"
                      onClick={() => togglePageIncluded(activePageCfg.pageNumber)}
                      className="w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/80 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center justify-center transition-all cursor-pointer shadow-2xs shrink-0 active:scale-95"
                      title={`Delete Page #${activePageCfg.pageNumber} from print`}
                      aria-label={`Delete Page #${activePageCfg.pageNumber}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => togglePageIncluded(activePageCfg.pageNumber)}
                      className="w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 flex items-center justify-center transition-all cursor-pointer shadow-2xs shrink-0 active:scale-95"
                      title={`Restore Page #${activePageCfg.pageNumber}`}
                      aria-label={`Restore Page #${activePageCfg.pageNumber}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================
            MODE 2: ALL SHEETS GRID VIEW (Bird's Eye Overview)
            ======================================================== */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5 max-h-[520px] overflow-y-auto pr-1 scrollbar-thin">
          {sheetChunks.map((sheet, sheetIdx) => {
            const sheetNumber = sheetIdx + 1;

            return (
              <div
                key={`all-sheet-${sheetIdx}`}
                onClick={() => {
                  setCurrentSheetIndex(sheetIdx);
                  setViewMode('pager');
                }}
                className={`rounded-lg border p-1.5 transition-all cursor-pointer hover:border-blue-500 ${
                  sheetIdx === currentSheetIndex
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono pb-1 mb-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="font-bold">Sheet #{sheetNumber}</span>
                  <span className="text-[9px] text-zinc-400">
                    {sheet.length} {sheet.length === 1 ? 'page' : 'pgs'}
                  </span>
                </div>

                <div className="flex items-center justify-center p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded overflow-hidden">
                  <div
                    className={`bg-white text-zinc-900 rounded-[2px] shadow-sm p-0.5 grid gap-0.5 w-full ${
                      gridConfig.isLandscapeSheet ? 'aspect-[297/210]' : 'aspect-[210/297]'
                    }`}
                    style={{
                      gridTemplateColumns: `repeat(${gridConfig.cols}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${gridConfig.rows}, minmax(0, 1fr))`,
                    }}
                  >
                    {sheet.map((cfg) => {
                      const isDel = !cfg.included;
                      return (
                        <div
                          key={cfg.pageNumber}
                          className={`relative rounded-[1px] border border-zinc-200/60 bg-white overflow-hidden flex items-center justify-center aspect-[210/297] w-full ${
                            isDel ? 'opacity-35 grayscale' : ''
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 z-10 text-[6px] font-mono font-bold px-0.5 rounded ${
                              isDel ? 'bg-rose-600 text-white line-through' : 'bg-zinc-900/80 text-white'
                            }`}
                          >
                            #{cfg.pageNumber}
                          </span>

                          {/* Quick Delete / Restore in bird's eye view */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePageIncluded(cfg.pageNumber);
                            }}
                            className={`absolute top-0.5 right-0.5 z-20 p-0.5 rounded text-[6px] transition-all cursor-pointer ${
                              isDel
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs'
                                : 'bg-zinc-900/70 hover:bg-rose-600 text-white shadow-2xs'
                            }`}
                            title={isDel ? `Restore Page #${cfg.pageNumber}` : `Delete Page #${cfg.pageNumber}`}
                          >
                            {isDel ? <RotateCcw className="w-2 h-2" /> : <Trash2 className="w-2 h-2" />}
                          </button>

                          {thumbnails[cfg.pageNumber] ? (
                            <img
                              src={thumbnails[cfg.pageNumber]}
                              alt={`#${cfg.pageNumber}`}
                              style={{ filter: getLiveFilter(cfg.colorMode, enhanceMode) }}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-[6px] text-zinc-400">#{cfg.pageNumber}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen Zoom / High-Res Inspection Modal */}
      {/* Fullscreen Continuous Vertical Scrolling Preview Modal matching doprint.app */}
      {zoomPage !== null && (
        <div
          onClick={() => {
            setZoomPage(null);
            setEnlargedPage(null);
          }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-md sm:max-w-xl w-full max-h-[95vh] rounded-3xl p-3.5 sm:p-5 border border-zinc-200/90 dark:border-zinc-800 flex flex-col gap-3 relative overflow-hidden bg-white dark:bg-[#15161a] shadow-2xl"
          >
            {/* Header: Title + Page Meta (Left), Close (Right) */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
              <div>
                <div className="flex items-center gap-1.5 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Print Preview</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                  {totalPages} {totalPages === 1 ? 'page' : 'pages'} ·{' '}
                  {colorPagesCount === 0
                    ? 'Black & White'
                    : colorPagesCount === includedPagesCount
                    ? 'Full Color'
                    : `${colorPagesCount} Color / ${bwPagesCount} B&W`}
                </p>
              </div>

              {/* Close X button */}
              <button
                type="button"
                onClick={() => {
                  setZoomPage(null);
                  setEnlargedPage(null);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                title="Close Preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Continuous Vertical Scrolling Canvas Feed matching doprint.app */}
            <div className="flex-1 overflow-y-auto max-h-[72vh] p-2.5 sm:p-4 space-y-6 scrollbar-thin bg-zinc-100/75 dark:bg-[#0c0d10] rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
              {pageConfigs.map((pageCfg) => {
                const pageNum = pageCfg.pageNumber;
                const isLand = pageCfg.orientation === 'landscape';
                const hasThumb = thumbnails[pageNum];
                const isEnlarged = enlargedPage === pageNum;

                return (
                  <div
                    key={pageNum}
                    id={`preview-page-${pageNum}`}
                    className="flex flex-col items-center gap-2 transition-all"
                  >
                    {/* Page Paper Card */}
                    <div
                      className={`relative w-full max-w-[440px] bg-white rounded-lg shadow-md shadow-black/15 border border-zinc-300 dark:border-zinc-700/80 transition-all duration-200 overflow-hidden ${
                        isLand ? 'aspect-[297/210]' : 'aspect-[210/297]'
                      } ${pageCfg.included === false ? 'opacity-50 grayscale' : ''}`}
                    >
                      {/* Safe Print Margin guide */}
                      <div className="absolute inset-2 sm:inset-3 border border-dashed border-zinc-200/90 pointer-events-none z-10" />

                      {/* Floating Zoom / Magnify toggle */}
                      <button
                        type="button"
                        onClick={() => setEnlargedPage(isEnlarged ? null : pageNum)}
                        className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full bg-zinc-900/80 hover:bg-zinc-900 text-white backdrop-blur-sm flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer"
                        title={isEnlarged ? 'Reset zoom' : 'Enlarge page to read text'}
                      >
                        {isEnlarged ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                      </button>

                      {/* Deleted overlay badge if excluded */}
                      {pageCfg.included === false && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-900/30 backdrop-blur-[1px]">
                          <span className="text-xs font-bold text-rose-600 bg-white/95 px-3 py-1 rounded-full shadow-md border border-rose-200">
                            Page Excluded / Deleted
                          </span>
                        </div>
                      )}

                      {/* Content Area */}
                      <div className="w-full h-full p-2.5 sm:p-3.5 flex items-center justify-center overflow-hidden">
                        {!hasThumb ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-400">
                            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                            <span className="text-[11px] font-mono">Rendering Page #{pageNum}...</span>
                          </div>
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center transition-transform duration-200"
                            style={{
                              transform: `${pageCfg.rotation ? `rotate(${pageCfg.rotation}deg)` : ''} scale(${
                                (isEnlarged ? 1.65 : 1.0) * (Math.max(10, Math.min(400, pageCfg.customScale ?? customScale ?? 100)) / 100)
                              })`,
                              transformOrigin: 'center center',
                            }}
                          >
                            <img
                              src={thumbnails[pageNum]}
                              alt={`Page ${pageNum}`}
                              style={{
                                filter:
                                  enhanceMode === 'magic_bw'
                                    ? 'grayscale(100%) contrast(210%) brightness(122%)'
                                    : enhanceMode === 'grayscale'
                                    ? 'grayscale(100%) contrast(140%) brightness(108%)'
                                    : enhanceMode === 'color_boost'
                                    ? 'contrast(125%) brightness(108%) saturate(120%)'
                                    : pageCfg.colorMode === 'bw'
                                    ? 'grayscale(100%) contrast(125%) brightness(96%)'
                                    : 'none',
                              }}
                              className={`${
                                fitMode === 'fill' ? 'object-cover w-full h-full' : 'object-contain max-h-full max-w-full'
                              } select-none`}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Page Caption matching DoPrint */}
                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      <span>Page {pageNum} of {totalPages}</span>
                      <span>·</span>
                      <span className={pageCfg.colorMode === 'color' ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
                        {pageCfg.colorMode === 'color' ? 'Color' : 'B&W'}
                      </span>
                      {pageCfg.orientation === 'landscape' && (
                        <>
                          <span>·</span>
                          <span>Landscape</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer: Doprint.app-style Full-Width Blue Close Button */}
            <div className="pt-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setZoomPage(null);
                  setEnlargedPage(null);
                }}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl text-sm shadow-md shadow-blue-600/25 transition-all cursor-pointer flex items-center justify-center"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
