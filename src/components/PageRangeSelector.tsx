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
    <div className="card-premium rounded-2xl p-4 border border-slate-200/80 dark:border-white/8 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <ListFilter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span>Pages to Print</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all ${
              selectedCount === totalPages
                ? 'text-emerald-700 bg-emerald-50 border-emerald-300 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/25'
                : 'text-amber-700 bg-amber-50 border-amber-300 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/25'
            }`}
          >
            {selectedCount} / {totalPages} pages
          </span>
        </div>
      </div>

      {/* Quick Preset Pills */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: `All (${totalPages})`, handler: applyPresetAll, active: selectedCount === totalPages },
          { label: 'Odd Pages', handler: applyPresetOdd, active: false },
          { label: 'Even Pages', handler: applyPresetEven, active: false },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={preset.handler}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 ${
              preset.active
                ? 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-sm dark:border-indigo-400/60 dark:bg-indigo-600/25 dark:text-white dark:shadow-indigo-500/20'
                : 'border-slate-200 bg-slate-100/80 text-slate-600 hover:border-indigo-400 hover:text-slate-900 dark:border-white/8 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:border-indigo-500/40 dark:hover:text-slate-200 dark:hover:bg-white/5'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Interactive Page Chip Grid (for docs ≤ 60 pages) */}
      {totalPages <= 60 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
            <span>Tap a page chip to include or exclude it:</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={applyPresetAll}
                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => applyPages([1])}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 font-semibold transition-colors"
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
                  className={`h-7 min-w-[30px] px-2 rounded-lg text-xs font-mono font-bold transition-all duration-100 flex items-center justify-center gap-0.5 select-none ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/40 border border-indigo-400/50 scale-105'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 hover:border-slate-300 hover:text-slate-700 line-through dark:bg-slate-900/70 dark:text-slate-500 dark:border-white/5 dark:hover:border-white/20 dark:hover:text-slate-300 decoration-slate-400 dark:decoration-slate-600'
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
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
          <span>Or type a custom range:</span>
          <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">e.g. 1-3, 5, 8-10</span>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="e.g. 1-3, 5"
            value={rangeInput}
            onChange={(e) => handleRangeInputChange(e.target.value)}
            className={`w-full bg-slate-50 dark:bg-slate-950/80 border rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-none transition-all pr-8 ${
              !validationResult.isValid
                ? 'border-rose-400 focus:border-rose-500 bg-rose-50/50 dark:border-rose-500/80 dark:bg-rose-950/10'
                : 'border-slate-300 dark:border-white/10 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-950'
            }`}
          />
          {rangeInput && rangeInput.toLowerCase() !== 'all' && (
            <button
              type="button"
              onClick={applyPresetAll}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
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
