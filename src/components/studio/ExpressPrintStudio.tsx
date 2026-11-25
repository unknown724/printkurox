'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Minus,
  Plus,
  Copy,
  Palette,
  ListFilter,
  AlertCircle,
  SlidersHorizontal,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { FileUpload, UploadedBatchData } from '@/components/FileUpload';
import { PrintSettingsState } from '@/components/PrintSettings';
import { CostSummary } from '@/components/CostSummary';
import { SimplePagePreview } from './SimplePagePreview';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { HostelSelectorModal } from '@/components/HostelSelectorModal';
import { PricingResult, PageConfig, TIER_RATES, CustomTierRates, PROMO_TIER_RATES } from '@/lib/pricing';
import { validatePageRangeInput, pagesToRangeString } from '@/lib/pdf-utils';
import { getStationConfig } from '@/lib/stations';
import { useHostelChangeSetting } from '@/lib/useHostelChangeSetting';
import { usePrinterStatus } from '@/lib/usePrinterStatus';

interface ExpressPrintStudioProps {
  uploadedBatch: UploadedBatchData | null;
  onBatchUploaded: (data: UploadedBatchData | null) => void;
  pageConfigs: PageConfig[];
  onPageConfigsChange: (updated: PageConfig[]) => void;
  settings: PrintSettingsState;
  onSettingsChange: (settings: PrintSettingsState) => void;
  pricing: PricingResult;
  bwCount: number;
  colorCount: number;
  onRangeChange: (type: 'all' | 'custom', rangeStr: string) => void;
  stationId?: string;
  onStationSelect?: (stationId: string) => void;
  stationTierRates?: CustomTierRates;
  promoCode?: string;
  onPromoCodeChange?: (code: string) => void;
  onSwitchToAdvanced: () => void;
}

export function ExpressPrintStudio({
  uploadedBatch,
  onBatchUploaded,
  pageConfigs,
  onPageConfigsChange,
  settings,
  onSettingsChange,
  pricing,
  bwCount,
  colorCount,
  onRangeChange,
  stationId,
  onStationSelect,
  stationTierRates,
  promoCode,
  onPromoCodeChange,
  onSwitchToAdvanced,
}: ExpressPrintStudioProps) {
  const [showStationModal, setShowStationModal] = useState(false);
  const { hostelChangeEnabled } = useHostelChangeSetting();
  const currentStation = getStationConfig(stationId || 'block_b');
  const { online: printerOnline } = usePrinterStatus(30_000, currentStation.id);

  const totalPages = uploadedBatch?.totalPages || 0;
  const [rangeInput, setRangeInput] = useState(
    settings.pageRangeType === 'all' ? 'All' : settings.customPageRange || '1'
  );
  const [rangeError, setRangeError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (settings.pageRangeType === 'all') {
        setRangeInput('All');
        setRangeError(null);
      } else if (settings.customPageRange && settings.customPageRange !== 'All') {
        setRangeInput(settings.customPageRange);
      }
    });
  }, [settings.pageRangeType, settings.customPageRange, totalPages]);

  const activeTiers = pricing?.promoApplied ? PROMO_TIER_RATES : (stationTierRates || TIER_RATES);
  const bwRate = activeTiers.standard.bw.single;
  const colorRate = activeTiers.standard.color.single;

  const selectedCount = pageConfigs.length > 0
    ? pageConfigs.filter((p) => p.included).length
    : totalPages;

  const handleSelectAllPages = () => {
    if (!totalPages) return;
    const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);
    setRangeInput('All');
    setRangeError(null);
    onRangeChange('all', 'All');
    if (pageConfigs.length > 0) {
      onPageConfigsChange(
        pageConfigs.map((cfg) => ({ ...cfg, included: allPages.includes(cfg.pageNumber) }))
      );
    }
  };

  const handleEnableCustomRange = () => {
    if (!totalPages) return;
    const currentSelected = pageConfigs.filter((p) => p.included).map((p) => p.pageNumber);
    const seed = currentSelected.length > 0 && currentSelected.length < totalPages
      ? pagesToRangeString(currentSelected)
      : `1-${totalPages}`;
    setRangeInput(seed);
    setRangeError(null);
    onRangeChange('custom', seed);
  };

  const handleRangeTextChange = (rawVal: string) => {
    setRangeInput(rawVal);
    if (!totalPages) return;

    const trimmed = rawVal.trim();
    if (!trimmed) {
      setRangeError('Enter page numbers like 1-5 or 1, 3, 5');
      return;
    }

    const result = validatePageRangeInput(trimmed, totalPages);
    if (!result.isValid || result.pages.length === 0) {
      setRangeError(result.error || `Use pages between 1 and ${totalPages}`);
      return;
    }

    setRangeError(null);
    const isAll = result.pages.length === totalPages;
    onRangeChange(isAll ? 'all' : 'custom', isAll ? 'All' : trimmed);
    onPageConfigsChange(
      pageConfigs.map((cfg) => ({
        ...cfg,
        included: result.pages.includes(cfg.pageNumber),
      }))
    );
  };

  const updateCopies = (nextCopies: number) => {
    onSettingsChange({
      ...settings,
      copies: Math.min(50, Math.max(1, nextCopies)),
    });
  };

  return (
    <div className="space-y-3.5 animate-fade-in-up">
      {/* Express Header + Compact Station Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50/80 dark:bg-white/[0.03] backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Building2 className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                {currentStation.name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 font-semibold">
                {printerOnline ? 'Ready' : 'Standby'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">
                ₹{bwRate} B&amp;W · ₹{colorRate} Color
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20">
            <Zap className="w-3 h-3" />
            Simple Mode
          </span>
          {hostelChangeEnabled && (
            <button
              type="button"
              onClick={() => setShowStationModal(true)}
              className="h-8 px-2.5 rounded-xl border border-zinc-200 dark:border-white/15 bg-white dark:bg-white/[0.06] hover:bg-zinc-100 dark:hover:bg-white/[0.12] text-zinc-800 dark:text-zinc-100 text-xs font-semibold cursor-pointer transition-colors"
            >
              Change
            </button>
          )}
        </div>
      </div>

      {/* Step 1: Upload File (Always accessible) */}
      <FileUpload
        uploadedBatch={uploadedBatch}
        onBatchUploaded={onBatchUploaded}
      />

      {/* Step 2 & 3 Combined on Single Screen once File is Uploaded */}
      {uploadedBatch && (
        <div className="space-y-3 animate-fade-in-up">
          {/* Lightweight Live Print Preview (reflects B&W/Color & Custom Pages) */}
          <SimplePagePreview
            totalPages={uploadedBatch.totalPages}
            fileKey={uploadedBatch.fileKey}
            downloadUrl={uploadedBatch.downloadUrl}
            rawFiles={uploadedBatch.rawFiles}
            pageConfigs={pageConfigs}
            onPageConfigsChange={onPageConfigsChange}
            colorMode={settings.colorMode}
          />

          {/* Quick Options Card: Color + Copies + Custom Pages */}
          <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141419]/95 p-3.5 sm:p-4 space-y-3.5 shadow-xs">
            {/* 1. Color Mode */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  <span>Print Color</span>
                </span>
                {settings.colorMode === 'custom' && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                    Mixed ({bwCount} B&amp;W + {colorCount} Color)
                  </span>
                )}
              </div>

              <SegmentedControl
                value={settings.colorMode === 'custom' ? 'bw' : settings.colorMode}
                onChange={(val) =>
                  onSettingsChange({
                    ...settings,
                    colorMode: val as 'bw' | 'color',
                  })
                }
                options={[
                  {
                    value: 'bw',
                    label: 'Black & White',
                    badge: `₹${bwRate}/pg`,
                    activeClassName:
                      'bg-white text-zinc-950 dark:bg-white/[0.14] dark:text-white border border-zinc-300 dark:border-white/25 shadow-xs font-bold',
                  },
                  {
                    value: 'color',
                    label: 'Full Color',
                    badge: `₹${colorRate}/pg`,
                    activeClassName:
                      'bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-blue-500/20 text-pink-600 dark:text-pink-300 border border-pink-500 font-bold',
                  },
                ]}
              />
            </div>

            {/* 2. Number of Copies */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                <span>Number of Copies</span>
              </span>

              <div className="flex items-center space-x-1.5 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => updateCopies(settings.copies - 1)}
                  disabled={settings.copies <= 1}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200/80 dark:border-zinc-600 disabled:opacity-30 flex items-center justify-center text-zinc-800 dark:text-zinc-100 cursor-pointer active:scale-95"
                  aria-label="Decrease copies"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono px-2.5 tabular-nums min-w-[2.25rem] text-center">
                  {settings.copies}
                </span>
                <button
                  type="button"
                  onClick={() => updateCopies(settings.copies + 1)}
                  disabled={settings.copies >= 50}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200/80 dark:border-zinc-600 disabled:opacity-30 flex items-center justify-center text-zinc-800 dark:text-zinc-100 cursor-pointer active:scale-95"
                  aria-label="Increase copies"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 3. Custom Pages Selection */}
            <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <ListFilter className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  <span>Pages to Print</span>
                </span>
                <span className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  {selectedCount} of {totalPages} selected
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllPages}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    settings.pageRangeType === 'all'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs'
                      : 'bg-zinc-50 dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  All Pages (1–{totalPages})
                </button>
                <button
                  type="button"
                  onClick={handleEnableCustomRange}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    settings.pageRangeType === 'custom'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-xs'
                      : 'bg-zinc-50 dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  Custom Pages
                </button>
              </div>

              {settings.pageRangeType === 'custom' && (
                <div className="space-y-1.5 pt-1">
                  <input
                    type="text"
                    value={rangeInput}
                    onChange={(e) => handleRangeTextChange(e.target.value)}
                    placeholder={`e.g. 1-3, 5 (max ${totalPages})`}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 ${
                      rangeError
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-zinc-200 dark:border-white/15 focus:ring-amber-500 focus:border-amber-500'
                    }`}
                  />
                  {rangeError ? (
                    <p className="text-[11px] text-rose-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{rangeError}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Example: <code className="font-mono">1-4</code> or <code className="font-mono">1, 3, 5-7</code>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 4. Express Checkout & Pay */}
          <CostSummary
            compact
            pricing={pricing}
            fileKey={uploadedBatch.fileKey}
            fileName={uploadedBatch.fileName}
            totalPages={uploadedBatch.totalPages}
            pageRange={settings.pageRangeType === 'all' ? 'All' : settings.customPageRange}
            pageConfigs={pageConfigs}
            layoutMode="1-up"
            orientation="auto"
            autoRotate
            stationId={stationId}
            customScale={100}
            fitMode="fit"
            drawBorder={false}
            onOpenStationModal={hostelChangeEnabled ? () => setShowStationModal(true) : undefined}
            promoCode={promoCode}
            onPromoCodeChange={onPromoCodeChange}
          />
        </div>
      )}

      {/* Subtle Switch to Advanced Mode */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="truncate">Need double-sided, N-up slides, page preview, or promo code?</span>
        <button
          type="button"
          onClick={onSwitchToAdvanced}
          className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>Advanced Mode</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {hostelChangeEnabled && (
        <HostelSelectorModal
          isOpen={showStationModal}
          onClose={() => setShowStationModal(false)}
          currentStationId={stationId}
          onStationSelect={(id) => {
            if (onStationSelect) {
              onStationSelect(id);
            }
            setShowStationModal(false);
          }}
        />
      )}
    </div>
  );
}
