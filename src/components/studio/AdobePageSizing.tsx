'use client';

import React, { useState } from 'react';
import {
  Scissors,
  ChevronDown,
  ChevronUp,
  AlignLeft,
} from 'lucide-react';
import {
  PhotoLayoutSettings,
  LayoutMode,
  TextPosition,
  TextOverlayItem,
  getTextOverlayItems,
} from './PhotoLayoutSelector';
import { PageConfig } from '@/lib/pricing';
import { parsePageRange } from '@/lib/pdf-utils';

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 1: AdobePagesToPrint (Pages to Print Section)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdobePagesToPrintProps {
  totalPages?: number;
  pageConfigs?: PageConfig[];
  onPageConfigsChange?: (configs: PageConfig[]) => void;
  pageRangeType?: 'all' | 'custom';
  customPageRange?: string;
  onRangeChange?: (type: 'all' | 'custom', rangeStr: string) => void;
  activePageNumber?: number;
}

export function AdobePagesToPrint({
  totalPages = 1,
  pageConfigs,
  onPageConfigsChange,
  pageRangeType = 'all',
  customPageRange = '',
  onRangeChange,
  activePageNumber = 1,
}: AdobePagesToPrintProps) {
  const [prevRangeKey, setPrevRangeKey] = useState(`${pageRangeType}_${customPageRange}_${totalPages}`);
  const [rangeInput, setRangeInput] = useState(
    pageRangeType === 'all' ? `1-${totalPages}` : customPageRange || `1-${totalPages}`
  );

  const currentRangeKey = `${pageRangeType}_${customPageRange}_${totalPages}`;
  if (prevRangeKey !== currentRangeKey) {
    setPrevRangeKey(currentRangeKey);
    setRangeInput(pageRangeType === 'custom' && customPageRange ? customPageRange : `1-${totalPages}`);
  }

  const handleSelectAll = () => {
    onRangeChange?.('all', 'All');
    if (pageConfigs && onPageConfigsChange) {
      onPageConfigsChange(pageConfigs.map((c) => ({ ...c, included: true })));
    }
  };

  const handleSelectCurrent = () => {
    const pageStr = String(activePageNumber);
    onRangeChange?.('custom', pageStr);
    if (pageConfigs && onPageConfigsChange) {
      onPageConfigsChange(
        pageConfigs.map((c) => ({
          ...c,
          included: c.pageNumber === activePageNumber,
        }))
      );
    }
  };

  const handleCustomRange = (inputVal: string) => {
    setRangeInput(inputVal);
    onRangeChange?.('custom', inputVal);
    if (pageConfigs && onPageConfigsChange) {
      const parsedPages = parsePageRange(inputVal, totalPages);
      onPageConfigsChange(
        pageConfigs.map((c) => ({
          ...c,
          included: parsedPages.includes(c.pageNumber),
        }))
      );
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121216] shadow-2xs text-xs overflow-hidden">
      <div className="px-3 py-2 sm:px-3.5 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">Pages to Print:</span>
          <span className="text-[10px] text-zinc-400">({totalPages} total)</span>
        </div>

        {/* Clean, compact inline options */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5 text-xs">
          {/* All */}
          <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-zinc-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <input
              type="radio"
              name="adobePageRange"
              checked={pageRangeType === 'all'}
              onChange={handleSelectAll}
              className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
            />
            <span>All</span>
          </label>

          {/* Current Page */}
          <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-zinc-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <input
              type="radio"
              name="adobePageRange"
              checked={pageRangeType === 'custom' && customPageRange === String(activePageNumber)}
              onChange={handleSelectCurrent}
              className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
            />
            <span>Current (#{activePageNumber})</span>
          </label>

          {/* Custom Pages Input */}
          <div className="inline-flex items-center gap-1.5">
            <label className="inline-flex items-center gap-1 cursor-pointer font-medium text-zinc-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              <input
                type="radio"
                name="adobePageRange"
                checked={pageRangeType === 'custom' && customPageRange !== String(activePageNumber)}
                onChange={() => handleCustomRange(rangeInput || `1-${totalPages}`)}
                className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
              />
              <span>Pages:</span>
            </label>
            <input
              type="text"
              placeholder={`1-${totalPages}`}
              value={rangeInput}
              onChange={(e) => handleCustomRange(e.target.value)}
              onFocus={() => {
                if (pageRangeType !== 'custom') handleCustomRange(rangeInput || `1-${totalPages}`);
              }}
              className="w-20 h-6 px-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 font-mono text-[11px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 2: AdobePageHandling (Page Sizing & Handling + Orientation)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdobePageHandlingProps {
  settings: PhotoLayoutSettings;
  onChange: (updated: PhotoLayoutSettings) => void;
  orientation: 'auto' | 'portrait' | 'landscape';
  onOrientationChange: (orient: 'auto' | 'portrait' | 'landscape') => void;
  scaling?: 'fit' | 'actual' | 'fill' | 'custom';
  onScalingChange?: (scaling: 'fit' | 'actual' | 'fill' | 'custom', customScale?: number) => void;
  customScale?: number;
  onCustomScaleChange?: (scale: number) => void;
  fileCount?: number;
  pageConfigs?: PageConfig[];
  onPageConfigsChange?: (configs: PageConfig[]) => void;
  totalPages?: number;
  activePageNumber?: number;
}

export function AdobePageHandling({
  settings,
  onChange,
  orientation,
  onOrientationChange,
  scaling = 'fit',
  onScalingChange,
  customScale = 100,
  onCustomScaleChange,
  pageConfigs,
  onPageConfigsChange,
}: AdobePageHandlingProps) {
  const [activeTab, setActiveTab] = useState<'size' | 'mode' | 'multiple' | 'text'>(
    settings.layoutMode === 'booklet' || settings.layoutMode === 'poster'
      ? 'mode'
      : settings.layoutMode === '1-up'
      ? 'size'
      : 'multiple'
  );
  const [modeType, setModeType] = useState<'booklet' | 'poster'>(
    settings.layoutMode === 'poster' ? 'poster' : 'booklet'
  );
  const customCols = settings.customCols || 2;
  const customRows = settings.customRows || 2;
  const isCustomActive = settings.layoutMode === 'custom';
  const [posterScale, setPosterScale] = useState('100');
  const [prevCustomScale, setPrevCustomScale] = useState(customScale);
  const [scaleText, setScaleText] = useState(String(customScale || 100));
  const [isSizingOpen, setIsSizingOpen] = useState(true);
  const [isOrientationOpen, setIsOrientationOpen] = useState(true);

  const updateTargetScale = (newScale: number) => {
    const clamped = Math.max(10, Math.min(500, newScale));
    setScaleText(String(clamped));
    handleScalingChange('custom', clamped);
    onCustomScaleChange?.(clamped);
  };

  if (prevCustomScale !== customScale) {
    setPrevCustomScale(customScale);
    setScaleText(String(customScale || 100));
  }

  const handleTabSelect = (tab: 'size' | 'mode' | 'multiple' | 'text') => {
    setActiveTab(tab);
    if (tab === 'size') {
      onChange({
        ...settings,
        layoutMode: '1-up',
        pagesPerSheet: 1,
      });
    } else if (tab === 'mode') {
      if (modeType === 'poster') {
        onChange({
          ...settings,
          layoutMode: 'poster',
          pagesPerSheet: 1,
        });
      } else {
        onChange({
          ...settings,
          layoutMode: 'booklet',
          pagesPerSheet: 2,
        });
      }
    } else if (tab === 'multiple') {
      if (isCustomActive) {
        onChange({
          ...settings,
          layoutMode: 'custom',
          customCols,
          customRows,
          pagesPerSheet: customCols * customRows,
        });
      } else {
        onChange({
          ...settings,
          layoutMode: '2-up',
          pagesPerSheet: 2,
        });
      }
    } else if (tab === 'text') {
      // Do not force-enable text overlay on tab select; let user toggle it on explicitly
      if (!settings.textOverlay) {
        onChange({
          ...settings,
          textOverlay: {
            enabled: false,
            text: 'SAMPLE STAMP',
            position: 'watermark',
            fontFamily: 'sans',
            fontSize: 'md',
            color: '#dc2626',
            opacity: 0.18,
            applyTo: 'all_pages',
          },
        });
      }
    }
  };

  const handlePagesPerSheetChange = (val: string) => {
    if (val === 'custom') {
      const cols = customCols || 2;
      const rows = customRows || 2;
      onChange({
        ...settings,
        layoutMode: 'custom',
        customCols: cols,
        customRows: rows,
        pagesPerSheet: cols * rows,
      });
      return;
    }
    const num = parseInt(val, 10);
    let newLayout: LayoutMode = '2-up';
    if (num === 2) {
      newLayout = settings.layoutMode === 'id-card' ? 'id-card' : '2-up';
    } else if (num === 4) newLayout = '4-up';
    else if (num === 6) newLayout = '6-up';
    else if (num === 8) newLayout = '8-up';
    else if (num === 9) newLayout = '9-up';
    else if (num === 16) newLayout = '16-up';

    onChange({
      ...settings,
      layoutMode: newLayout,
      pagesPerSheet: num,
    });
  };

  const handleScalingChange = (newScaling: 'fit' | 'actual' | 'fill' | 'custom', newScaleVal?: number) => {
    onScalingChange?.(newScaling, newScaleVal);
    onChange({
      ...settings,
      fitMode: newScaling === 'fill' ? 'fill' : newScaling === 'actual' ? 'actual' : newScaling === 'custom' ? 'custom' : 'fit',
    });
  };

  return (
    <div className="space-y-2.5 text-xs">
      {/* BOX 1: PAGE SIZING & HANDLING PANEL */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121216] p-2.5 sm:p-3 space-y-2.5 shadow-2xs transition-all">
        <button
          type="button"
          onClick={() => setIsSizingOpen(!isSizingOpen)}
          className="w-full flex items-center justify-between pb-1 border-b border-zinc-100 dark:border-zinc-800/70 text-left cursor-pointer group select-none"
        >
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-3.5 bg-blue-500 rounded-full inline-block" />
            <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-xs tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Page Sizing &amp; Handling
            </h4>
          </div>
          <div className="flex items-center gap-1.5">
            {!isSizingOpen && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40 font-semibold">
                {activeTab === 'size'
                  ? `Size: ${scaling === 'custom' ? `${scaleText}%` : scaling}`
                  : activeTab === 'mode'
                  ? modeType === 'booklet' ? 'Booklet' : 'Poster'
                  : activeTab === 'multiple'
                  ? `${settings.pagesPerSheet || 2}-Up`
                  : 'Text'}
              </span>
            )}
            <span className="text-[10px] text-zinc-400 font-medium hidden sm:inline">
              {isSizingOpen ? 'Minimize' : 'Expand'}
            </span>
            {isSizingOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-transform" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-transform" />
            )}
          </div>
        </button>

        {isSizingOpen && (
          <>
            {/* 4 Tabs: [ Size ] [ Mode ] [ Multiple ] [ Text ] */}
            <div className="grid grid-cols-4 gap-1 p-0.5 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {(['size', 'mode', 'multiple', 'text'] as const).map((tab) => {
            const isSelected = activeTab === tab;
            const labels: Record<typeof tab, string> = {
              size: 'Size',
              mode: 'Mode',
              multiple: 'Multiple',
              text: 'Text',
            };
            return (
              <button
                key={tab}
                type="button"
                onClick={() => handleTabSelect(tab)}
                className={`h-7 px-1 text-center text-[11px] sm:text-xs font-semibold rounded-md transition-all cursor-pointer truncate ${
                  isSelected
                    ? 'bg-white text-zinc-950 dark:bg-zinc-800 dark:text-white shadow-2xs border border-zinc-200/80 dark:border-zinc-700'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* --- TAB CONTENT: SIZE (1 per sheet) --- */}
        {/* --- TAB CONTENT: SIZE (2x2 GRID FOR PERFECT MOBILE UI) --- */}
        {activeTab === 'size' && (
          <div className="grid grid-cols-2 gap-1.5 pt-1 text-xs">
            {/* 1. Fit to page margins */}
            <div
              onClick={() => handleScalingChange('fit')}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border flex items-center cursor-pointer transition-all ${
                scaling === 'fit'
                  ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-950/35 text-blue-950 dark:text-blue-100 ring-1 ring-blue-500/40 shadow-2xs'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <input
                  type="radio"
                  name="adobeScaling"
                  checked={scaling === 'fit'}
                  onChange={() => handleScalingChange('fit')}
                  className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer shrink-0"
                />
                <span className="font-semibold text-[11px] truncate">Fit to margins</span>
              </div>
            </div>

            {/* 2. Actual size (100%) */}
            <div
              onClick={() => handleScalingChange('actual')}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border flex items-center cursor-pointer transition-all ${
                scaling === 'actual'
                  ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-950/35 text-blue-950 dark:text-blue-100 ring-1 ring-blue-500/40 shadow-2xs'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <input
                  type="radio"
                  name="adobeScaling"
                  checked={scaling === 'actual'}
                  onChange={() => handleScalingChange('actual')}
                  className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer shrink-0"
                />
                <span className="font-semibold text-[11px] truncate">Actual size</span>
              </div>
            </div>

            {/* 3. Shrink oversized / Fill page */}
            <div
              onClick={() => handleScalingChange('fill')}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border flex items-center cursor-pointer transition-all ${
                scaling === 'fill'
                  ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-950/35 text-blue-950 dark:text-blue-100 ring-1 ring-blue-500/40 shadow-2xs'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <input
                  type="radio"
                  name="adobeScaling"
                  checked={scaling === 'fill'}
                  onChange={() => handleScalingChange('fill')}
                  className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer shrink-0"
                />
                <span className="font-semibold text-[11px] truncate">Shrink / Fill</span>
              </div>
            </div>

            {/* 4. Custom Scale */}
            <div
              onClick={() => handleScalingChange('custom', customScale || 100)}
              className={`min-h-[38px] px-2 py-1.5 rounded-lg border flex items-center justify-between gap-1 cursor-pointer transition-all ${
                scaling === 'custom'
                  ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-950/35 text-blue-950 dark:text-blue-100 ring-1 ring-blue-500/40 shadow-2xs'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <input
                  type="radio"
                  name="adobeScaling"
                  checked={scaling === 'custom'}
                  onChange={() => handleScalingChange('custom', customScale || 100)}
                  className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer shrink-0"
                />
                <span className="font-semibold text-[11px] truncate">Custom</span>
              </div>

              {/* Compact Touch Stepper */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center h-5.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden shadow-2xs shrink-0"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    updateTargetScale((customScale || 100) - 5);
                  }}
                  className="w-4 h-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold text-xs cursor-pointer select-none"
                  title="Decrease 5%"
                >
                  -
                </button>
                <span className="font-mono text-[10px] font-bold px-1 text-center min-w-[28px] text-zinc-900 dark:text-zinc-100">
                  {customScale || 100}%
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    updateTargetScale((customScale || 100) + 5);
                  }}
                  className="w-4 h-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold text-xs cursor-pointer select-none"
                  title="Increase 5%"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: MULTIPLE --- */}
        {activeTab === 'multiple' && (
          <div className="pt-0.5 space-y-2 text-xs">
            {/* Pages per sheet & Page order in a compact row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                  Pages per sheet:
                </label>
                <div className="flex items-center gap-1">
                  <select
                    value={
                      isCustomActive
                        ? 'custom'
                        : settings.layoutMode === 'id-card' || settings.layoutMode === '2-up'
                        ? 2
                        : settings.layoutMode === '4-up'
                        ? 4
                        : settings.layoutMode === '6-up'
                        ? 6
                        : settings.layoutMode === '8-up'
                        ? 8
                        : settings.layoutMode === '9-up'
                        ? 9
                        : settings.layoutMode === '16-up'
                        ? 16
                        : 2
                    }
                    onChange={(e) => handlePagesPerSheetChange(e.target.value)}
                    className="w-full h-7 px-2 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold cursor-pointer"
                  >
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                    <option value={8}>8</option>
                    <option value={9}>9</option>
                    <option value={16}>16</option>
                    <option value="custom">Custom...</option>
                  </select>

                  {isCustomActive && (
                    <div className="flex items-center gap-0.5 shrink-0 font-mono text-xs">
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={customCols}
                        onChange={(e) => {
                          const c = Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1));
                          onChange({
                            ...settings,
                            layoutMode: 'custom',
                            customCols: c,
                            customRows,
                            pagesPerSheet: c * customRows,
                          });
                        }}
                        className="w-9 h-7 px-1 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-center text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        title="Columns"
                      />
                      <span className="text-zinc-400 font-bold">x</span>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={customRows}
                        onChange={(e) => {
                          const r = Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1));
                          onChange({
                            ...settings,
                            layoutMode: 'custom',
                            customCols,
                            customRows: r,
                            pagesPerSheet: customCols * r,
                          });
                        }}
                        className="w-9 h-7 px-1 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-center text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        title="Rows"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Page Order: Horizontal vs Vertical */}
              <div className="space-y-0.5">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                  Page order:
                </label>
                <select
                  value={settings.pageOrder || 'horizontal'}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      pageOrder: e.target.value as 'horizontal' | 'vertical',
                    })
                  }
                  className="w-full h-7 px-2 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold cursor-pointer"
                >
                  <option value="horizontal">Horizontal (Left to Right)</option>
                  <option value="vertical">Vertical (Top to Bottom)</option>
                </select>
              </div>
            </div>

            {/* Checkboxes: Print page border & Fit to frame in single compact row */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <label
                className={`h-7 px-2.5 rounded-md border flex items-center gap-2 cursor-pointer select-none transition-all ${
                  settings.drawBorder
                    ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-950/25 text-blue-900 dark:text-blue-100 font-medium'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={settings.drawBorder}
                  onChange={(e) => onChange({ ...settings, drawBorder: e.target.checked })}
                  className="h-3.5 w-3.5 rounded text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
                />
                <span className="flex items-center gap-1.5 text-xs truncate">
                  <Scissors className="w-3 h-3 text-zinc-400 shrink-0" />
                  <span className="truncate">Print page border</span>
                </span>
              </label>

              <label
                className={`h-7 px-2.5 rounded-md border flex items-center gap-2 cursor-pointer select-none transition-all ${
                  settings.fitMode === 'fill'
                    ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-950/25 text-blue-900 dark:text-blue-100 font-medium'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={settings.fitMode === 'fill'}
                  onChange={(e) =>
                    onChange({ ...settings, fitMode: e.target.checked ? 'fill' : 'fit' })
                  }
                  className="h-3.5 w-3.5 rounded text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
                />
                <span className="text-xs truncate font-medium" title="Match size uniformly across all slots without deforming or cropping content">
                  Fit to frame (Match size)
                </span>
              </label>
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: MODE (BOOKLET & POSTER) --- */}
        {activeTab === 'mode' && (
          <div className="pt-0.5 space-y-2.5 text-xs">
            {/* Sub-Switch: Booklet vs Poster */}
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setModeType('booklet');
                  onChange({
                    ...settings,
                    layoutMode: 'booklet',
                    pagesPerSheet: 2,
                  });
                }}
                className={`h-6.5 px-2 text-center text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  modeType === 'booklet'
                    ? 'bg-white text-zinc-950 dark:bg-zinc-800 dark:text-white shadow-2xs border border-zinc-200 dark:border-zinc-700'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                <span>📖 Booklet</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModeType('poster');
                  onChange({
                    ...settings,
                    layoutMode: 'poster',
                    pagesPerSheet: 1,
                  });
                }}
                className={`h-6.5 px-2 text-center text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  modeType === 'poster'
                    ? 'bg-white text-zinc-950 dark:bg-zinc-800 dark:text-white shadow-2xs border border-zinc-200 dark:border-zinc-700'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                <span>🖼️ Poster</span>
              </button>
            </div>

            {/* Sub-Panel: Booklet */}
            {modeType === 'booklet' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Booklet subset:</label>
                    <select
                      value={settings.bookletSubset || 'both'}
                      onChange={(e) => onChange({ ...settings, bookletSubset: e.target.value as 'both' | 'front' | 'back' })}
                      className="w-full h-7 px-2 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold cursor-pointer"
                    >
                      <option value="both">Both sides (Book)</option>
                      <option value="front">Front side only</option>
                      <option value="back">Back side only</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Binding:</label>
                    <select
                      value={settings.bookletBinding || 'left'}
                      onChange={(e) => onChange({ ...settings, bookletBinding: e.target.value as 'left' | 'right' })}
                      className="w-full h-7 px-2 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold cursor-pointer"
                    >
                      <option value="left">Left / Center fold</option>
                      <option value="right">Right / Center fold</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Panel: Poster */}
            {modeType === 'poster' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-zinc-600 dark:text-zinc-400 font-medium">Tile Scale:</span>
                  <div className="flex items-center h-6.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/80 overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = parseInt(posterScale, 10) || 100;
                        const next = Math.max(10, cur - 5);
                        setPosterScale(String(next));
                        updateTargetScale(next);
                      }}
                      className="w-7 h-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-sm cursor-pointer select-none transition-colors"
                      title="Decrease scale by 5%"
                    >
                      -
                    </button>
                    <div className="flex items-center px-1 bg-white dark:bg-zinc-900 h-full border-x border-zinc-300 dark:border-zinc-700">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={posterScale}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setPosterScale(val);
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed)) updateTargetScale(parsed);
                        }}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => {
                          const parsed = parseInt(posterScale, 10);
                          const clamped = isNaN(parsed) ? 100 : Math.max(10, Math.min(500, parsed));
                          setPosterScale(String(clamped));
                          updateTargetScale(clamped);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-9 h-full bg-transparent font-mono text-xs text-center font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none"
                      />
                      <span className="text-zinc-400 text-[10px] font-mono">%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = parseInt(posterScale, 10) || 100;
                        const next = Math.min(500, cur + 5);
                        setPosterScale(String(next));
                        updateTargetScale(next);
                      }}
                      className="w-7 h-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-sm cursor-pointer select-none transition-colors"
                      title="Increase scale by 5%"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- TAB CONTENT: TEXT (CANVA TEXT & WATERMARK OVERLAY) --- */}
        {activeTab === 'text' && (() => {
          const rawItems = getTextOverlayItems(settings.textOverlay);
          const defaultFirstItem: TextOverlayItem = {
            id: 'item-1',
            text: settings.textOverlay?.text || 'PROJECT REPORT',
            position: settings.textOverlay?.position || 'custom',
            customX: settings.textOverlay?.customX ?? 50,
            customY: settings.textOverlay?.customY ?? 50,
            fontFamily: settings.textOverlay?.fontFamily || 'sans',
            fontSize: settings.textOverlay?.fontSize || 'md',
            customFontSize: settings.textOverlay?.customFontSize || 28,
            color: settings.textOverlay?.color || '#111827',
            opacity: settings.textOverlay?.opacity ?? 1.0,
            applyTo: settings.textOverlay?.applyTo || 'all_pages',
          };

          const items = rawItems.length > 0 ? rawItems : [defaultFirstItem];
          const activeItemId = settings.textOverlay?.activeItemId || items[0].id;
          const activeItem: TextOverlayItem = items.find((it) => it.id === activeItemId) || items[0];

          const isEnabled = settings.textOverlay?.enabled ?? false;

          const updateItems = (newItems: TextOverlayItem[], newActiveId?: string) => {
            const currentActiveId = newActiveId || activeItemId;
            const currentActive = newItems.find((it) => it.id === currentActiveId) || newItems[0];
            onChange({
              ...settings,
              textOverlay: {
                enabled: isEnabled,
                items: newItems,
                activeItemId: currentActive?.id,
                text: currentActive?.text || '',
                position: currentActive?.position || 'custom',
                customX: currentActive?.customX ?? 50,
                customY: currentActive?.customY ?? 50,
                fontFamily: currentActive?.fontFamily || 'sans',
                fontSize: currentActive?.fontSize || 'md',
                customFontSize: currentActive?.customFontSize || 28,
                color: currentActive?.color || '#111827',
                opacity: currentActive?.opacity ?? 1.0,
                applyTo: currentActive?.applyTo || 'all_pages',
              },
            });
          };

          const updateActiveItem = (patch: Partial<TextOverlayItem>) => {
            const updatedItems = items.map((it) => (it.id === activeItem.id ? { ...it, ...patch } : it));
            updateItems(updatedItems, activeItem.id);
          };

          const setEnabled = (enabled: boolean) => {
            onChange({
              ...settings,
              textOverlay: {
                ...(settings.textOverlay || {}),
                enabled,
                items,
                activeItemId: activeItem.id,
              },
            });
          };

          return (
            <div className="pt-0.5 space-y-2.5 text-xs">
              {/* CLEAN DOCUMENT TEXT OVERLAY CARD */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-2.5 sm:p-3 space-y-2.5">
                {/* Clean Header & Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlignLeft className="w-3.5 h-3.5 text-blue-500" />
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                      Add Text to Document
                    </span>
                  </div>

                  {/* Clean Toggle */}
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all dark:border-zinc-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {isEnabled && (
                  <div className="space-y-2.5 pt-0.5 animate-fade-in-up">
                    {/* Multi-Text Selectors & Add Text Button */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                      {items.map((item, idx) => (
                        <div
                          key={item.id}
                          onClick={() => updateItems(items, item.id)}
                          className={`flex items-center h-6.5 px-2 rounded-md border text-xs cursor-pointer select-none transition-all ${
                            item.id === activeItem.id
                              ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-xs'
                              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                          }`}
                        >
                          <span className="truncate max-w-[90px]">
                            {item.text?.trim() ? item.text.split('\n')[0] : `Text ${idx + 1}`}
                          </span>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const remaining = items.filter((it) => it.id !== item.id);
                                updateItems(remaining, remaining[0]?.id);
                              }}
                              className="ml-1.5 opacity-70 hover:opacity-100 hover:text-red-300 text-[11px] font-bold cursor-pointer"
                              title="Delete text"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}

                      {/* + Add Text Button */}
                      <button
                        type="button"
                        onClick={() => {
                          const newItem: TextOverlayItem = {
                            id: `text-${Date.now()}`,
                            text: 'TEXT ' + (items.length + 1),
                            position: 'custom',
                            customX: 50,
                            customY: Math.min(85, (activeItem.customY ?? 50) + 12),
                            fontFamily: activeItem.fontFamily || 'sans',
                            fontSize: activeItem.fontSize || 'md',
                            customFontSize: activeItem.customFontSize || 28,
                            color: '#111827',
                            opacity: 1.0,
                            applyTo: activeItem.applyTo || 'all_pages',
                          };
                          updateItems([...items, newItem], newItem.id);
                        }}
                        className="h-6.5 px-2 rounded-md border border-dashed border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 flex items-center gap-1 cursor-pointer shrink-0"
                        title="Add another text"
                      >
                        <span className="font-bold">+</span>
                        <span>Add Text</span>
                      </button>
                    </div>

                    {/* Multi-line Text Area */}
                    <div className="space-y-1">
                      <textarea
                        rows={2}
                        maxLength={250}
                        value={activeItem.text}
                        onChange={(e) => updateActiveItem({ text: e.target.value })}
                        placeholder="Type text here (press Enter for multiple lines)..."
                        className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-medium focus:outline-none focus:ring-1.5 focus:ring-blue-500 shadow-2xs resize-none leading-normal"
                      />
                      <div className="flex justify-between text-[10px] text-zinc-400 px-0.5">
                        <span>💡 Tip: Press <strong>Enter</strong> for multiple lines</span>
                        <span>{activeItem.text.length}/250</span>
                      </div>
                    </div>

                    {/* Position & Font Style */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">Position:</label>
                        <select
                          value={activeItem.position}
                          onChange={(e) => {
                            const newPos = e.target.value as TextPosition;
                            updateActiveItem({
                              position: newPos,
                              opacity: newPos === 'watermark' ? 0.18 : 1.0,
                              customX: activeItem.customX ?? 50,
                              customY: activeItem.customY ?? 50,
                            });
                          }}
                          className="w-full h-7 px-2 rounded-md bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer"
                        >
                          <option value="header">Top Header</option>
                          <option value="middle">Middle (Center Page)</option>
                          <option value="footer">Bottom Footer</option>
                          <option value="cover_title">Cover Title</option>
                          <option value="watermark">Watermark (Diagonal)</option>
                          <option value="custom">Custom (Drag on Paper)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">Font Family:</label>
                        <select
                          value={activeItem.fontFamily}
                          onChange={(e) =>
                            updateActiveItem({
                              fontFamily: e.target.value as TextOverlayItem['fontFamily'],
                            })
                          }
                          className="w-full h-7 px-2 rounded-md bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer"
                        >
                          <option value="sans">Modern Sans</option>
                          <option value="serif">Classic Serif</option>
                          <option value="mono">Typewriter Mono</option>
                          <option value="display">Impact Display (Bold)</option>
                          <option value="handwriting">Elegant Script</option>
                          <option value="geometric">Geometric Tech</option>
                        </select>
                      </div>
                    </div>

                    {/* Coordinates Indicator when Custom Position is selected */}
                    {activeItem.position === 'custom' && (
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-blue-500/10 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-800 dark:text-blue-300">
                        <span className="font-medium flex items-center gap-1">
                          <span>🖐️ Drag text on sheet:</span>
                          <strong className="font-mono">
                            X: {activeItem.customX ?? 50}% · Y: {activeItem.customY ?? 50}%
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => updateActiveItem({ customX: 50, customY: 50 })}
                          className="text-[10px] underline font-semibold hover:text-blue-600 dark:hover:text-blue-200 cursor-pointer"
                        >
                          Center
                        </button>
                      </div>
                    )}

                    {/* Vibrant Text Color Palette & Native Color Picker */}
                    <div className="space-y-1.5 p-2 rounded-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">Text Color:</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-600 shadow-2xs inline-block"
                            style={{ backgroundColor: activeItem.color || '#111827' }}
                          />
                          <span className="font-mono font-bold text-xs text-zinc-900 dark:text-zinc-100 uppercase">
                            {activeItem.color || '#111827'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {[
                          { label: 'Black', hex: '#111827' },
                          { label: 'Charcoal', hex: '#374151' },
                          { label: 'Navy', hex: '#1e3a8a' },
                          { label: 'Royal Blue', hex: '#2563eb' },
                          { label: 'Cyan', hex: '#0284c7' },
                          { label: 'Crimson', hex: '#dc2626' },
                          { label: 'Wine Red', hex: '#991b1b' },
                          { label: 'Emerald', hex: '#059669' },
                          { label: 'Amber', hex: '#d97706' },
                          { label: 'Purple', hex: '#7c3aed' },
                          { label: 'Pink', hex: '#db2777' },
                          { label: 'White', hex: '#ffffff' },
                        ].map((c) => {
                          const isCur = (activeItem.color || '#111827').toLowerCase() === c.hex.toLowerCase();
                          return (
                            <button
                              key={c.hex}
                              type="button"
                              onClick={() => updateActiveItem({ color: c.hex })}
                              className={`w-5.5 h-5.5 rounded-full border transition-all cursor-pointer select-none ${
                                isCur
                                  ? 'scale-110 ring-2 ring-blue-500 ring-offset-1 border-white dark:border-zinc-900 shadow-xs'
                                  : 'border-zinc-300 dark:border-zinc-700 hover:scale-105'
                              }`}
                              style={{ backgroundColor: c.hex }}
                              title={`${c.label} (${c.hex})`}
                            />
                          );
                        })}

                        {/* Custom Native Color Picker */}
                        <label
                          className="relative w-5.5 h-5.5 rounded-full border border-dashed border-zinc-400 dark:border-zinc-600 flex items-center justify-center overflow-hidden cursor-pointer hover:border-blue-500 transition-colors shadow-2xs group"
                          title="Custom Color Picker"
                        >
                          <input
                            type="color"
                            value={activeItem.color || '#111827'}
                            onChange={(e) => updateActiveItem({ color: e.target.value })}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          />
                          <span className="text-[11px] leading-none select-none group-hover:scale-110 transition-transform">🎨</span>
                        </label>
                      </div>
                    </div>

                    {/* Size & Print Scope */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">Size Preset:</label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {(['sm', 'md', 'lg', 'custom'] as const).map((sz) => (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => {
                                  if (sz === 'custom') {
                                    updateActiveItem({
                                      fontSize: 'custom',
                                      customFontSize: activeItem.customFontSize || 28,
                                    });
                                  } else {
                                    const defaultPt = sz === 'sm' ? 12 : sz === 'md' ? 18 : 28;
                                    updateActiveItem({ fontSize: sz, customFontSize: defaultPt });
                                  }
                                }}
                                className={`h-7 rounded text-[11px] font-bold uppercase transition-all cursor-pointer ${
                                  activeItem.fontSize === sz
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                                }`}
                              >
                                {sz === 'custom' ? 'CUS' : sz}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">Print On:</label>
                          <select
                            value={activeItem.applyTo || 'all_pages'}
                            onChange={(e) =>
                              updateActiveItem({
                                applyTo: e.target.value as 'first_page' | 'all_pages' | 'last_page',
                              })
                            }
                            className="w-full h-7 px-2 rounded-md bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer"
                          >
                            <option value="all_pages">All Pages</option>
                            <option value="first_page">First Page Only</option>
                            <option value="last_page">Last Page Only</option>
                          </select>
                        </div>
                      </div>

                      {/* Professional Unlimited Font Size Stepper with - and + buttons */}
                      <div className="p-2 rounded-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            Custom Font Size Scale:
                          </span>
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                            {activeItem.customFontSize || (activeItem.fontSize === 'sm' ? 12 : activeItem.fontSize === 'md' ? 18 : activeItem.fontSize === 'lg' ? 28 : 28)} pt
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Decrease (-) button */}
                          <button
                            type="button"
                            title="Decrease text size"
                            onClick={() => {
                              const currentPt = activeItem.customFontSize || (activeItem.fontSize === 'sm' ? 12 : activeItem.fontSize === 'md' ? 18 : activeItem.fontSize === 'lg' ? 28 : 28);
                              const step = currentPt > 40 ? 5 : 2;
                              const nextPt = Math.max(6, currentPt - step);
                              updateActiveItem({
                                fontSize: 'custom',
                                customFontSize: nextPt,
                              });
                            }}
                            className="w-9 h-7 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center font-black text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer select-none"
                          >
                            −
                          </button>

                          {/* Direct numeric input without browser up/down arrows */}
                          <div className="flex-1 flex items-center justify-center h-7 px-2 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700">
                            <input
                              type="number"
                              min={6}
                              max={500}
                              value={activeItem.customFontSize || (activeItem.fontSize === 'sm' ? 12 : activeItem.fontSize === 'md' ? 18 : activeItem.fontSize === 'lg' ? 28 : 28)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  updateActiveItem({
                                    fontSize: 'custom',
                                    customFontSize: Math.max(4, Math.min(600, val)),
                                  });
                                }
                              }}
                              className="w-14 text-center font-mono font-bold text-xs bg-transparent text-zinc-900 dark:text-zinc-100 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase">pt</span>
                          </div>

                          {/* Increase (+) button */}
                          <button
                            type="button"
                            title="Increase text size"
                            onClick={() => {
                              const currentPt = activeItem.customFontSize || (activeItem.fontSize === 'sm' ? 12 : activeItem.fontSize === 'md' ? 18 : activeItem.fontSize === 'lg' ? 28 : 28);
                              const step = currentPt >= 40 ? 5 : 2;
                              const nextPt = Math.min(500, currentPt + step);
                              updateActiveItem({
                                fontSize: 'custom',
                                customFontSize: nextPt,
                              });
                            }}
                            className="w-9 h-7 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center font-black text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer select-none"
                          >
                            +
                          </button>

                          {/* Quick Scale Boosters */}
                          <button
                            type="button"
                            onClick={() => {
                              const currentPt = activeItem.customFontSize || 28;
                              updateActiveItem({
                                fontSize: 'custom',
                                customFontSize: Math.min(500, currentPt + 15),
                              });
                            }}
                            className="h-7 px-2 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 text-[10px] font-bold text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 active:scale-95 transition-all cursor-pointer"
                            title="Add +15pt"
                          >
                            +15
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
          </>
        )}
      </div>

      {/* BOX 2: SHEET ORIENTATION PANEL */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121216] p-2.5 sm:p-3 space-y-2.5 shadow-2xs transition-all">
        <button
          type="button"
          onClick={() => setIsOrientationOpen(!isOrientationOpen)}
          className="w-full flex items-center justify-between pb-1 border-b border-zinc-100 dark:border-zinc-800/70 text-left cursor-pointer group select-none"
        >
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full inline-block" />
            <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-xs tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              Sheet Orientation
            </h4>
          </div>
          <div className="flex items-center gap-1.5">
            {!isOrientationOpen && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40 font-semibold">
                {orientation.toUpperCase()} {settings.autoRotate ? '· Auto-rot' : ''}
              </span>
            )}
            <span className="text-[10px] text-zinc-400 font-medium hidden sm:inline">
              {isOrientationOpen ? 'Minimize' : 'Expand'}
            </span>
            {isOrientationOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-transform" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-transform" />
            )}
          </div>
        </button>

        {isOrientationOpen && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onOrientationChange('auto');
                  if (pageConfigs && onPageConfigsChange) {
                    onPageConfigsChange(pageConfigs.map((p) => ({ ...p, orientation: undefined })));
                  }
                }}
                className={`h-7 px-2.5 rounded-md border flex items-center gap-1.5 font-medium text-xs transition-all cursor-pointer ${
                  orientation === 'auto'
                    ? 'border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                }`}
                title="Automatically detect optimal sheet orientation for pages"
              >
                <span>⚙ Auto</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOrientationChange('portrait');
                  if (pageConfigs && onPageConfigsChange) {
                    onPageConfigsChange(pageConfigs.map((p) => ({ ...p, orientation: 'portrait' as const })));
                  }
                }}
                className={`h-7 px-2.5 rounded-md border flex items-center gap-1.5 font-medium text-xs transition-all cursor-pointer ${
                  orientation === 'portrait'
                    ? 'border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                }`}
              >
                <span>▯ Portrait</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOrientationChange('landscape');
                  if (pageConfigs && onPageConfigsChange) {
                    onPageConfigsChange(pageConfigs.map((p) => ({ ...p, orientation: 'landscape' as const })));
                  }
                }}
                className={`h-7 px-2.5 rounded-md border flex items-center gap-1.5 font-medium text-xs transition-all cursor-pointer ${
                  orientation === 'landscape'
                    ? 'border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                }`}
              >
                <span>▭ Landscape</span>
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-xs text-zinc-700 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              <input
                type="checkbox"
                checked={settings.autoRotate ?? true}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    autoRotate: e.target.checked,
                  })
                }
                className="h-3.5 w-3.5 rounded text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
              />
              <span>Auto-rotate pages within sheet</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 3: Unified AdobePageSizing (Backwards compatible wrapper)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdobePageSizingProps extends AdobePageHandlingProps, AdobePagesToPrintProps {}

export function AdobePageSizing(props: AdobePageSizingProps) {
  return (
    <div className="space-y-2">
      <AdobePagesToPrint {...props} />
      <AdobePageHandling {...props} />
    </div>
  );
}
