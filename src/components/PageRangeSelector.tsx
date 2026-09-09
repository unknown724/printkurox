'use client';

import React, { useState, useEffect } from 'react';
import { Check, X, AlertCircle, ListFilter } from 'lucide-react';
import { parsePageRange, pagesToRangeString, validatePageRangeInput } from '@/lib/pdf-utils';
import { PageConfig } from '@/lib/pricing';

interface PageRangeSelectorProps {
  totalPages: number;
  pageConfigs?: PageConfig[];
  onPageConfigsChange?: (configs: PageConfig[]) => void;
  pageRangeType: 'all' | 'custom';
  customPageRange: string;
  onRangeChange: (type: 'all' | 'custom', rangeStr: string) => void;
}

export function PageRangeSelector({
  totalPages,
  pageConfigs,
  onPageConfigsChange,
  pageRangeType,
  customPageRange,
  onRangeChange,
}: PageRangeSelectorProps) {
  const [rangeInput, setRangeInput] = useState(
    pageRangeType === 'all' ? 'All' : customPageRange || 'All'
  );
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    pages: number[];
    error?: string;
  }>({ isValid: true, pages: Array.from({ length: totalPages }, (_, i) => i + 1) });

  // Sync when parent changes
  useEffect(() => {
    if (pageRangeType === 'all') {
      setRangeInput('All');
      setValidationResult({
        isValid: true,
        pages: Array.from({ length: totalPages }, (_, i) => i + 1),
      });
    } else {
      setRangeInput(customPageRange);
      setValidationResult(validatePageRangeInput(customPageRange, totalPages));
    }
  }, [pageRangeType, customPageRange, totalPages]);

  const activePageNumbers: number[] = pageConfigs
    ? pageConfigs.filter((p) => p.included).map((p) => p.pageNumber)
    : validationResult.isValid
    ? validationResult.pages
    : [];

  const selectedCount = activePageNumbers.length;

  const applyPages = (pages: number[]) => {
    const isAll = pages.length === totalPages;
    const rangeStr = isAll ? 'All' : pagesToRangeString(pages);
    setRangeInput(rangeStr);
    setValidationResult({ isValid: true, pages });
    onRangeChange(isAll ? 'all' : 'custom', rangeStr);

    if (pageConfigs && onPageConfigsChange) {
      onPageConfigsChange(
        pageConfigs.map((cfg) => ({ ...cfg, included: pages.includes(cfg.pageNumber) }))
      );
    }
  };

  const applyPresetAll = () =>
    applyPages(Array.from({ length: totalPages }, (_, i) => i + 1));

  const applyPresetOdd = () => {
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i += 2) pages.push(i);
    applyPages(pages);
  };

  const applyPresetEven = () => {
    const pages: number[] = [];
    for (let i = 2; i <= totalPages; i += 2) pages.push(i);
    applyPages(pages);
  };

  const togglePageNumber = (pageNum: number) => {
    let newPages: number[];
    if (activePageNumbers.includes(pageNum)) {
      newPages = activePageNumbers.filter((p) => p !== pageNum);
    } else {
      newPages = [...activePageNumbers, pageNum].sort((a, b) => a - b);
    }
    if (newPages.length === 0) newPages = [pageNum];
    applyPages(newPages);
  };

  const handleRangeInputChange = (rawVal: string) => {
    setRangeInput(rawVal);
    const result = validatePageRangeInput(rawVal, totalPages);
    setValidationResult(result);

    if (result.isValid && result.pages.length > 0) {
      const isAll = result.pages.length === totalPages;
      onRangeChange(isAll ? 'all' : 'custom', isAll ? 'All' : rawVal);

      if (pageConfigs && onPageConfigsChange) {
        onPageConfigsChange(
          pageConfigs.map((cfg) => ({
            ...cfg,
            included: result.pages.includes(cfg.pageNumber),
          }))
        );
      }
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
            <ListFilter className="w-3.5 h-3.5" />
          </div>
          <span>Pages to Print</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-md border transition-all ${
              selectedCount === totalPages
                ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800/50'
                : 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800/50'
            }`}
          >
            {selectedCount} of {totalPages} pages selected
          </span>
        </div>
      </div>

      {/* Quick Preset Pills */}
      {(() => {
        const isAllSelected = selectedCount === totalPages;
        const isOddSelected = !isAllSelected && selectedCount === Math.ceil(totalPages / 2) && activePageNumbers.every((p) => p % 2 === 1);
        const isEvenSelected = !isAllSelected && selectedCount === Math.floor(totalPages / 2) && activePageNumbers.every((p) => p % 2 === 0);

        return (
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: `All (${totalPages})`, handler: applyPresetAll, active: isAllSelected },
              { label: 'Odd Pages', handler: applyPresetOdd, active: isOddSelected },
              { label: 'Even Pages', handler: applyPresetEven, active: isEvenSelected },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={preset.handler}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                  preset.active
                    ? 'border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Interactive Page Chip Grid (for docs ≤ 60 pages) */}
      {totalPages <= 60 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-500 px-0.5">
            <span>Tap a page to include or exclude:</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={applyPresetAll}
                className="text-zinc-700 dark:text-zinc-300 hover:underline font-medium transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => applyPages([1])}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                Only P1
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto py-1 scrollbar-thin">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              const isSelected = activePageNumbers.includes(pageNum);
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => togglePageNumber(pageNum)}
                  title={
                    isSelected
                      ? `Page ${pageNum} included — click to exclude`
                      : `Page ${pageNum} excluded — click to include`
                  }
                  className={`h-7 min-w-[30px] px-2 rounded-md text-xs font-mono font-medium transition-all duration-100 flex items-center justify-center gap-0.5 select-none ${
                    isSelected
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                      : 'bg-zinc-100 text-zinc-400 border border-zinc-200 hover:bg-zinc-200 line-through dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700 dark:hover:bg-zinc-700'
                  }`}
                >
                  <span>{pageNum}</span>
                  {isSelected && <Check className="w-2.5 h-2.5 shrink-0 stroke-[3]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Text Range Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-zinc-500 px-0.5">
          <span>Or type a custom range:</span>
          <span className="text-zinc-400 font-mono text-[10px]">e.g. 1-3, 5, 8-10</span>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="e.g. 1-3, 5"
            value={rangeInput}
            onChange={(e) => handleRangeInputChange(e.target.value)}
            className={`w-full bg-zinc-50 dark:bg-zinc-900/80 border rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-mono focus:outline-none transition-all pr-8 ${
              !validationResult.isValid
                ? 'border-rose-400 focus:border-rose-500 bg-rose-50/50 dark:border-rose-800/80 dark:bg-rose-950/10'
                : 'border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 focus:bg-white dark:focus:bg-zinc-900'
            }`}
          />
          {rangeInput && rangeInput.toLowerCase() !== 'all' && (
            <button
              type="button"
              onClick={applyPresetAll}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 transition-colors"
              title="Reset to All pages"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Validation Status */}
        {!validationResult.isValid ? (
          <div className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 px-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{validationResult.error || 'Invalid page range format.'}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px] px-1">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <Check className="w-3 h-3" />
              Printing{' '}
              <strong className="text-slate-900 dark:text-white font-mono">
                {validationResult.pages.length === totalPages
                  ? `All (${totalPages})`
                  : pagesToRangeString(validationResult.pages)}
              </strong>
            </span>
            {validationResult.pages.length < totalPages && (
              <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                {totalPages - validationResult.pages.length} skipped
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
